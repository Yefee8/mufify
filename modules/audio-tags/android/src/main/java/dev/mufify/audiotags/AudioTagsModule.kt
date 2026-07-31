package dev.mufify.audiotags

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * MediaStore enumeration, tag reading and artwork extraction.
 *
 * Replaces both `@missingcore/audio-metadata` — which cannot run on SDK 57 and
 * reads none of the technical fields — and `expo-media-library`'s enumeration,
 * whose per-field async getters do not scale and never expose file size. See
 * `docs/adr/004-kotlin-metadata-module.md`.
 */
class AudioTagsModule : Module() {

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("AudioTags")

    AsyncFunction("hasAudioPermission") {
      val permission =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_AUDIO
        else Manifest.permission.READ_EXTERNAL_STORAGE

      ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("countAudioFiles") { minDurationMs: Int ->
      MediaStoreScanner.count(context, minDurationMs)
    }

    AsyncFunction("queryAudioFiles") { options: Map<String, Any?> ->
      val limit = (options["limit"] as? Number)?.toInt() ?: 200
      val offset = (options["offset"] as? Number)?.toInt() ?: 0
      val minDuration = (options["minDurationMs"] as? Number)?.toInt() ?: 0

      MediaStoreScanner.query(context, limit, offset, minDuration)
    }

    /**
     * Ask the platform to index these paths, and wait for it.
     *
     * MediaStore only knows about files its scanner has visited. A file copied
     * over USB, restored from a backup, or written by another app can sit on
     * disk for minutes — sometimes until reboot — before it appears in a
     * query. Every music player hits this, and the fix is to ask directly
     * rather than to wait and hope.
     *
     * Returns the URIs the scanner produced, so the caller can tell the
     * difference between "indexed, nothing new" and "the platform refused".
     */
    AsyncFunction("requestMediaScan") { paths: List<String>, promise: Promise ->
      if (paths.isEmpty()) {
        promise.resolve(emptyList<String>())
        return@AsyncFunction
      }

      val scanned = mutableListOf<String>()
      var remaining = paths.size

      MediaScannerConnection.scanFile(context, paths.toTypedArray(), null) { _, uri ->
        synchronized(scanned) {
          if (uri != null) scanned.add(uri.toString())
          remaining -= 1
          // The callback fires once per path; resolve on the last one.
          if (remaining == 0) promise.resolve(scanned.toList())
        }
      }
    }

    AsyncFunction("readTags") { uris: List<String>, options: Map<String, Any?> ->
      val directory = File(
        (options["artworkDirectory"] as? String)
          ?: File(context.cacheDir, "artwork").absolutePath,
      )
      val artworkSize = (options["artworkSize"] as? Number)?.toInt() ?: 512
      val thumbnailSize = (options["thumbnailSize"] as? Number)?.toInt() ?: 128

      uris.map { uri -> TagReader.read(context, uri, directory, artworkSize, thumbnailSize) }
    }
  }
}
