package dev.mufify.widgets

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The app's side of the home-screen widgets.
 *
 * The app tells it what to show — the track and queue, the collections, the
 * theme and words — and it redraws the widgets from that. Presses come back
 * as `widgetAction` while the app is listening; otherwise
 * `WidgetActionActivity` writes them down, opens the app, and the app asks
 * for them with `takePendingAction`.
 *
 * Every call writes and returns. No widget placed costs one SharedPreferences
 * write and nothing else.
 */
class WidgetsModule : Module() {
  @Volatile private var observing = false

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("MufifyWidgets")

    Events(EVENT)

    OnCreate { active = this@WidgetsModule }

    OnStartObserving(EVENT) { observing = true }

    OnStopObserving(EVENT) { observing = false }

    OnDestroy {
      observing = false
      if (active === this@WidgetsModule) active = null
    }

    /** The current track, whether it plays, and what follows: JSON, see `modules/widgets`. */
    Function("setNowPlaying") { json: String ->
      if (WidgetStore(context).setNowPlaying(json)) NowPlayingWidget.refresh(context)
    }

    /** Everything a collection widget can be: JSON array. */
    Function("setCollections") { json: String ->
      if (WidgetStore(context).setCollections(json)) CollectionWidget.refresh(context)
    }

    /** Theme preference and the widgets' words, in the app's language. */
    Function("setAppearance") { json: String ->
      if (WidgetStore(context).setAppearance(json)) {
        NowPlayingWidget.refresh(context)
        CollectionWidget.refresh(context)
      }
    }

    /** The press that opened the app, if one did in the last minute. Once. */
    Function("takePendingAction") { ->
      WidgetStore(context).takePendingAction()
    }
  }

  companion object {
    private const val EVENT = "widgetAction"

    @Volatile private var active: WidgetsModule? = null

    /** Hand a press to the running app. False when there is nobody to hand it to. */
    internal fun deliver(action: WidgetAction): Boolean {
      val module = active ?: return false
      if (!module.observing) return false
      return runCatching { module.sendEvent(EVENT, action.toMap()) }.isSuccess
    }
  }
}
