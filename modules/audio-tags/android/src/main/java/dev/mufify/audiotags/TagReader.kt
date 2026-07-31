package dev.mufify.audiotags

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import java.io.File

/**
 * Reads tags and technical fields from one file with `MediaMetadataRetriever`.
 *
 * Every field is optional, and `SpecStrip` renders whatever it got rather
 * than treating absence as an error.
 *
 * Sample rate, bit depth and channel count come from `AudioFormatReader`
 * rather than from here: the retriever only reports the first two from API 31
 * and has no key for the third, which left a hi-res library on an Android 10
 * phone showing no rate and no depth at all.
 */
object TagReader {

  fun read(
    context: Context,
    uriString: String,
    artworkDirectory: File,
    artworkSize: Int,
    thumbnailSize: Int,
  ): Map<String, Any?> {
    val retriever = MediaMetadataRetriever()

    return try {
      retriever.setDataSource(context, Uri.parse(uriString))

      val durationMs = retriever.longOf(MediaMetadataRetriever.METADATA_KEY_DURATION)
      val fileSize = fileSizeOf(context, uriString)
      val reportedBitrate = retriever.longOf(MediaMetadataRetriever.METADATA_KEY_BITRATE)

      // Tags write this as "3" or as "3/12"; both have to work.
      val trackRaw = SpecMath.parsePosition(
        retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER),
      )
      val discRaw = SpecMath.parsePosition(
        retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_DISC_NUMBER),
      )
      val (packedDisc, track) = SpecMath.unpackTrackNumber(trackRaw)

      // Sample rate, bit depth and channels come from the track format, not
      // the retriever: the retriever only has the first two from API 31, and
      // has no key for channels at all.
      val format = AudioFormatReader.read(context, uriString)

      val artwork = ArtworkExtractor.write(
        retriever.embeddedPicture,
        artworkDirectory,
        artworkSize,
        thumbnailSize,
      )

      mapOf(
        "uri" to uriString,
        "title" to retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_TITLE),
        "artist" to retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_ARTIST),
        "album" to retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_ALBUM),
        "albumArtist" to retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST),
        "genre" to retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_GENRE),
        "trackNumberRaw" to track,
        "discNumber" to (discRaw ?: packedDisc),
        "year" to retriever.intOf(MediaMetadataRetriever.METADATA_KEY_YEAR),
        "durationMs" to durationMs,
        "bitrateKbps" to SpecMath.bitrateKbps(reportedBitrate, fileSize, durationMs ?: 0L),
        "sampleRateHz" to (format.sampleRateHz ?: sampleRate(retriever)),
        "bitDepth" to (format.bitDepth ?: bitDepth(retriever)),
        "channels" to format.channels,
        "mimeType" to retriever.stringOf(MediaMetadataRetriever.METADATA_KEY_MIMETYPE),
        "artworkPath" to artwork.full,
        "artworkThumbPath" to artwork.thumb,
        "error" to null,
      )
    } catch (error: Exception) {
      // One unreadable file must not abort a scan of ten thousand.
      failure(uriString, error.message ?: error::class.java.simpleName)
    } finally {
      runCatching { retriever.release() }
    }
  }

  private fun failure(uri: String, message: String): Map<String, Any?> = mapOf(
    "uri" to uri,
    "title" to null,
    "artist" to null,
    "album" to null,
    "albumArtist" to null,
    "genre" to null,
    "trackNumberRaw" to null,
    "discNumber" to null,
    "year" to null,
    "durationMs" to null,
    "bitrateKbps" to null,
    "sampleRateHz" to null,
    "bitDepth" to null,
    "channels" to null,
    "mimeType" to null,
    "artworkPath" to null,
    "artworkThumbPath" to null,
    "error" to message,
  )

  /**
   * API 31+, and only a fallback now — `AudioFormatReader` answers this at
   * every API level. Kept because an extractor that refuses a file may still
   * leave the retriever able to read it.
   */
  private fun sampleRate(retriever: MediaMetadataRetriever): Int? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
      retriever.intOf(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE)
    else null

  /** API 31+. Fallback, as above. */
  private fun bitDepth(retriever: MediaMetadataRetriever): Int? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
      retriever.intOf(MediaMetadataRetriever.METADATA_KEY_BITS_PER_SAMPLE)
    else null

  private fun fileSizeOf(context: Context, uriString: String): Long {
    val uri = Uri.parse(uriString)
    return runCatching {
      context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: 0L
    }.getOrDefault(0L)
  }

  private fun MediaMetadataRetriever.stringOf(key: Int): String? =
    extractMetadata(key)?.takeIf { it.isNotBlank() }

  private fun MediaMetadataRetriever.longOf(key: Int): Long? =
    extractMetadata(key)?.toLongOrNull()

  private fun MediaMetadataRetriever.intOf(key: Int): Int? =
    extractMetadata(key)?.toIntOrNull()
}
