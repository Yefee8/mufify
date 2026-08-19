package dev.mufify.audioeq

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The equaliser, attached to the player's audio session.
 *
 * The effect is bound to one audio session, so this needs the id of the session
 * ExoPlayer is playing on — see the `audioSessionId` property added to
 * expo-audio in `patches/`. Session 0, the global output mix, is not a
 * substitute: it has been restricted since Android 9 and an effect attached to
 * it is accepted and then silently ignored.
 *
 * **Ten bands where the platform allows.** `DynamicsProcessing` (API 28+) lets
 * the app declare its own bands, so it gets the ISO octave centres every
 * graphic equaliser has printed on it, identical on every device. Below that
 * the classic `Equalizer` supplies whatever the hardware has — usually five,
 * at frequencies the app does not choose. `EqualizerEngine` covers both, and
 * nothing above this module has to ask which one it got: the capabilities it
 * reports are what the screen draws.
 */
class AudioEqModule : Module() {

  private var engine: EqualizerEngine? = null
  private var sessionId: Int? = null

  /** What the app last asked for, so a rebuilt effect comes back the same. */
  private var enabled = false
  private var levels: List<Int> = emptyList()

  override fun definition() = ModuleDefinition {
    Name("AudioEq")

    /**
     * Point the equaliser at a session, building it if the session is new.
     *
     * Returns what this device can do, so the settings screen renders the bands
     * that exist rather than a guess. Called again with the same id is cheap
     * and does nothing — the engine hands the id over on every track.
     */
    AsyncFunction("attach") { audioSessionId: Int ->
      if (audioSessionId == 0) throw NoSessionException()
      if (sessionId != audioSessionId || engine == null) {
        release()

        /*
         * Ten bands first, five as the fallback — and the fallback is not only
         * for old versions. `DynamicsProcessing` is present from API 28 and can
         * still refuse to build on a device whose effects framework does not
         * implement it, which is a thing some OEM builds do. A working five-band
         * equaliser is a better answer to that than none.
         */
        val built = DynamicsEqualizer.create(audioSessionId)
          ?: LegacyEqualizer.create(audioSessionId)
          ?: throw NoSessionException()

        engine = built
        sessionId = audioSessionId

        // A session is new after a player is rebuilt, and the settings must
        // survive that without the user touching anything.
        built.setEnabled(enabled)
        if (levels.isNotEmpty()) built.setLevels(levels)
      }
      capabilities()
    }

    /** What this device's equaliser can do. Null when nothing is attached. */
    AsyncFunction("getCapabilities") {
      if (engine == null) null else capabilities()
    }

    AsyncFunction("setEnabled") { value: Boolean ->
      enabled = value
      engine?.setEnabled(value)
      value
    }

    /**
     * Set every band at once, in millibels.
     *
     * One call rather than one per band: dragging a slider would otherwise
     * cross the bridge on every frame, and a preset would arrive as ten
     * separate writes that the effect applies one at a time.
     */
    AsyncFunction("setBandLevels") { millibels: List<Int> ->
      levels = millibels
      engine?.setLevels(millibels)
      true
    }

    /** Let go of the effect. The session it was attached to has gone away. */
    AsyncFunction("release") {
      release()
      true
    }

    OnDestroy { release() }
  }

  private fun capabilities(): Map<String, Any?> {
    val target = engine ?: return mapOf("bands" to emptyList<Any>())
    val current = target.levels()

    return mapOf(
      "minLevelMb" to target.minLevelMb,
      "maxLevelMb" to target.maxLevelMb,
      "bands" to target.centerFrequencies.mapIndexed { index, hz ->
        mapOf("centerHz" to hz, "levelMb" to (current.getOrNull(index) ?: 0))
      },
    )
  }

  private fun release() {
    engine?.release()
    engine = null
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
