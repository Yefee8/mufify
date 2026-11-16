package dev.mufify.widgets

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** One row of the queue, as the now-playing widget lists it. */
internal data class QueueRow(
  /** Where it is in the queue when the snapshot was taken. */
  val index: Int,
  /** What was there: the app checks it before jumping, in case the queue moved. */
  val trackId: Long,
  val title: String,
  val artist: String,
)

/** What the now-playing widget shows. Written by the app on every change that shows. */
internal data class NowPlaying(
  val hasTrack: Boolean,
  val title: String,
  val artist: String,
  val artworkPath: String?,
  val playing: Boolean,
  val upNext: List<QueueRow>,
) {
  companion object {
    val EMPTY = NowPlaying(false, "", "", null, false, emptyList())

    fun parse(json: String?): NowPlaying {
      val root = json?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return EMPTY
      val rows = root.optJSONArray("upNext") ?: JSONArray()
      return NowPlaying(
        hasTrack = root.optBoolean("hasTrack"),
        title = root.optString("title"),
        artist = root.optString("artist"),
        artworkPath = root.optStringOrNull("artworkPath"),
        playing = root.optBoolean("playing"),
        upNext = (0 until rows.length()).mapNotNull { i ->
          val row = rows.optJSONObject(i) ?: return@mapNotNull null
          QueueRow(row.optInt("index"), row.optLong("trackId"), row.optString("title"), row.optString("artist"))
        },
      )
    }
  }
}

/** Something a collection widget can start: the library, liked songs, a playlist. */
internal data class CollectionEntry(
  /** `library`, `liked` or `playlist:<id>` — what the app is told to play. */
  val key: String,
  val name: String,
  /** "128 tracks", already in the app's language. */
  val meta: String,
  val artworkPath: String?,
  /** The app route that opens it, `playlist/12`; null for the library's own tab. */
  val link: String?,
) {
  val kind: String
    get() = key.substringBefore(':')

  companion object {
    fun parseList(json: String?): List<CollectionEntry> {
      val rows = json?.let { runCatching { JSONArray(it) }.getOrNull() } ?: return emptyList()
      return (0 until rows.length()).mapNotNull { i ->
        val row = rows.optJSONObject(i) ?: return@mapNotNull null
        val key = row.optString("key")
        if (key.isEmpty()) return@mapNotNull null
        CollectionEntry(
          key = key,
          name = row.optString("name"),
          meta = row.optString("meta"),
          artworkPath = row.optStringOrNull("artworkPath"),
          link = row.optStringOrNull("link"),
        )
      }
    }
  }
}

/**
 * The app's theme and words, for surfaces the app does not draw.
 *
 * The language is the app's, not the phone's: Mufify can be set to Turkish on
 * an English phone, and a widget that switched languages at the home screen
 * would look like someone else's.
 */
internal data class Appearance(val theme: String, private val strings: Map<String, String>) {
  /** The app's word for `key`, or the bundled one until the app has said. */
  fun text(context: Context, key: String, fallback: Int): String =
    strings[key]?.takeIf { it.isNotEmpty() } ?: context.getString(fallback)

  companion object {
    val DEFAULT = Appearance("system", emptyMap())

    fun parse(json: String?): Appearance {
      val root = json?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return DEFAULT
      val strings = root.optJSONObject("strings")
      val map = buildMap {
        strings?.keys()?.forEach { key -> put(key, strings.optString(key)) }
      }
      return Appearance(root.optString("theme", "system"), map)
    }
  }
}

/** A press the app was not running to receive, kept until it is. */
internal data class WidgetAction(
  val type: String,
  val collection: String? = null,
  val index: Int = -1,
  val trackId: Long = -1,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "type" to type,
    "collection" to collection,
    "index" to index,
    "trackId" to trackId.toDouble(),
  )

  fun toJson(at: Long): String = JSONObject()
    .put("type", type)
    .put("collection", collection ?: JSONObject.NULL)
    .put("index", index)
    .put("trackId", trackId)
    .put("at", at)
    .toString()
}

/**
 * Everything the widgets know, in one SharedPreferences file.
 *
 * The app writes; the widgets only read. A widget is drawn by the launcher at
 * times the app does not choose — a reboot, a resize, the launcher's own
 * restart — often with the app not running, so it has to be able to draw from
 * what was last written without asking anyone.
 */
internal class WidgetStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  val nowPlaying: NowPlaying
    get() = NowPlaying.parse(prefs.getString(KEY_NOW_PLAYING, null))

  val collections: List<CollectionEntry>
    get() = CollectionEntry.parseList(prefs.getString(KEY_COLLECTIONS, null))

  val appearance: Appearance
    get() = Appearance.parse(prefs.getString(KEY_APPEARANCE, null))

  /** True when it changed — the widgets are redrawn only then. */
  fun setNowPlaying(json: String): Boolean = write(KEY_NOW_PLAYING, json)

  fun setCollections(json: String): Boolean = write(KEY_COLLECTIONS, json)

  fun setAppearance(json: String): Boolean = write(KEY_APPEARANCE, json)

  fun collectionFor(widgetId: Int): String? = prefs.getString(widgetKey(widgetId), null)

  fun setCollectionFor(widgetId: Int, key: String) {
    prefs.edit().putString(widgetKey(widgetId), key).apply()
  }

  fun forget(widgetIds: IntArray) {
    val editor = prefs.edit()
    widgetIds.forEach { editor.remove(widgetKey(it)) }
    editor.apply()
  }

  fun setPendingAction(action: WidgetAction) {
    // Committed, not applied: the process may be about to start the app's
    // activity and be busy for a second, and this is what that launch reads.
    prefs.edit().putString(KEY_PENDING, action.toJson(System.currentTimeMillis())).commit()
  }

  /**
   * The press that opened the app, once, if it was recent.
   *
   * Recent, because a press that never got answered — the launch failed, the
   * phone was locked — must not start music the next time the app is opened
   * for some other reason, maybe days later.
   */
  fun takePendingAction(): String? {
    val json = prefs.getString(KEY_PENDING, null) ?: return null
    prefs.edit().remove(KEY_PENDING).commit()
    val at = runCatching { JSONObject(json).optLong("at") }.getOrDefault(0L)
    return json.takeIf { System.currentTimeMillis() - at in 0..PENDING_FRESH_MS }
  }

  private fun write(key: String, json: String): Boolean {
    if (prefs.getString(key, null) == json) return false
    prefs.edit().putString(key, json).apply()
    return true
  }

  private fun widgetKey(widgetId: Int) = "collection.$widgetId"

  private companion object {
    const val FILE = "mufify_widgets"
    const val KEY_NOW_PLAYING = "nowPlaying"
    const val KEY_COLLECTIONS = "collections"
    const val KEY_APPEARANCE = "appearance"
    const val KEY_PENDING = "pendingAction"
    const val PENDING_FRESH_MS = 60_000L
  }
}

private fun JSONObject.optStringOrNull(key: String): String? =
  if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
