package dev.mufify.audiotags

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build

/**
 * Sample rate, bit depth and channel count, read from the track format.
 *
 * `MediaMetadataRetriever` only reports sample rate and bit depth from API 31,
 * so on anything older the spec strip lost exactly the fields this app exists
 * to show — a hi-res library on an Android 10 phone displayed no rate and no
 * depth at all. `MediaExtractor` has carried them since API 16.
 *
 * It is also the only source for channel count, which the retriever has no key
 * for at any level.
 *
 * One extra file open per track during stage two. Stage two already opens
 * every file, runs in batches off the UI thread, and only touches rows it has
 * not enriched yet — so this costs a rescan, not a launch.
 */
data class AudioFormat(
  val sampleRateHz: Int?,
  val bitDepth: Int?,
  val channels: Int?,
)

object AudioFormatReader {

  private val EMPTY = AudioFormat(null, null, null)

  fun read(context: Context, uriString: String): AudioFormat {
    val extractor = MediaExtractor()

    return try {
      extractor.setDataSource(context, Uri.parse(uriString), null)
      audioTrackFormat(extractor)?.let(::fromFormat) ?: EMPTY
    } catch (error: Exception) {
      // A file the extractor will not open is not a scan failure — the
      // retriever may still have read its tags. Missing fields are expected.
      EMPTY
    } finally {
      runCatching { extractor.release() }
    }
  }

  /** The first audio track. A music video carries video tracks too. */
  private fun audioTrackFormat(extractor: MediaExtractor): MediaFormat? {
    for (index in 0 until extractor.trackCount) {
      val format = runCatching { extractor.getTrackFormat(index) }.getOrNull() ?: continue
      val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
      if (mime.startsWith("audio/")) return format
    }
    return null
  }

  private fun fromFormat(format: MediaFormat): AudioFormat =
    AudioFormat(
      sampleRateHz = format.intOrNull(MediaFormat.KEY_SAMPLE_RATE),
      bitDepth = bitDepthOf(format),
      channels = format.intOrNull(MediaFormat.KEY_CHANNEL_COUNT),
    )

  /**
   * Bit depth, which the format states in two different ways.
   *
   * FLAC and WAV expose `KEY_PCM_ENCODING`, an `AudioFormat.ENCODING_*`
   * constant rather than a number of bits. Lossy codecs expose neither, and
   * that is correct: an MP3 has no bit depth, so reporting one would be an
   * invention.
   */
  private fun bitDepthOf(format: MediaFormat): Int? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      format.intOrNull(MediaFormat.KEY_PCM_ENCODING)?.let { encoding ->
        PCM_ENCODING_BITS[encoding]?.let { return it }
      }
    }
    // Some FLAC extractors publish the real depth under a vendor key instead.
    return format.intOrNull("bits-per-sample")
  }

  private val PCM_ENCODING_BITS = mapOf(
    // AudioFormat.ENCODING_PCM_8BIT / 16BIT / FLOAT / 24BIT_PACKED / 32BIT.
    3 to 8,
    2 to 16,
    4 to 32,
    21 to 24,
    22 to 32,
  )

  private fun MediaFormat.intOrNull(key: String): Int? =
    runCatching { if (containsKey(key)) getInteger(key) else null }.getOrNull()?.takeIf { it > 0 }
}
