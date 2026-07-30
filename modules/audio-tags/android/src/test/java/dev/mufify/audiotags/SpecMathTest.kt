package dev.mufify.audiotags

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JVM tests — no device, no emulator. Run with:
 *   cd android && ./gradlew :audio-tags:testDebugUnitTest
 */
class SpecMathTest {

  @Test
  fun `prefers a sane reported bitrate`() {
    // 1,411 kbps CD-quality PCM, reported in bits per second.
    assertEquals(1411, SpecMath.bitrateKbps(1_411_000L, 0L, 0L))
  }

  @Test
  fun `computes the average when nothing is reported`() {
    // 30 MB over 180 s -> 30e6 * 8 / 180 = ~1,333 kbps.
    assertEquals(1333, SpecMath.bitrateKbps(null, 30_000_000L, 180_000L))
  }

  @Test
  fun `falls back when the reported value is absurd`() {
    // A wrong number on the spec strip is worse than a missing one.
    assertEquals(1333, SpecMath.bitrateKbps(999_999_999_999L, 30_000_000L, 180_000L))
    assertEquals(1333, SpecMath.bitrateKbps(0L, 30_000_000L, 180_000L))
  }

  @Test
  fun `gives up rather than dividing by zero`() {
    assertNull(SpecMath.bitrateKbps(null, 30_000_000L, 0L))
    assertNull(SpecMath.bitrateKbps(null, 0L, 180_000L))
    assertNull(SpecMath.bitrateKbps(null, -1L, -1L))
  }

  @Test
  fun `reads a bare track number as having no disc`() {
    // 7 is track 7, not disc 0 track 7.
    assertEquals(null to 7, SpecMath.unpackTrackNumber(7))
  }

  @Test
  fun `unpacks the disc-times-1000 encoding`() {
    assertEquals(1 to 5, SpecMath.unpackTrackNumber(1005))
    assertEquals(2 to 11, SpecMath.unpackTrackNumber(2011))
    assertEquals(12 to 3, SpecMath.unpackTrackNumber(12003))
  }

  @Test
  fun `treats a disc with no track as track-unknown`() {
    assertEquals(3 to null, SpecMath.unpackTrackNumber(3000))
  }

  @Test
  fun `treats missing or nonsense track numbers as unknown`() {
    assertEquals(null to null, SpecMath.unpackTrackNumber(null))
    assertEquals(null to null, SpecMath.unpackTrackNumber(0))
    assertEquals(null to null, SpecMath.unpackTrackNumber(-4))
  }

  @Test
  fun `halves until the longest edge is within the target`() {
    assertEquals(1, SpecMath.inSampleSize(500, 500, 512))
    assertEquals(2, SpecMath.inSampleSize(1024, 1024, 512))
    assertEquals(4, SpecMath.inSampleSize(3000, 3000, 512))
    assertEquals(8, SpecMath.inSampleSize(4096, 4096, 512))
  }

  @Test
  fun `measures the longest edge on a non-square picture`() {
    assertEquals(4, SpecMath.inSampleSize(3000, 200, 512))
  }

  @Test
  fun `never returns a sample size below one`() {
    assertEquals(1, SpecMath.inSampleSize(0, 0, 512))
    assertEquals(1, SpecMath.inSampleSize(100, 100, 0))
  }

  @Test
  fun `separates lossless from lossy`() {
    assertTrue(SpecMath.isLossless("audio/flac"))
    assertTrue(SpecMath.isLossless("audio/x-wav"))
    assertTrue(SpecMath.isLossless("AUDIO/FLAC"))
    assertFalse(SpecMath.isLossless("audio/mpeg"))
    assertFalse(SpecMath.isLossless("audio/mp4"))
    assertFalse(SpecMath.isLossless(null))
  }
}
