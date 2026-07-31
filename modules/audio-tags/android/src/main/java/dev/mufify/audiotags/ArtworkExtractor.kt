package dev.mufify.audiotags

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * Turns an embedded picture into two JPEGs on disk and returns their paths.
 *
 * The bytes never reach JavaScript. A 24-bit FLAC picture block runs to
 * several megabytes; handing that to JS as a base64 data URI — which is what
 * the pure-JS metadata libraries do — puts it on the heap at 1.33x, then makes
 * the caller decode and rewrite it. Doing the whole thing here is both faster
 * and the only way to honour the "never store artwork bytes" rule cheaply.
 */
object ArtworkExtractor {

  data class Paths(val full: String?, val thumb: String?)

  /**
   * Content-addressed: identical pictures across an album collapse to one
   * pair of files, and a rescan of unchanged files rewrites nothing.
   */
  private fun digestOf(bytes: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
    return digest.take(16).joinToString("") { "%02x".format(it) }
  }

  fun write(
    picture: ByteArray?,
    directory: File,
    fullSize: Int,
    thumbSize: Int,
  ): Paths {
    if (picture == null || picture.isEmpty()) return Paths(null, null)

    if (!directory.exists()) directory.mkdirs()

    val hash = digestOf(picture)
    val fullFile = File(directory, "$hash-$fullSize.jpg")
    val thumbFile = File(directory, "$hash-$thumbSize.jpg")

    if (fullFile.exists() && thumbFile.exists()) {
      return Paths(fullFile.absolutePath, thumbFile.absolutePath)
    }

    // Measure first so a large picture is never fully decoded at full size.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(picture, 0, picture.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return Paths(null, null)

    val full = decodeScaled(picture, bounds, fullSize) ?: return Paths(null, null)
    val fullPath = runCatching { compress(full, fullFile) }.getOrNull()

    val thumb = Bitmap.createScaledBitmap(
      full,
      scaledWidth(full.width, full.height, thumbSize),
      scaledHeight(full.width, full.height, thumbSize),
      true,
    )
    val thumbPath = runCatching { compress(thumb, thumbFile) }.getOrNull()

    thumb.recycle()
    full.recycle()

    return Paths(fullPath, thumbPath)
  }

  private fun decodeScaled(
    bytes: ByteArray,
    bounds: BitmapFactory.Options,
    target: Int,
  ): Bitmap? {
    val options = BitmapFactory.Options().apply {
      inSampleSize = SpecMath.inSampleSize(bounds.outWidth, bounds.outHeight, target)
    }
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null

    val width = scaledWidth(decoded.width, decoded.height, target)
    val height = scaledHeight(decoded.width, decoded.height, target)
    if (width == decoded.width && height == decoded.height) return decoded

    val scaled = Bitmap.createScaledBitmap(decoded, width, height, true)
    if (scaled !== decoded) decoded.recycle()
    return scaled
  }

  private fun scaledWidth(width: Int, height: Int, target: Int): Int =
    if (width >= height) minOf(width, target)
    else maxOf(1, (width * minOf(height, target)) / height)

  private fun scaledHeight(width: Int, height: Int, target: Int): Int =
    if (height >= width) minOf(height, target)
    else maxOf(1, (height * minOf(width, target)) / width)

  private fun compress(bitmap: Bitmap, file: File): String {
    FileOutputStream(file).use { output ->
      bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output)
    }
    return file.absolutePath
  }
}
