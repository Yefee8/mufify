package dev.mufify.audiotags

/**
 * Pure arithmetic behind the spec strip and the artwork pipeline.
 *
 * Deliberately free of any Android import so it runs as a plain JVM unit test
 * — no device, no emulator. Everything that can be decided without touching a
 * file lives here.
 */
object SpecMath {

  /**
   * Average bitrate in kbps.
   *
   * FLAC is variable bitrate and the container usually reports nothing, so the
   * honest number is `fileSize * 8 / duration`. A reported value is preferred
   * when it agrees with that — for constant-bitrate files it is the exact
   * figure rather than an average over a container's overhead.
   *
   * But it is only preferred when it *agrees*. A reported value can be plainly
   * wrong while still looking reasonable in isolation: a 5.1 MB file lasting
   * 5:10 averages 138 kbps, and the retriever reported 32, which passed a
   * "is it a plausible bitrate" check and rendered on the spec strip. The size
   * and the duration are facts; the reported bitrate is a claim. When the
   * claim contradicts the facts by more than a wide margin, the facts win.
   */
  fun bitrateKbps(reportedBitsPerSecond: Long?, fileSizeBytes: Long, durationMs: Long): Int? {
    val computed =
      if (fileSizeBytes > 0L && durationMs > 0L) {
        // bytes * 8 = bits; bits per millisecond is already kilobits per second.
        ((fileSizeBytes * 8L) / durationMs).toInt().takeIf { it in PLAUSIBLE_KBPS }
      } else {
        null
      }

    val reported = reportedBitsPerSecond?.let { (it / 1000L).toInt() }?.takeIf { it in PLAUSIBLE_KBPS }

    if (reported == null) return computed
    if (computed == null) return reported

    // Generous: container overhead, embedded artwork and ID3 padding all make
    // the file bigger than the audio, so the two legitimately differ. Only a
    // disagreement past this is evidence the reported value is not describing
    // this file.
    val agrees = reported.toDouble() in (computed * MIN_AGREEMENT)..(computed * MAX_AGREEMENT)
    return if (agrees) reported else computed
  }

  private val PLAUSIBLE_KBPS = 1..50_000
  private const val MIN_AGREEMENT = 0.5
  private const val MAX_AGREEMENT = 2.0

  /**
   * MediaStore packs disc and track into `TRACK` as `disc * 1000 + track`
   * when the file carries a disc number, and as a bare track number when it
   * does not.
   *
   * Returns disc to track. A value under 1000 has no disc information, which
   * is different from disc 1 — hence null rather than 1.
   */
  fun unpackTrackNumber(raw: Int?): Pair<Int?, Int?> {
    if (raw == null || raw <= 0) return null to null
    if (raw < 1000) return null to raw

    val disc = raw / 1000
    val track = raw % 1000
    return disc to (if (track == 0) null else track)
  }

  /**
   * Parse a track or disc number as tags actually write them.
   *
   * `METADATA_KEY_CD_TRACK_NUMBER` very often comes back as `"3/12"` — the
   * position and the total, exactly as ID3's TRCK frame stores it. A plain
   * integer parse returns null for that, which silently drops the track number
   * on most real files. Found on device: two tagged MP3s, both with a null
   * `track_no`.
   */
  fun parsePosition(raw: String?): Int? {
    val head = raw?.trim()?.substringBefore('/')?.trim() ?: return null
    val value = head.toIntOrNull() ?: return null
    return if (value > 0) value else null
  }

  /**
   * Power-of-two subsampling factor for `BitmapFactory`, so a multi-megapixel
   * cover is never fully decoded just to be shrunk.
   */
  fun inSampleSize(width: Int, height: Int, target: Int): Int {
    if (width <= 0 || height <= 0 || target <= 0) return 1

    var sample = 1
    var longestEdge = maxOf(width, height)
    while (longestEdge / 2 >= target) {
      longestEdge /= 2
      sample *= 2
    }
    return sample
  }

  /**
   * Whether a codec is lossless. Drives the spec strip's one visual
   * distinction — an audience that keeps FLAC rips wants that told apart at a
   * glance.
   */
  fun isLossless(mimeType: String?): Boolean {
    val mime = mimeType?.lowercase() ?: return false
    return LOSSLESS_HINTS.any { mime.contains(it) }
  }

  private val LOSSLESS_HINTS = listOf("flac", "alac", "wav", "x-wav", "aiff", "ape", "wavpack")
}
