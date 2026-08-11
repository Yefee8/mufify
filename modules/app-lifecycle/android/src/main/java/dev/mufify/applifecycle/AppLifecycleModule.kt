package dev.mufify.applifecycle

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.os.Process
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.system.exitProcess

/**
 * Shuts the app down when its task is removed.
 *
 * Android tells a *service* that the task is gone, never React Native, and a
 * media service is allowed to outlive its task. Mufify's did: swiping the app
 * out of recents left the notification playing, the process alive with no
 * activity behind it, and the next launch staring at a blank screen because
 * the JavaScript runtime had lost its host. Only "force stop" cleared it.
 *
 * **This is not about backgrounding.** An app behind another app, or with the
 * screen off, still has its task and never reaches here. Playing in the
 * background is untouched, and so is everything that writes statistics — the
 * app is *told*, and gets to finish its work before `quit` is called.
 *
 * The grace period is the safety net: if JavaScript never answers, the process
 * goes anyway, because leaving it half-alive is the bug being fixed.
 */
class AppLifecycleModule : Module() {

  private var receiver: BroadcastReceiver? = null
  private val handler = Handler(Looper.getMainLooper())
  private var fallback: Runnable? = null

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("AppLifecycle")

    Events(TASK_REMOVED)

    /*
     * Registered for the module's whole life, not for as long as JavaScript
     * happens to be listening.
     *
     * `OnStartObserving` looks like the right hook and is the wrong one here:
     * removing the task destroys the activity, React unmounts its tree, the
     * subscription's cleanup runs — and the receiver is gone a moment before
     * the broadcast it exists to catch. Measured, not guessed: the service
     * logged `onTaskRemoved` and nothing received it.
     */
    OnCreate { register() }

    /**
     * End the process.
     *
     * Called by the app once it has stopped playback and written whatever it
     * owed to the database. Stopping the service alone is not enough — React
     * Native keeps threads of its own, and it is those that were still up on
     * the next launch.
     */
    Function("quit") {
      cancelFallback()
      shutDown()
    }

    OnDestroy {
      unregister()
      cancelFallback()
    }
  }

  private fun register() {
    if (receiver != null) return

    val created = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context?, intent: Intent?) {
        if (intent?.action != ACTION_TASK_REMOVED) return
        this@AppLifecycleModule.sendEvent(TASK_REMOVED)
        scheduleFallback()
      }
    }

    // Sent by this app to itself, and the sender sets the package too.
    ContextCompat.registerReceiver(
      context,
      created,
      IntentFilter(ACTION_TASK_REMOVED),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )

    receiver = created
  }

  private fun unregister() {
    val current = receiver ?: return
    receiver = null
    runCatching { context.unregisterReceiver(current) }
  }

  /**
   * Long enough for a paused track and one database write, short enough that a
   * wedged runtime does not keep the notification alive while the user watches.
   */
  private fun scheduleFallback() {
    cancelFallback()
    val runnable = Runnable { shutDown() }
    fallback = runnable
    handler.postDelayed(runnable, FALLBACK_MS)
  }

  private fun cancelFallback() {
    fallback?.let(handler::removeCallbacks)
    fallback = null
  }

  private fun shutDown() {
    // Kills the foreground notification with the process that posted it.
    Process.killProcess(Process.myPid())
    exitProcess(0)
  }

  private companion object {
    const val TASK_REMOVED = "taskRemoved"

    /** Must match `AudioControlsService` in `patches/expo-audio`. */
    const val ACTION_TASK_REMOVED = "expo.modules.audio.TASK_REMOVED"

    const val FALLBACK_MS = 2500L
  }
}
