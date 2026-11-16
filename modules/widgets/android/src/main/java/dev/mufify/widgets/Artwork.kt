package dev.mufify.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.util.LruCache
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * A cover as a widget can show it: small, square, corners already round.
 *
 * A bitmap, not a URI. The launcher draws the widget in its own process, which
 * cannot read this app's files directory, and handing it a content URI means a
 * provider and a grant for every cover. A bitmap the size of the view is a few
 * tens of kilobytes and simply travels with the RemoteViews.
 *
 * Rounded here because RemoteViews cannot clip an image to a shape below
 * Android 12, and the app's covers are never square-cornered.
 */
internal object Artwork {
  private val cache = object : LruCache<String, Bitmap>(CACHE_BYTES) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
  }

  /** Null when there is no path, no file, or nothing decodable in it. */
  @Synchronized
  fun rounded(context: Context, path: String?, sizeDp: Int, radiusDp: Int): Bitmap? {
    if (path.isNullOrEmpty()) return null
    val density = context.resources.displayMetrics.density
    val size = (sizeDp * density).roundToInt().coerceAtLeast(1)
    val key = "$path@$size"
    cache.get(key)?.let { return it }

    val file = File(path)
    if (!file.isFile) return null

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    // The largest power-of-two step that still leaves at least `size` pixels
    // on the short side: decoding a 1000px cover to throw most of it away is
    // the slow part of drawing a widget.
    var sample = 1
    while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= size) sample *= 2
    val source = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: return null

    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val scale = size.toFloat() / minOf(source.width, source.height)
    val matrix = Matrix().apply {
      setScale(scale, scale)
      postTranslate((size - source.width * scale) / 2f, (size - source.height * scale) / 2f)
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
      shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
        setLocalMatrix(matrix)
      }
    }
    val radius = max(0f, radiusDp * density)
    Canvas(output).drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, paint)
    if (source !== output) source.recycle()

    cache.put(key, output)
    return output
  }

  /** Enough for both widgets' covers several times over; a cover is ~60 KB. */
  private const val CACHE_BYTES = 2 * 1024 * 1024
}
