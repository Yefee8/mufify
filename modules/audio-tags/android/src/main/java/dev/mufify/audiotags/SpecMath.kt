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
   * when present and sane; anything absurd is treated as absent rather than
   * displayed, because a wrong number on the spec strip is worse than a
   * missing one.
   */
  fun bitrateKbps(reportedBitsPerSecond: Long?, fileSizeBytes: Long, durationMs: Long): Int? {
    reportedBitsPerSecond?.let { reported ->
      val kbps = (reported / 1000L).toInt()
      if (kbps in 1..50_000) return kbps
    }

    if (fileSizeBytes <= 0L || durationMs <= 0L) return null

    val kbps = (fileSizeBytes * 8L * 1000L) / (durationMs * 1000L)
    return if (kbps in 1..50_000) kbps.toInt() else null
  }

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
