package dev.mufify.audiotags

import android.app.Activity
import android.app.RecoverableSecurityException
import android.content.ContentResolver
import android.content.Context
import android.content.IntentSender
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import kotlinx.coroutines.CompletableDeferred

/**
 * Deleting the user's music files, with the user's consent.
 *
 * Under scoped storage an app cannot delete media it did not create, and this
 * app created none of it. The platform's answer is to ask the user itself,
 * through a system dialog the app can launch but not draw, and the shape of
 * that answer changed between the two versions this has to support:
 *
 * - **API 30+** — `MediaStore.createDeleteRequest` takes the whole list and
 *   shows **one** dialog naming every file. Deleting an album is one tap.
 * - **API 29** — no such call. `ContentResolver.delete` throws a
 *   `RecoverableSecurityException` carrying an `IntentSender` for **that one
 *   file**, so a twelve-track album is twelve dialogs, one after another.
 *   Ugly, and the alternative is not supporting the device the app is
 *   developed on.
 *
 * Below API 29 there is no consent mechanism at all: deleting another app's
 * media needs `WRITE_EXTERNAL_STORAGE`, which this app deliberately blocks in
 * `app.json` and advertises the absence of. Those versions get a clear refusal
 * rather than a permission request that would undo the promise. See
 * `docs/adr/021-deleting-files-needs-the-system-to-ask.md`.
 *
 * Consent is never assumed and never remembered. Each run asks again, because
 * the thing being confirmed is *which files*, and that is different every time.
 */
class MediaDeleter(private val requestCode: Int) {

  /** Completed by the activity result for the dialog currently on screen. */
  private var pending: CompletableDeferred<Boolean>? = null

  /** What a delete run did, per file, so the caller can prune its own rows. */
  data class Outcome(val deleted: List<String>, val denied: List<String>, val failed: List<String>)

  /** Whether this Android version can delete media the app does not own. */
  fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

  /**
   * Hand the system's answer to whoever is waiting for it.
   *
   * Returns whether the result belonged to this deleter, so the module can
   * leave anything else alone.
   */
  fun onActivityResult(code: Int, resultCode: Int): Boolean {
    if (code != requestCode) return false
    pending?.complete(resultCode == Activity.RESULT_OK)
    pending = null
    return true
  }

  suspend fun delete(context: Context, activity: Activity?, uriStrings: List<String>): Outcome {
    val resolver = context.contentResolver
    val uris = uriStrings.mapNotNull { runCatching { Uri.parse(it) }.getOrNull() }

    if (!isSupported() || activity == null) {
      return Outcome(emptyList(), emptyList(), uriStrings)
    }

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      deleteWithOneRequest(resolver, activity, uris)
    } else {
      deleteOneByOne(resolver, activity, uris)
    }
  }

  /**
   * API 30+: ask once for the lot.
   *
   * The system deletes the files itself on approval, so there is nothing to
   * retry afterwards — a granted request means every URI in it is gone.
   */
  private suspend fun deleteWithOneRequest(
    resolver: ContentResolver,
    activity: Activity,
    uris: List<Uri>,
  ): Outcome {
    if (uris.isEmpty()) return Outcome(emptyList(), emptyList(), emptyList())

    val sender = runCatching { MediaStore.createDeleteRequest(resolver, uris).intentSender }
      .getOrNull() ?: return Outcome(emptyList(), emptyList(), uris.map { it.toString() })

    val granted = ask(activity, sender)
    val names = uris.map { it.toString() }
    return if (granted) Outcome(names, emptyList(), emptyList())
    else Outcome(emptyList(), names, emptyList())
  }

  /**
   * API 29: one file, one dialog, and stop at the first refusal.
   *
   * Stopping is deliberate. Somebody who declines the third of twelve dialogs
   * has decided against this, and asking nine more times is the app arguing
   * with them. What was already deleted stays deleted — it was confirmed —
   * and the caller is told exactly which those were.
   */
  private suspend fun deleteOneByOne(
    resolver: ContentResolver,
    activity: Activity,
    uris: List<Uri>,
  ): Outcome {
    val deleted = mutableListOf<String>()
    val denied = mutableListOf<String>()
    val failed = mutableListOf<String>()

    for ((index, uri) in uris.withIndex()) {
      when (deleteOne(resolver, activity, uri)) {
        Result.DELETED -> deleted += uri.toString()
        Result.FAILED -> failed += uri.toString()
        Result.DENIED -> {
          // Everything from here on is refused by the same decision.
          denied += uris.drop(index).map { it.toString() }
          break
        }
      }
    }

    return Outcome(deleted, denied, failed)
  }

  private enum class Result { DELETED, DENIED, FAILED }

  private suspend fun deleteOne(
    resolver: ContentResolver,
    activity: Activity,
    uri: Uri,
  ): Result {
    val sender = try {
      // Succeeds outright for a file this app owns, which is none of them in
      // practice — but trying is how the exception carrying the consent
      // intent is obtained in the first place.
      return if (resolver.delete(uri, null, null) > 0) Result.DELETED else Result.FAILED
    } catch (exception: SecurityException) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return Result.FAILED
      (exception as? RecoverableSecurityException)?.userAction?.actionIntent?.intentSender
        ?: return Result.FAILED
    }

    if (!ask(activity, sender)) return Result.DENIED

    // The dialog grants access; it does not delete. Unlike API 30's request,
    // this one has to be repeated now that it is allowed to succeed.
    return try {
      if (resolver.delete(uri, null, null) > 0) Result.DELETED else Result.FAILED
    } catch (_: SecurityException) {
      Result.FAILED
    }
  }

  /** Put the system dialog on screen and wait for the tap. */
  private suspend fun ask(activity: Activity, sender: IntentSender): Boolean {
    val deferred = CompletableDeferred<Boolean>()
    pending = deferred

    return try {
      activity.startIntentSenderForResult(sender, requestCode, null, 0, 0, 0)
      deferred.await()
    } catch (_: IntentSender.SendIntentException) {
      pending = null
      false
    }
  }
}
