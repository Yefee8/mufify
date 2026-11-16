package dev.mufify.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.view.View
import android.widget.RemoteViews

/**
 * One collection — the library, liked songs, or a playlist — ready to play.
 *
 * Which one is chosen when the widget is placed (`CollectionWidgetConfigure`)
 * and kept per widget, so a home screen can hold several. What it shows comes
 * from the list the app last wrote, so a renamed playlist is renamed here and
 * a deleted one says so rather than playing nothing.
 */
class CollectionWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    widgetIds.forEach { render(context, manager, it) }
  }

  override fun onDeleted(context: Context, widgetIds: IntArray) {
    WidgetStore(context).forget(widgetIds)
  }

  companion object {
    fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, CollectionWidget::class.java))
      ids.forEach { render(context, manager, it) }
    }

    fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val store = WidgetStore(context)
      // Not configured yet: the launcher draws before the picker returns.
      val key = store.collectionFor(widgetId) ?: return
      val appearance = store.appearance
      val palette = Palette.forTheme(context, appearance.theme)
      val entry = store.collections.firstOrNull { it.key == key } ?: fallback(context, key, appearance)

      val views = RemoteViews(context.packageName, R.layout.mufify_widget_collection)

      if (entry == null) {
        // A playlist deleted since the widget was placed.
        views.setTextViewText(
          R.id.mufify_col_name,
          appearance.text(context, "missing", R.string.mufify_widget_missing),
        )
        views.setViewVisibility(R.id.mufify_col_meta, View.GONE)
        views.setImageViewResource(R.id.mufify_col_cover_icon, R.drawable.mufify_widget_ic_playlist)
        showCover(views, R.id.mufify_col_cover_art, R.id.mufify_col_cover_icon, null)
        val open = WidgetIntents.open(context)
        views.setOnClickPendingIntent(R.id.mufify_col_body, open)
        views.setOnClickPendingIntent(R.id.mufify_col_play, open)
        views.setOnClickPendingIntent(R.id.mufify_col_shuffle, open)
        views.setInt(R.id.mufify_col_play_icon, "setImageAlpha", DIMMED)
        views.setInt(R.id.mufify_col_shuffle, "setImageAlpha", DIMMED)
      } else {
        views.setTextViewText(R.id.mufify_col_name, entry.name)
        views.setTextViewText(R.id.mufify_col_meta, entry.meta)
        // An empty second line would still take its height and push the name up.
        views.setViewVisibility(R.id.mufify_col_meta, if (entry.meta.isEmpty()) View.GONE else View.VISIBLE)
        views.setImageViewResource(R.id.mufify_col_cover_icon, iconFor(entry.kind))
        showCover(
          views,
          R.id.mufify_col_cover_art,
          R.id.mufify_col_cover_icon,
          Artwork.rounded(context, entry.artworkPath, COVER_DP, COVER_RADIUS_DP),
        )
        views.setOnClickPendingIntent(R.id.mufify_col_body, WidgetIntents.open(context, entry.link))
        views.setOnClickPendingIntent(
          R.id.mufify_col_play,
          WidgetIntents.action(context, WidgetAction("playCollection", collection = entry.key)),
        )
        views.setOnClickPendingIntent(
          R.id.mufify_col_shuffle,
          WidgetIntents.action(context, WidgetAction("shuffleCollection", collection = entry.key)),
        )
      }

      views.setContentDescription(
        R.id.mufify_col_play,
        appearance.text(context, "play", R.string.mufify_widget_play),
      )
      views.setContentDescription(
        R.id.mufify_col_shuffle,
        appearance.text(context, "shuffle", R.string.mufify_widget_shuffle),
      )

      if (palette != null) {
        palette.image(views, R.id.mufify_col_bg, palette.surface)
        palette.image(views, R.id.mufify_col_cover_bg, palette.elevated)
        palette.image(views, R.id.mufify_col_cover_icon, palette.muted)
        palette.image(views, R.id.mufify_col_shuffle, palette.label)
        palette.image(views, R.id.mufify_col_play_bg, palette.accent)
        palette.image(views, R.id.mufify_col_play_icon, palette.onAccent)
        views.setTextColor(R.id.mufify_col_name, palette.label)
        views.setTextColor(R.id.mufify_col_meta, palette.muted)
      }

      manager.updateAppWidget(widgetId, views)
    }

    /**
     * The library is always there, even before the app has written a list —
     * a widget placed on a fresh install, before the app was ever opened.
     */
    internal fun fallback(context: Context, key: String, appearance: Appearance): CollectionEntry? =
      if (key == LIBRARY) {
        CollectionEntry(LIBRARY, appearance.text(context, "library", R.string.mufify_widget_library), "", null, null)
      } else {
        null
      }

    private fun iconFor(kind: String): Int = when (kind) {
      "liked" -> R.drawable.mufify_widget_ic_heart
      "playlist" -> R.drawable.mufify_widget_ic_playlist
      else -> R.drawable.mufify_widget_ic_mark
    }

    internal const val LIBRARY = "library"
    private const val DIMMED = 90
  }
}
