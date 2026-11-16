package dev.mufify.widgets

import android.graphics.Bitmap
import android.view.View
import android.widget.RemoteViews

/** Both widgets draw their covers 48dp square with the app's `rounded-sm`-ish corner. */
internal const val COVER_DP = 48
internal const val COVER_RADIUS_DP = 10

/**
 * The cover when there is one, the placeholder icon when there is not.
 *
 * Two views rather than one changing image: the icon carries a resource tint
 * so it follows night mode, and that tint would paint a real cover a single
 * flat colour.
 */
internal fun showCover(views: RemoteViews, artId: Int, iconId: Int, cover: Bitmap?) {
  if (cover != null) {
    views.setImageViewBitmap(artId, cover)
    views.setViewVisibility(artId, View.VISIBLE)
    views.setViewVisibility(iconId, View.GONE)
  } else {
    views.setViewVisibility(artId, View.GONE)
    views.setViewVisibility(iconId, View.VISIBLE)
  }
}
