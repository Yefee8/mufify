package dev.mufify.audiotags

import android.Manifest
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
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

  private companion object {
    /** Long enough for a real folder, short enough not to look like a freeze. */
    const val SCAN_TIMEOUT_MS = 30_000L

    /** Deep enough for Artist/Album/Disc, shallow enough to stay bounded. */
    const val MAX_SCAN_DEPTH = 8

    /** A ceiling, so pointing the picker at the storage root cannot hang. */
    const val MAX_SCAN_FILES = 20_000

    /** Identifies our own consent dialog among the activity's results. */
    const val DELETE_REQUEST_CODE = 0x0DE1
  }

  private val deleter = MediaDeleter(DELETE_REQUEST_CODE)

  private val context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  /**
   * `READ_MEDIA_AUDIO` only exists from API 33; before that the audio-reading
   * permission is `READ_EXTERNAL_STORAGE`. Both callers below branch on this,
   * so it lives in one place — requesting a permission the platform does not
   * have is an instant denial that looks exactly like a user saying no.
   */
  private fun audioPermission(): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_AUDIO
    else Manifest.permission.READ_EXTERNAL_STORAGE

  /**
   * How many files to open at once.
   *
   * One per core, which is the shape of the work: each read is a file opened,
   * parsed and closed, and the useful ceiling is however many the storage and
   * the CPU can service at the same time. At least two, so a single-core
   * reading is still concurrent with the artwork writes.
   */
  private fun readerCount(): Int = Runtime.getRuntime().availableProcessors().coerceIn(2, 8)

  /**
   * Every audio file under a path, or the path itself when it is a file.
   *
   * Bounded by depth and by count: a user can point the picker at the root of
   * their storage, and walking an unbounded tree on the JS thread's promise is
   * how a folder import turns into a freeze. Anything past the ceiling is left
   * to the ordinary MediaStore sweep, which is what the button next to it does.
   */
  private fun audioFilesUnder(path: String, depth: Int = 0): List<String> {
    val file = File(path)
    if (!file.exists()) return emptyList()
    if (file.isFile) return if (MusicFilter.isAudio(file.name)) listOf(path) else emptyList()
    if (depth >= MAX_SCAN_DEPTH) return emptyList()

    val children = file.listFiles() ?: return emptyList()
    val found = mutableListOf<String>()
    for (child in children) {
      if (found.size >= MAX_SCAN_FILES) break
      found += audioFilesUnder(child.absolutePath, depth + 1)
    }
    return found
  }

  override fun definition() = ModuleDefinition {
    Name("AudioTags")

    OnActivityResult { _, payload ->
      deleter.onActivityResult(payload.requestCode, payload.resultCode)
    }

    /** Whether this Android version can delete media the app does not own. */
    Function("canDeleteAudioFiles") { deleter.isSupported() }

    /**
     * Delete these files, once the user has told the system to.
     *
     * The app never deletes anything on its own authority: under scoped
     * storage it cannot, and it should not want to — these are the user's
     * files and the confirmation belongs to the system, which can name them
     * and cannot be spoofed by this app's own dialog.
     *
     * Reports each URI's fate rather than a single boolean, because the caller
     * has rows to prune and a partly-approved run is normal on API 29, where
     * the platform asks once per file.
     */
    AsyncFunction("deleteAudioFiles") Coroutine { uris: List<String> ->
      val outcome = deleter.delete(context, appContext.activityProvider?.currentActivity, uris)
      mapOf(
        "deleted" to outcome.deleted,
        "denied" to outcome.denied,
        "failed" to outcome.failed,
      )
    }

    AsyncFunction("hasAudioPermission") {
      ContextCompat.checkSelfPermission(context, audioPermission()) ==
        PackageManager.PERMISSION_GRANTED
    }

    /**
     * Show the system permission dialog and report what the user chose.
     *
     * Without this permission a MediaStore audio query does not fail — under
     * scoped storage it returns only the rows this app itself owns, which is
     * none of them. The scan then completes "successfully" with zero tracks
     * and the library falls back to its empty state, which reads as a broken
     * feature rather than a missing grant. So the request has to happen before
     * the first query, not be inferred from an empty result afterwards.
     *
     * `canAskAgain` is returned alongside because a permanent denial cannot be
     * fixed by asking again — that case has to send the user to system
     * settings instead, and only the caller knows how to say so.
     */
    AsyncFunction("requestAudioPermission") { promise: Promise ->
      val manager = appContext.permissions
      if (manager == null) {
        promise.resolve(mapOf("granted" to false, "canAskAgain" to false))
        return@AsyncFunction
      }

      val permission = audioPermission()
      manager.askForPermissions({ result ->
        val response: PermissionsResponse? = result[permission]
        promise.resolve(
          mapOf(
            "granted" to (response?.status == PermissionsStatus.GRANTED),
            "canAskAgain" to (response?.canAskAgain ?: false),
          ),
        )
      }, permission)
    }

    AsyncFunction("countAudioFiles") { minDurationMs: Int, pathPrefix: String? ->
      MediaStoreScanner.count(context, minDurationMs, pathPrefix)
    }

    AsyncFunction("queryAudioFiles") { options: Map<String, Any?> ->
      val limit = (options["limit"] as? Number)?.toInt() ?: 200
      val offset = (options["offset"] as? Number)?.toInt() ?: 0
      val minDuration = (options["minDurationMs"] as? Number)?.toInt() ?: 0
      // Present only for a folder import, which must index that folder alone.
      val pathPrefix = options["pathPrefix"] as? String

      MediaStoreScanner.query(context, limit, offset, minDuration, pathPrefix)
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
      /*
       * Directories are expanded to the files inside them, all the way down.
       *
       * `MediaScannerConnection.scanFile` does not recurse — handed a folder
       * it indexes the folder and nothing in it. That is why importing a
       * folder found the tracks sitting directly inside and silently skipped
       * every subfolder, which is how most people file an album.
       */
      val expanded = paths.flatMap(::audioFilesUnder)
      if (expanded.isEmpty()) {
        promise.resolve(emptyList<String>())
        return@AsyncFunction
      }

      val scanned = mutableListOf<String>()
      var remaining = expanded.size
      var settled = false

      /*
       * The callback is not guaranteed to fire once per path. A path that does
       * not exist, or a directory on a device whose provider declines to walk
       * it, can be dropped silently — and then `remaining` never reaches zero
       * and this promise never settles. An unsettled promise is worse than a
       * failure here: the caller is awaiting it before it starts the scan, so
       * the screen would sit forever with no progress and no error to show.
       * Whatever arrived by the deadline is therefore good enough; indexing is
       * best-effort and the MediaStore sweep runs either way.
       */
      fun settle() {
        synchronized(scanned) {
          if (settled) return
          settled = true
          promise.resolve(scanned.toList())
        }
      }

      Handler(Looper.getMainLooper()).postDelayed(::settle, SCAN_TIMEOUT_MS)

      MediaScannerConnection.scanFile(context, expanded.toTypedArray(), null) { _, uri ->
        synchronized(scanned) {
          if (uri != null) scanned.add(uri.toString())
          remaining -= 1
        }
        if (remaining == 0) settle()
      }
    }

    /**
     * Embedded lyrics for one file, or null.
     *
     * One file at a time, unlike `readTags`: this is asked for when a track
     * becomes the current one, not for a whole library, and only the metadata
     * at the head of the file is read. Storing lyrics for every track would
     * put megabytes of text in the database to answer a question the player
     * asks about one track at a time.
     */
    AsyncFunction("readLyrics") { uri: String ->
      LyricsReader.read(context, uri)
    }

    /**
     * Open each file, read its tags, write its artwork — in parallel.
     *
     * This is the expensive half of a scan and it was a `map`: one file at a
     * time, on one thread, while the phone's other seven cores did nothing.
     * Every file is independent — its own `MediaMetadataRetriever`, its own
     * JPEG — so the batch is split across the cores that exist and joined at
     * the end.
     *
     * `Dispatchers.IO` rather than `Default`: this is blocking file work, not
     * arithmetic, and the pool is sized for threads that spend their time
     * waiting. Parallelism is capped at the core count anyway, because past
     * that the disk is the bottleneck and more threads only add contention.
     *
     * Order is preserved — `awaitAll` returns in the order the jobs were
     * started, and the caller matches results to the URIs it sent.
     */
    AsyncFunction("readTags") Coroutine { uris: List<String>, options: Map<String, Any?> ->
      val directory = File(
        (options["artworkDirectory"] as? String)
          ?: File(context.cacheDir, "artwork").absolutePath,
      )
      val artworkSize = (options["artworkSize"] as? Number)?.toInt() ?: 512
      val thumbnailSize = (options["thumbnailSize"] as? Number)?.toInt() ?: 128
      val readContext = context

      coroutineScope {
        val semaphore = Semaphore(readerCount())
        uris
          .map { uri ->
            async(Dispatchers.IO) {
              semaphore.acquire()
              try {
                TagReader.read(readContext, uri, directory, artworkSize, thumbnailSize)
              } finally {
                semaphore.release()
              }
            }
          }
          .awaitAll()
      }
    }
  }
}
