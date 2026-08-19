package dev.mufify.audioeq

import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.os.Build

/**
 * The two ways this app can equalise, behind one shape.
 *
 * `android.media.audiofx.Equalizer` is the one every Android app has always
 * used, and its bands belong to the *device*: how many, where they sit and how
 * far they move are all read from the hardware, and on nearly every phone that
 * means **five** bands at frequencies the app does not choose. That is enough
 * to shape a sound and not enough to do it precisely, and it is why the ten
 * bands people expect from a music player were not on offer.
 *
 * `DynamicsProcessing` (API 28+) inverts that: the app declares how many bands
 * it wants and where their edges are, and the platform builds the filters. Ten
 * bands at the ISO octave centres, the same on every device that has it, which
 * also makes a saved preset mean the same thing on two different phones.
 *
 * So: ten bands where the platform allows, the device's own where it does not,
 * and one interface above both so nothing upstream has to ask which it got.
 */
interface EqualizerEngine {
  /** ISO centres for ten bands, or whatever the device reports for five. */
  val centerFrequencies: List<Int>
  val minLevelMb: Int
  val maxLevelMb: Int
  fun levels(): List<Int>
  fun setEnabled(enabled: Boolean)
  fun setLevels(millibels: List<Int>)
  fun release()
}

/**
 * The ISO octave centres a ten-band equaliser is expected to have.
 *
 * These are the numbers printed on every hardware graphic EQ and every
 * software one that copies them, which matters more than any acoustic argument
 * for a different spacing: somebody who has used an equaliser before already
 * knows what the third slider does.
 */
val TEN_BAND_CENTERS = listOf(31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000)

/**
 * ±15dB, in millibels.
 *
 * `DynamicsProcessing` imposes no range of its own — it will take any gain and
 * distort cheerfully — so the limit is the app's to choose. Fifteen is what a
 * graphic EQ conventionally offers; the presets stay inside ±6, and the rest is
 * headroom for somebody who knows what they are doing.
 */
private const val LIMIT_MB = 1_500

/** Millibels per decibel. The platform APIs disagree about which they want. */
private const val MB_PER_DB = 100f

/**
 * Ten bands via `DynamicsProcessing`, API 28+.
 *
 * Only the pre-EQ stage is built. The multi-band compressor, the post-EQ and
 * the limiter are all switched off in the config: this is an equaliser, and a
 * compressor nobody asked for would change the dynamics of a mastered track in
 * ways that are hard to attribute and impossible to undo.
 *
 * Every channel gets the same curve. A graphic EQ that differed per channel
 * would be a balance control wearing the wrong name.
 */
class DynamicsEqualizer private constructor(
  private val processor: DynamicsProcessing,
  private val channels: Int,
) : EqualizerEngine {

  override val centerFrequencies = TEN_BAND_CENTERS
  override val minLevelMb = -LIMIT_MB
  override val maxLevelMb = LIMIT_MB

  private var gains = MutableList(TEN_BAND_CENTERS.size) { 0 }

  companion object {
    /** Null when the platform is too old, or refuses to build the effect. */
    fun create(sessionId: Int): DynamicsEqualizer? {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null

      val channels = 2
      val bands = TEN_BAND_CENTERS.size

      return runCatching {
        val config = DynamicsProcessing.Config.Builder(
          DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
          channels,
          /* preEqInUse = */ true,
          /* preEqBandCount = */ bands,
          /* mbcInUse = */ false,
          /* mbcBandCount = */ 0,
          /* postEqInUse = */ false,
          /* postEqBandCount = */ 0,
          /* limiterInUse = */ false,
        ).build()

        DynamicsEqualizer(DynamicsProcessing(0, sessionId, config), channels).also { it.layout() }
      }.getOrNull()
    }
  }

  /**
   * Give each band its slice of the spectrum.
   *
   * A band runs from the previous band's cutoff up to its own, so the cutoffs
   * are the *upper edges* of the octave bands rather than their centres —
   * centre + half an octave, which is centre × √2. The top band is pinned at
   * 20kHz so that nothing above 16k is left outside every band.
   */
  private fun layout() {
    for (channel in 0 until channels) {
      val eq = processor.getPreEqByChannelIndex(channel) ?: continue
      eq.isEnabled = true

      for (index in TEN_BAND_CENTERS.indices) {
        val band = eq.getBand(index) ?: continue
        band.isEnabled = true
        band.cutoffFrequency = upperEdge(index)
        band.gain = 0f
        eq.setBand(index, band)
      }
      processor.setPreEqByChannelIndex(channel, eq)
    }
  }

  private fun upperEdge(index: Int): Float {
    val center = TEN_BAND_CENTERS[index].toFloat()
    return if (index == TEN_BAND_CENTERS.lastIndex) 20_000f else center * 1.4142f
  }

  override fun levels(): List<Int> = gains.toList()

  override fun setEnabled(enabled: Boolean) {
    runCatching { processor.enabled = enabled }
  }

  override fun setLevels(millibels: List<Int>) {
    for (index in TEN_BAND_CENTERS.indices) {
      gains[index] = (millibels.getOrNull(index) ?: gains[index]).coerceIn(minLevelMb, maxLevelMb)
    }

    runCatching {
      for (channel in 0 until channels) {
        val eq = processor.getPreEqByChannelIndex(channel) ?: continue
        for (index in TEN_BAND_CENTERS.indices) {
          val band = eq.getBand(index) ?: continue
          // Decibels here, millibels everywhere else in this app. The platform
          // APIs disagree; the conversion belongs at the one edge that knows.
          band.gain = gains[index] / MB_PER_DB
          eq.setBand(index, band)
        }
        processor.setPreEqByChannelIndex(channel, eq)
      }
    }
  }

  override fun release() {
    runCatching { processor.release() }
  }
}

/**
 * The device's own bands, via the classic effect. API 26 and 27.
 *
 * Kept rather than dropped along with those versions: `minSdkVersion` is 26 by
 * decision (ADR 002), and an equaliser row that says "not on this phone" is a
 * worse answer than five bands.
 */
class LegacyEqualizer private constructor(private val equalizer: Equalizer) : EqualizerEngine {

  override val centerFrequencies =
    (0 until equalizer.numberOfBands.toInt()).map {
      // Centre frequencies come back in millihertz.
      equalizer.getCenterFreq(it.toShort()) / 1000
    }

  override val minLevelMb = equalizer.bandLevelRange[0].toInt()
  override val maxLevelMb = equalizer.bandLevelRange[1].toInt()

  companion object {
    fun create(sessionId: Int): LegacyEqualizer? =
      // Priority 0: this app's own session, so there is nothing to outrank.
      runCatching { LegacyEqualizer(Equalizer(0, sessionId)) }.getOrNull()
  }

  override fun levels(): List<Int> =
    centerFrequencies.indices.map { equalizer.getBandLevel(it.toShort()).toInt() }

  override fun setEnabled(enabled: Boolean) {
    runCatching { equalizer.enabled = enabled }
  }

  override fun setLevels(millibels: List<Int>) {
    for (band in centerFrequencies.indices) {
      val wanted = millibels.getOrNull(band) ?: continue
      // Out of range throws rather than saturating, and the app's curve is
      // written in its own terms without knowing this device's limits.
      val clamped = wanted.coerceIn(minLevelMb, maxLevelMb)
      runCatching { equalizer.setBandLevel(band.toShort(), clamped.toShort()) }
    }
  }

  override fun release() {
    runCatching { equalizer.release() }
  }
}
