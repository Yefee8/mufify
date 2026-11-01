package dev.mufify.systembars

import androidx.core.view.WindowInsetsControllerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Whether the navigation bar draws its buttons dark or light.
 *
 * React Native's `StatusBar` sets the matching flag for the status bar and
 * there is no equivalent for the navigation bar, so with edge-to-edge on — it
 * is on, `edgeToEdgeEnabled` in the generated gradle.properties — the buttons
 * kept whatever the platform defaulted to. In the light theme that is **white
 * on `#F6F4F1`**, measured off the framebuffer at 1.06:1: with three-button
 * navigation, which is the Xiaomi default, back, home and recents were
 * invisible on every screen in the app.
 *
 * One function rather than a listener, because the only thing that decides
 * this is the resolved theme, and the app already re-runs that in one place.
 *
 * `WindowInsetsControllerCompat` rather than the `SYSTEM_UI_FLAG` constants:
 * the flags are deprecated from API 30 and are ignored outright once the
 * window opts into edge-to-edge through `setDecorFitsSystemWindows(false)`,
 * which is what Expo's edge-to-edge does.
 */
class SystemBarsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MufifySystemBars")

    /*
     * On the UI thread by hand. `Function` answers on whichever thread called
     * it, the window's insets controller is not thread safe, and a wrong-thread
     * write here is the kind that works on one device and not another.
     */
    Function("setLightNavigationBar") { light: Boolean ->
      val activity = appContext.throwingActivity
      activity.runOnUiThread {
        val window = activity.window
        WindowInsetsControllerCompat(window, window.decorView)
          .isAppearanceLightNavigationBars = light
      }
    }
  }
}
