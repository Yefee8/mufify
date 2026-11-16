package dev.mufify.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.view.Gravity
import android.view.View
import android.widget.RemoteViews

/**
 * What is playing, with its controls; on a taller widget, what comes next.
 *
 * Drawn entirely from `WidgetStore`. The app writes there whenever something
 * the widget shows changes, and this redraws — the launcher also asks on its
 * own, after a reboot or a resize, when the app may well not be running.
 */
class NowPlayingWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    widgetIds.forEach { render(context, manager, it) }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    widgetId: Int,
    newOptions: Bundle,
  ) {
    // Below Android 12 a resize is the only way to learn the new height.
    render(context, manager, widgetId)
  }

  companion object {
    /** Redraw every placed widget. Cheap when there are none. */
    fun refresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
      ids.forEach { render(context, manager, it) }
    }

    private fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val store = WidgetStore(context)
      val state = store.nowPlaying
      val appearance = store.appearance
      val palette = Palette.forTheme(context, appearance.theme)

      /*
       * From Android 12 the launcher picks among layouts by size, so a resize
       * redraws instantly without asking the app anything. Before that it
       * tells the provider the new size and the provider answers with one.
       */
      val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        RemoteViews(
          (0..MAX_ROWS).associate { rows ->
            SizeF(MIN_WIDTH_DP, heightFor(rows)) to build(context, state, appearance, palette, rows)
          },
        )
      } else {
        val minHeight = manager.getAppWidgetOptions(widgetId)
          .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
        build(context, state, appearance, palette, rowsFor(minHeight))
      }
      manager.updateAppWidget(widgetId, views)
    }

    private fun build(
      context: Context,
      state: NowPlaying,
      appearance: Appearance,
      palette: Palette?,
      rows: Int,
    ): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.mufify_widget_now_playing)
      val open = WidgetIntents.open(context)
      views.setOnClickPendingIntent(R.id.mufify_np_body, open)

      if (state.hasTrack) {
        views.setTextViewText(R.id.mufify_np_title, state.title)
        views.setTextViewText(R.id.mufify_np_artist, state.artist)
      } else {
        views.setTextViewText(
          R.id.mufify_np_title,
          appearance.text(context, "nothingPlaying", R.string.mufify_widget_nothing_playing),
        )
        views.setTextViewText(
          R.id.mufify_np_artist,
          appearance.text(context, "openApp", R.string.mufify_widget_open_app),
        )
      }

      showCover(
        views,
        R.id.mufify_np_cover_art,
        R.id.mufify_np_cover_icon,
        Artwork.rounded(context, state.artworkPath, COVER_DP, COVER_RADIUS_DP),
      )

      /*
       * With nothing loaded the controls open the app instead: there is no
       * queue for them to act on, and a button that does nothing reads as
       * broken. They are dimmed, so it is clear why.
       */
      val toggle = if (state.playing) "pause" else "play"
      views.setImageViewResource(
        R.id.mufify_np_toggle_icon,
        if (state.playing) R.drawable.mufify_widget_ic_pause else R.drawable.mufify_widget_ic_play,
      )
      views.setContentDescription(
        R.id.mufify_np_toggle,
        if (state.playing) {
          appearance.text(context, "pause", R.string.mufify_widget_pause)
        } else {
          appearance.text(context, "play", R.string.mufify_widget_play)
        },
      )
      views.setContentDescription(
        R.id.mufify_np_previous,
        appearance.text(context, "previous", R.string.mufify_widget_previous),
      )
      views.setContentDescription(
        R.id.mufify_np_next,
        appearance.text(context, "next", R.string.mufify_widget_next),
      )
      if (state.hasTrack) {
        views.setOnClickPendingIntent(R.id.mufify_np_toggle, WidgetIntents.action(context, WidgetAction(toggle)))
        views.setOnClickPendingIntent(R.id.mufify_np_previous, WidgetIntents.action(context, WidgetAction("previous")))
        views.setOnClickPendingIntent(R.id.mufify_np_next, WidgetIntents.action(context, WidgetAction("next")))
      } else {
        views.setOnClickPendingIntent(R.id.mufify_np_toggle, open)
        views.setOnClickPendingIntent(R.id.mufify_np_previous, open)
        views.setOnClickPendingIntent(R.id.mufify_np_next, open)
      }
      val enabled = if (state.hasTrack) OPAQUE else DIMMED
      views.setInt(R.id.mufify_np_previous, "setImageAlpha", enabled)
      views.setInt(R.id.mufify_np_next, "setImageAlpha", enabled)

      bindQueue(context, views, state, appearance, rows)

      if (palette != null) {
        palette.image(views, R.id.mufify_np_bg, palette.surface)
        palette.image(views, R.id.mufify_np_cover_bg, palette.elevated)
        palette.image(views, R.id.mufify_np_cover_icon, palette.muted)
        palette.image(views, R.id.mufify_np_previous, palette.label)
        palette.image(views, R.id.mufify_np_next, palette.label)
        palette.image(views, R.id.mufify_np_toggle_bg, palette.accent)
        palette.image(views, R.id.mufify_np_toggle_icon, palette.onAccent)
        views.setTextColor(R.id.mufify_np_title, palette.label)
        views.setTextColor(R.id.mufify_np_artist, palette.muted)
        views.setTextColor(R.id.mufify_np_queue_label, palette.muted)
        ROW_IDS.forEach { (_, title, artist) ->
          views.setTextColor(title, palette.label)
          views.setTextColor(artist, palette.muted)
        }
      }
      return views
    }

    private fun bindQueue(
      context: Context,
      views: RemoteViews,
      state: NowPlaying,
      appearance: Appearance,
      rows: Int,
    ) {
      if (rows == 0 || !state.hasTrack) {
        views.setViewVisibility(R.id.mufify_np_queue, View.GONE)
        views.setInt(R.id.mufify_np_content, "setGravity", Gravity.CENTER_VERTICAL)
        return
      }
      // A list reads from the top. Centred, a short queue in a tall widget
      // floated in the middle with the track above it adrift.
      views.setInt(R.id.mufify_np_content, "setGravity", Gravity.TOP)
      views.setViewVisibility(R.id.mufify_np_queue, View.VISIBLE)
      views.setTextViewText(
        R.id.mufify_np_queue_label,
        appearance.text(context, "upNext", R.string.mufify_widget_up_next),
      )

      ROW_IDS.forEachIndexed { slot, (row, title, artist) ->
        val entry = state.upNext.getOrNull(slot)
        when {
          slot >= rows -> views.setViewVisibility(row, View.GONE)
          entry != null -> {
            views.setViewVisibility(row, View.VISIBLE)
            views.setTextViewText(title, entry.title)
            views.setTextViewText(artist, entry.artist)
            views.setOnClickPendingIntent(
              row,
              WidgetIntents.action(context, WidgetAction("jump", index = entry.index, trackId = entry.trackId)),
            )
          }
          // The end of the queue says so once, rather than leaving a blank.
          slot == 0 -> {
            views.setViewVisibility(row, View.VISIBLE)
            views.setTextViewText(title, appearance.text(context, "queueEnd", R.string.mufify_widget_queue_end))
            views.setTextViewText(artist, "")
            views.setOnClickPendingIntent(row, WidgetIntents.open(context))
          }
          else -> views.setViewVisibility(row, View.GONE)
        }
      }
    }

    /*
     * The header is 64dp with its padding, the "Up next" line and its margin
     * 26dp more, and each row 32dp. A row is shown only when it fits whole.
     */
    private const val HEADER_DP = 64f
    private const val QUEUE_HEAD_DP = 26f
    private const val ROW_DP = 32f
    private const val MAX_ROWS = 4
    private const val MIN_WIDTH_DP = 180f

    private fun heightFor(rows: Int): Float =
      if (rows == 0) 40f else HEADER_DP + QUEUE_HEAD_DP + rows * ROW_DP

    private fun rowsFor(heightDp: Int): Int =
      ((heightDp - HEADER_DP - QUEUE_HEAD_DP) / ROW_DP).toInt().coerceIn(0, MAX_ROWS)

    private const val OPAQUE = 255
    private const val DIMMED = 90

    private val ROW_IDS = listOf(
      Triple(R.id.mufify_np_row_0, R.id.mufify_np_row_0_title, R.id.mufify_np_row_0_artist),
      Triple(R.id.mufify_np_row_1, R.id.mufify_np_row_1_title, R.id.mufify_np_row_1_artist),
      Triple(R.id.mufify_np_row_2, R.id.mufify_np_row_2_title, R.id.mufify_np_row_2_artist),
      Triple(R.id.mufify_np_row_3, R.id.mufify_np_row_3_title, R.id.mufify_np_row_3_artist),
    )
  }
}
