package dev.mufify.audioeq

import android.media.audiofx.Equalizer
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The platform equaliser, attached to the player's audio session.
 *
 * `android.media.audiofx.Equalizer` is an effect bound to one audio session,
 * so this needs the id of the session ExoPlayer is playing on — see the
 * `audioSessionId` property added to expo-audio in `patches/`. Session 0, the
 * global output mix, is not a substitute: it has been restricted since Android
 * 9 and an effect attached to it is accepted and then silently ignored.
 *
 * **Bands are the device's, not ours.** The number of bands, their centre
 * frequencies and the range of gain all come from the hardware and differ
 * between phones — five bands is usual, but not guaranteed. A preset is
 * therefore a curve expressed in the app's own terms and mapped onto whatever
 * this device has, in `services/equalizer`, rather than a fixed list of
 * sliders that would be wrong on half the devices that run it.
 */
class AudioEqModule : Module() {

  private var equalizer: Equalizer? = null
  private var sessionId: Int? = null

  /** What the app last asked for, so a rebuilt effect comes back the same. */
  private var enabled = false
  private var levels: List<Int> = emptyList()

  override fun definition() = ModuleDefinition {
    Name("AudioEq")

    /**
     * Point the equaliser at a session, building it if the session is new.
     *
     * Returns what this device can do, so the settings screen renders the
     * bands that exist rather than a guess. Called again with the same id is
     * cheap and does nothing — the engine hands the id over on every track.
     */
    AsyncFunction("attach") { audioSessionId: Int ->
      if (audioSessionId == 0) throw NoSessionException()
      if (sessionId != audioSessionId || equalizer == null) {
        release()
        // Priority 0: this app's own session, so there is nothing to outrank.
        val created = Equalizer(0, audioSessionId)
        equalizer = created
        sessionId = audioSessionId

        // A session is new after a player is rebuilt, and the settings must
        // survive that without the user touching anything.
        created.enabled = enabled
        applyLevels(created, levels)
      }
      capabilities()
    }

    /** What this device's equaliser can do. Null when nothing is attached. */
    AsyncFunction("getCapabilities") {
      if (equalizer == null) null else capabilities()
    }

    AsyncFunction("setEnabled") { value: Boolean ->
      enabled = value
      equalizer?.enabled = value
      value
    }

    /**
     * Set every band at once, in millibels.
     *
     * One call rather than one per band: dragging a slider would otherwise
     * cross the bridge on every frame, and a preset would arrive as five
     * separate writes that the effect applies one at a time.
     */
    AsyncFunction("setBandLevels") { millibels: List<Int> ->
      levels = millibels
      val target = equalizer
      if (target != null) applyLevels(target, millibels)
      true
    }

    /** Let go of the effect. The session it was attached to has gone away. */
    AsyncFunction("release") {
      release()
      true
    }

    OnDestroy { release() }
  }

  private fun applyLevels(target: Equalizer, millibels: List<Int>) {
    if (millibels.isEmpty()) return

    val bands = target.numberOfBands.toInt()
    val range = target.bandLevelRange
    val minimum = range[0].toInt()
    val maximum = range[1].toInt()

    for (band in 0 until bands) {
      val wanted = millibels.getOrNull(band) ?: continue
      // Out of range throws rather than saturating, and the app's curve is
      // written in its own terms without knowing this device's limits.
      val clamped = wanted.coerceIn(minimum, maximum)
      runCatching { target.setBandLevel(band.toShort(), clamped.toShort()) }
    }
  }

  private fun capabilities(): Map<String, Any?> {
    val target = equalizer ?: return mapOf("bands" to emptyList<Any>())
    val bandCount = target.numberOfBands.toInt()
    val range = target.bandLevelRange

    return mapOf(
      "minLevelMb" to range[0].toInt(),
      "maxLevelMb" to range[1].toInt(),
      "bands" to (0 until bandCount).map { band ->
        mapOf(
          // Centre frequencies come back in millihertz.
          "centerHz" to target.getCenterFreq(band.toShort()) / 1000,
          "levelMb" to target.getBandLevel(band.toShort()).toInt(),
        )
      },
    )
  }

  private fun release() {
    runCatching { equalizer?.release() }
    equalizer = null
    sessionId = null
  }
}

/**
 * Thrown when the player has no session yet.
 *
 * A real state rather than a failure: nothing has played, so there is no
 * session to attach to. The caller retries when a track loads.
 */
class NoSessionException :
  CodedException("The player has no audio session yet — nothing has played.")
