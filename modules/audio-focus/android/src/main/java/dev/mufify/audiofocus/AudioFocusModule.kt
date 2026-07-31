package dev.mufify.audiofocus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Tells JavaScript when audio is about to start coming out of the speaker.
 *
 * Android broadcasts `ACTION_AUDIO_BECOMING_NOISY` just before it reroutes
 * playback — headphones unplugged, Bluetooth disconnected — and the contract
 * is that a media app pauses. Nothing does that here on its own: expo-audio
 * builds its ExoPlayer with `setAudioAttributes(…, handleAudioFocus = false)`
 * and never calls `setHandleAudioBecomingNoisy`, so without this the music
 * keeps playing and the room hears it.
 *
 * This is not audio focus. Focus covers calls and other apps, and expo-audio
 * already handles it. Yanking headphones takes no focus from anyone.
 */
class AudioFocusModule : Module() {

  private var receiver: BroadcastReceiver? = null

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("AudioFocusEvents")

    Events(BECOMING_NOISY)

    /*
     * Registered only while JS is listening, so a backgrounded app with
     * nothing playing is not holding a broadcast receiver open.
     */
    OnStartObserving(BECOMING_NOISY) { register() }
    OnStopObserving(BECOMING_NOISY) { unregister() }

    // The receiver outlives a reload otherwise, and the next one stacks on it.
    OnDestroy { unregister() }
  }

  private fun register() {
    if (receiver != null) return

    val created = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context?, intent: Intent?) {
        if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
          this@AudioFocusModule.sendEvent(BECOMING_NOISY)
        }
      }
    }

    val filter = IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)

    // A system broadcast, so it must be registered as not-exported from API 34
    // or the platform throws rather than simply ignoring the flag.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      ContextCompat.registerReceiver(context, created, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(created, filter)
    }

    receiver = created
  }

  private fun unregister() {
    val current = receiver ?: return
    receiver = null
    // Unregistering one that is already gone throws; a reload can race this.
    runCatching { context.unregisterReceiver(current) }
  }

  private companion object {
    const val BECOMING_NOISY = "audioBecomingNoisy"
  }
}
