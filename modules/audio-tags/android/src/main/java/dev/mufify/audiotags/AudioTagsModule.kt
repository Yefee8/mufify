package dev.mufify.audiotags

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * MediaStore enumeration, tag reading and artwork extraction.
 *
 * Replaces both `@missingcore/audio-metadata` — which cannot run on SDK 57 and
 * reads none of the technical fields — and `expo-media-library`'s enumeration,
 * whose per-field async getters do not scale and never expose file size. See
 * `docs/adr/004-kotlin-metadata-module.md`.
 */
class AudioTagsModule : Module() {

  private companion object {
    /** Long enough for a real folder, short enough not to look like a freeze. */
    const val SCAN_TIMEOUT_MS = 10_000L
  }

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  /**
   * `READ_MEDIA_AUDIO` only exists from API 33; before that the audio-reading
   * permission is `READ_EXTERNAL_STORAGE`. Both callers below branch on this,
   * so it lives in one place — requesting a permission the platform does not
   * have is an instant denial that looks exactly like a user saying no.
   */
  private fun audioPermission(): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_AUDIO
    else Manifest.permission.READ_EXTERNAL_STORAGE

  override fun definition() = ModuleDefinition {
    Name("AudioTags")

    AsyncFunction("hasAudioPermission") {
      ContextCompat.checkSelfPermission(context, audioPermission()) ==
        PackageManager.PERMISSION_GRANTED
    }

    /**
     * Show the system permission dialog and report what the user chose.
     *
     * Without this permission a MediaStore audio query does not fail — under
     * scoped storage it returns only the rows this app itself owns, which is
     * none of them. The scan then completes "successfully" with zero tracks
     * and the library falls back to its empty state, which reads as a broken
     * feature rather than a missing grant. So the request has to happen before
     * the first query, not be inferred from an empty result afterwards.
     *
     * `canAskAgain` is returned alongside because a permanent denial cannot be
     * fixed by asking again — that case has to send the user to system
     * settings instead, and only the caller knows how to say so.
     */
    AsyncFunction("requestAudioPermission") { promise: Promise ->
      val manager = appContext.permissions
      if (manager == null) {
        promise.resolve(mapOf("granted" to false, "canAskAgain" to false))
        return@AsyncFunction
      }

      val permission = audioPermission()
      manager.askForPermissions({ result ->
        val response: PermissionsResponse? = result[permission]
        promise.resolve(
          mapOf(
            "granted" to (response?.status == PermissionsStatus.GRANTED),
            "canAskAgain" to (response?.canAskAgain ?: false),
          ),
        )
      }, permission)
    }

    AsyncFunction("countAudioFiles") { minDurationMs: Int, pathPrefix: String? ->
      MediaStoreScanner.count(context, minDurationMs, pathPrefix)
    }

    AsyncFunction("queryAudioFiles") { options: Map<String, Any?> ->
      val limit = (options["limit"] as? Number)?.toInt() ?: 200
      val offset = (options["offset"] as? Number)?.toInt() ?: 0
      val minDuration = (options["minDurationMs"] as? Number)?.toInt() ?: 0
      // Present only for a folder import, which must index that folder alone.
      val pathPrefix = options["pathPrefix"] as? String

      MediaStoreScanner.query(context, limit, offset, minDuration, pathPrefix)
    }

    /**
     * Ask the platform to index these paths, and wait for it.
     *
     * MediaStore only knows about files its scanner has visited. A file copied
     * over USB, restored from a backup, or written by another app can sit on
     * disk for minutes — sometimes until reboot — before it appears in a
     * query. Every music player hits this, and the fix is to ask directly
     * rather than to wait and hope.
     *
     * Returns the URIs the scanner produced, so the caller can tell the
     * difference between "indexed, nothing new" and "the platform refused".
     */
    AsyncFunction("requestMediaScan") { paths: List<String>, promise: Promise ->
      if (paths.isEmpty()) {
        promise.resolve(emptyList<String>())
        return@AsyncFunction
      }

      val scanned = mutableListOf<String>()
      var remaining = paths.size
      var settled = false

      /*
       * The callback is not guaranteed to fire once per path. A path that does
       * not exist, or a directory on a device whose provider declines to walk
       * it, can be dropped silently — and then `remaining` never reaches zero
       * and this promise never settles. An unsettled promise is worse than a
       * failure here: the caller is awaiting it before it starts the scan, so
       * the screen would sit forever with no progress and no error to show.
       * Whatever arrived by the deadline is therefore good enough; indexing is
       * best-effort and the MediaStore sweep runs either way.
       */
      fun settle() {
        synchronized(scanned) {
          if (settled) return
          settled = true
          promise.resolve(scanned.toList())
        }
      }

      Handler(Looper.getMainLooper()).postDelayed(::settle, SCAN_TIMEOUT_MS)

      MediaScannerConnection.scanFile(context, paths.toTypedArray(), null) { _, uri ->
        synchronized(scanned) {
          if (uri != null) scanned.add(uri.toString())
          remaining -= 1
        }
        if (remaining == 0) settle()
      }
    }

    /**
     * Embedded lyrics for one file, or null.
     *
     * One file at a time, unlike `readTags`: this is asked for when a track
     * becomes the current one, not for a whole library, and only the metadata
     * at the head of the file is read. Storing lyrics for every track would
     * put megabytes of text in the database to answer a question the player
     * asks about one track at a time.
     */
    AsyncFunction("readLyrics") { uri: String ->
      LyricsReader.read(context, uri)
    }

    AsyncFunction("readTags") { uris: List<String>, options: Map<String, Any?> ->
      val directory = File(
        (options["artworkDirectory"] as? String)
          ?: File(context.cacheDir, "artwork").absolutePath,
      )
      val artworkSize = (options["artworkSize"] as? Number)?.toInt() ?: 512
      val thumbnailSize = (options["thumbnailSize"] as? Number)?.toInt() ?: 128

      uris.map { uri -> TagReader.read(context, uri, directory, artworkSize, thumbnailSize) }
    }
  }
}
