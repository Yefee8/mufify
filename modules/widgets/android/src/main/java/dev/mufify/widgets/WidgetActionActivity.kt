package dev.mufify.widgets

import android.app.Activity
import android.os.Bundle

/**
 * Where every widget button lands. It has no window and is gone before it
 * would draw one.
 *
 * With the app running and listening, the press goes straight to it and the
 * music answers without the app coming forward — the widget is a remote
 * control. Without it, the press is written down and the app is opened, and
 * the app carries it out once it has put its last session back: pressing play
 * on the widget of an app the system had closed still plays.
 *
 * An activity rather than a broadcast receiver: a press on a widget is a
 * foreground start of this activity, so starting the app from here is always
 * allowed. A broadcast to a stopped app is what MIUI's autostart blocking and
 * Android's background-activity rules both refuse, and then the button would
 * do nothing at all.
 */
class WidgetActionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val action = WidgetIntents.read(intent)
    if (action != null && !WidgetsModule.deliver(action)) {
      WidgetStore(this).setPendingAction(action)
      runCatching { startActivity(WidgetIntents.launch(this)) }
    }
    // Theme.NoDisplay: finishing before onResume is the contract, not a choice.
    finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)
  }
}
