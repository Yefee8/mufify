package dev.mufify.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * What pressing each part of a widget does.
 *
 * Every PendingIntent carries a data URI unique to what it does. Two intents
 * that differ only in their extras are the *same* PendingIntent to the system,
 * so without it every button on a widget would end up doing whatever the last
 * one created does.
 */
internal object WidgetIntents {
  const val EXTRA_TYPE = "dev.mufify.widgets.TYPE"
  const val EXTRA_COLLECTION = "dev.mufify.widgets.COLLECTION"
  const val EXTRA_INDEX = "dev.mufify.widgets.INDEX"
  const val EXTRA_TRACK_ID = "dev.mufify.widgets.TRACK_ID"

  private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  /** A button: handed to the app, which is started if it is not running. */
  fun action(context: Context, action: WidgetAction): PendingIntent {
    val intent = Intent(context, WidgetActionActivity::class.java)
      .setData(
        Uri.Builder()
          .scheme("mufify-widget")
          .authority(action.type)
          .appendPath(action.collection ?: "-")
          .appendPath(action.index.toString())
          .appendPath(action.trackId.toString())
          .build(),
      )
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
      .putExtra(EXTRA_TYPE, action.type)
      .putExtra(EXTRA_COLLECTION, action.collection)
      .putExtra(EXTRA_INDEX, action.index)
      .putExtra(EXTRA_TRACK_ID, action.trackId)
    return PendingIntent.getActivity(context, 0, intent, FLAGS)
  }

  /** The app as the launcher icon opens it, or straight to one of its screens. */
  fun open(context: Context, link: String? = null): PendingIntent {
    val intent = if (link == null) {
      launch(context)
    } else {
      // The app's own scheme, which expo-router turns into the route.
      Intent(Intent.ACTION_VIEW, Uri.parse("mufify://$link"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return PendingIntent.getActivity(context, link?.hashCode() ?: 0, intent, FLAGS)
  }

  /** What the launcher icon starts: the app's task, brought forward if it has one. */
  fun launch(context: Context): Intent =
    (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent().setPackage(context.packageName))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  fun read(intent: Intent?): WidgetAction? {
    val type = intent?.getStringExtra(EXTRA_TYPE) ?: return null
    return WidgetAction(
      type = type,
      collection = intent.getStringExtra(EXTRA_COLLECTION),
      index = intent.getIntExtra(EXTRA_INDEX, -1),
      trackId = intent.getLongExtra(EXTRA_TRACK_ID, -1),
    )
  }
}
