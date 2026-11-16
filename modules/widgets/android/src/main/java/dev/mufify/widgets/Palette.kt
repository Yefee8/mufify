package dev.mufify.widgets

import android.content.Context
import android.content.res.Configuration
import android.widget.RemoteViews

/**
 * The app's colours for one theme, read from the widget's colour resources.
 *
 * Only for a theme the user picked. On "system" the layouts' own resource
 * colours do the work, and they are better at it: the launcher inflates the
 * layout against its own configuration, so a widget follows the phone into
 * night mode at sunset without the app running. Colours set in code would
 * stay whatever they were when last drawn.
 */
internal data class Palette(
  val surface: Int,
  val elevated: Int,
  val label: Int,
  val muted: Int,
  val accent: Int,
  val onAccent: Int,
) {
  fun image(views: RemoteViews, id: Int, color: Int) = views.setInt(id, "setColorFilter", color)

  companion object {
    /** Null for "system": leave the resources to it. */
    fun forTheme(context: Context, theme: String): Palette? {
      val night = when (theme) {
        "dark" -> true
        "light" -> false
        else -> return null
      }
      val config = Configuration(context.resources.configuration)
      val mode = if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
      config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or mode
      val themed = context.createConfigurationContext(config)
      return Palette(
        surface = themed.getColor(R.color.mufify_widget_surface),
        elevated = themed.getColor(R.color.mufify_widget_elevated),
        label = themed.getColor(R.color.mufify_widget_label),
        muted = themed.getColor(R.color.mufify_widget_muted),
        accent = themed.getColor(R.color.mufify_widget_accent),
        onAccent = themed.getColor(R.color.mufify_widget_on_accent),
      )
    }

    /** Whether the widgets are drawn dark right now — for the picker dialog. */
    fun isDark(context: Context, theme: String): Boolean = when (theme) {
      "dark" -> true
      "light" -> false
      else ->
        context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
          Configuration.UI_MODE_NIGHT_YES
    }
  }
}
