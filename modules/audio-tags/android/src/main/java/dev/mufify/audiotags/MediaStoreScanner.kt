package dev.mufify.audiotags

import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.os.Build
import android.provider.MediaStore

/**
 * Enumerates audio via a single ContentResolver cursor.
 *
 * This exists because `expo-media-library`'s current API exposes one async
 * getter per field, which for a 10,000-track library is 30,000+ bridge calls,
 * and because neither its old nor its new API returns file size — which the
 * spec strip needs and the incremental rescan keys on.
 */
object MediaStoreScanner {

  private val BASE_COLUMNS = arrayOf(
    MediaStore.Audio.Media._ID,
    MediaStore.Audio.Media.DISPLAY_NAME,
    MediaStore.Audio.Media.TITLE,
    MediaStore.Audio.Media.ARTIST,
    MediaStore.Audio.Media.ALBUM,
    MediaStore.Audio.Media.DURATION,
    MediaStore.Audio.Media.SIZE,
    MediaStore.Audio.Media.DATE_ADDED,
    MediaStore.Audio.Media.DATE_MODIFIED,
    MediaStore.Audio.Media.MIME_TYPE,
    MediaStore.Audio.Media.TRACK,
    MediaStore.Audio.Media.YEAR,
  )

  /** ALBUM_ARTIST and GENRE only became queryable columns in API 30. */
  private val API_30_COLUMNS = arrayOf(
    MediaStore.Audio.Media.ALBUM_ARTIST,
    MediaStore.Audio.Media.GENRE,
  )

  private fun projection(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BASE_COLUMNS + API_30_COLUMNS
    else BASE_COLUMNS

  private fun collection() =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    else MediaStore.Audio.Media.EXTERNAL_CONTENT_URI

  /**
   * `IS_MUSIC` keeps ringtones, notifications and alarms out. A duration
   * floor drops the stray one-second files that clutter a real device.
   */
  private fun selection(minDurationMs: Int): Pair<String, Array<String>> =
    if (minDurationMs > 0) {
      "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= ?" to
        arrayOf(minDurationMs.toString())
    } else {
      "${MediaStore.Audio.Media.IS_MUSIC} != 0" to emptyArray()
    }

  fun count(context: Context, minDurationMs: Int): Int {
    val (where, args) = selection(minDurationMs)
    context.contentResolver.query(
      collection(),
      arrayOf(MediaStore.Audio.Media._ID),
      where,
      args,
      null,
    )?.use { cursor -> return cursor.count }
    return 0
  }

  fun query(
    context: Context,
    limit: Int,
    offset: Int,
    minDurationMs: Int,
  ): List<Map<String, Any?>> {
    val (where, args) = selection(minDurationMs)
    // Ordered by _ID so paging stays stable while a scan is in flight.
    val order = "${MediaStore.Audio.Media._ID} ASC LIMIT $limit OFFSET $offset"

    val results = mutableListOf<Map<String, Any?>>()
    context.contentResolver.query(collection(), projection(), where, args, order)?.use { cursor ->
      while (cursor.moveToNext()) results.add(readRow(cursor))
    }
    return results
  }

  private fun readRow(cursor: Cursor): Map<String, Any?> {
    val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID))

    return mapOf(
      "mediaStoreId" to id.toString(),
      "uri" to ContentUris.withAppendedId(collectionForRow(), id).toString(),
      "displayName" to cursor.stringOr(MediaStore.Audio.Media.DISPLAY_NAME).orEmpty(),
      "title" to cursor.stringOr(MediaStore.Audio.Media.TITLE),
      "artist" to cursor.stringOr(MediaStore.Audio.Media.ARTIST),
      "album" to cursor.stringOr(MediaStore.Audio.Media.ALBUM),
      "albumArtist" to cursor.stringOr(MediaStore.Audio.Media.ALBUM_ARTIST),
      "genre" to cursor.stringOr(MediaStore.Audio.Media.GENRE),
      "durationMs" to (cursor.longOr(MediaStore.Audio.Media.DURATION) ?: 0L),
      "size" to (cursor.longOr(MediaStore.Audio.Media.SIZE) ?: 0L),
      // MediaStore keeps these in seconds; the rest of the app is in millis.
      "dateAdded" to ((cursor.longOr(MediaStore.Audio.Media.DATE_ADDED) ?: 0L) * 1000L),
      "dateModified" to ((cursor.longOr(MediaStore.Audio.Media.DATE_MODIFIED) ?: 0L) * 1000L),
      "mimeType" to cursor.stringOr(MediaStore.Audio.Media.MIME_TYPE),
      "trackNumberRaw" to cursor.intOr(MediaStore.Audio.Media.TRACK),
      "year" to cursor.intOr(MediaStore.Audio.Media.YEAR),
    )
  }

  private fun collectionForRow() =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    else MediaStore.Audio.Media.EXTERNAL_CONTENT_URI

  /*
   * Columns absent from the projection return -1 rather than throwing, so a
   * device without ALBUM_ARTIST simply yields null instead of failing the
   * whole scan.
   */
  private fun Cursor.stringOr(column: String): String? {
    val index = getColumnIndex(column)
    return if (index < 0 || isNull(index)) null else getString(index)
  }

  private fun Cursor.longOr(column: String): Long? {
    val index = getColumnIndex(column)
    return if (index < 0 || isNull(index)) null else getLong(index)
  }

  private fun Cursor.intOr(column: String): Int? {
    val index = getColumnIndex(column)
    return if (index < 0 || isNull(index)) null else getInt(index)
  }
}
