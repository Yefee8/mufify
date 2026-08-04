package dev.mufify.audiofocus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The two things Android says about audio that expo-audio does not pass on.
 *
 * **Becoming noisy.** Android broadcasts `ACTION_AUDIO_BECOMING_NOISY` just
 * before it reroutes playback — headphones unplugged, Bluetooth disconnected —
 * and the contract is that a media app pauses. Nothing does that here on its
 * own: expo-audio builds its ExoPlayer with
 * `setAudioAttributes(…, handleAudioFocus = false)` and never calls
 * `setHandleAudioBecomingNoisy`, so without this the music keeps playing and
 * the room hears it. This is not audio focus — focus covers calls and other
 * apps, and expo-audio already handles it. Yanking headphones takes no focus
 * from anyone.
 *
 * **Skip.** A Bluetooth remote's next and previous buttons arrive as
 * `MediaSession` player commands, and expo-audio's session removed both from
 * the commands it accepts — reasonably, since its player holds one item and
 * knows nothing of a queue. The queue is in JavaScript, so `patches/` restores
 * the commands and has the session broadcast them instead of seeking; this
 * turns that broadcast into an event. See `docs/adr/017`.
 */
class AudioFocusModule : Module() {

  private var receiver: BroadcastReceiver? = null
  private var skipReceiver: BroadcastReceiver? = null

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("AudioFocusEvents")

    Events(BECOMING_NOISY, MEDIA_SKIP)

    /*
     * Registered only while JS is listening, so a backgrounded app with
     * nothing playing is not holding a broadcast receiver open.
     */
    OnStartObserving(BECOMING_NOISY) { register() }
    OnStopObserving(BECOMING_NOISY) { unregister() }

    OnStartObserving(MEDIA_SKIP) { registerSkip() }
    OnStopObserving(MEDIA_SKIP) { unregisterSkip() }

    // The receivers outlive a reload otherwise, and the next ones stack on them.
    OnDestroy {
      unregister()
      unregisterSkip()
    }
  }

  private fun registerSkip() {
    if (skipReceiver != null) return

    val created = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context?, intent: Intent?) {
        if (intent?.action != ACTION_MEDIA_SKIP) return
        val direction = intent.getStringExtra(EXTRA_DIRECTION) ?: return
        this@AudioFocusModule.sendEvent(MEDIA_SKIP, bundleOf("direction" to direction))
      }
    }

    // Sent by this app to itself, so it is explicitly not exported. The sender
    // also sets the package, which keeps it off the rest of the device.
    ContextCompat.registerReceiver(
      context,
      created,
      IntentFilter(ACTION_MEDIA_SKIP),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )

    skipReceiver = created
  }

  private fun unregisterSkip() {
    val current = skipReceiver ?: return
    skipReceiver = null
    runCatching { context.unregisterReceiver(current) }
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
    const val MEDIA_SKIP = "mediaSkip"

    /** Must match `AudioMediaSessionCallback` in `patches/expo-audio`. */
    const val ACTION_MEDIA_SKIP = "expo.modules.audio.MEDIA_SKIP"
    const val EXTRA_DIRECTION = "direction"
  }
}
