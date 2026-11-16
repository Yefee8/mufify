package dev.mufify.widgets

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.TextView

/**
 * Asks which collection a new collection widget is for.
 *
 * A plain system dialog over a transparent activity, not a screen of the app:
 * it is two seconds of the user's time, it has to work when the app has never
 * been opened, and the list it shows is the one the app last wrote — the
 * library first, liked songs, then playlists in the app's own order.
 */
class CollectionWidgetConfigure : Activity() {
  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    widgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID,
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

    // Backing out must not leave a blank widget on the home screen.
    setResult(RESULT_CANCELED, result())
    if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }

    val store = WidgetStore(this)
    val appearance = store.appearance
    val entries = store.collections.ifEmpty {
      listOfNotNull(CollectionWidget.fallback(this, CollectionWidget.LIBRARY, appearance))
    }

    val theme = if (Palette.isDark(this, appearance.theme)) {
      android.R.style.Theme_DeviceDefault_Dialog_Alert
    } else {
      android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
    }
    val builder = AlertDialog.Builder(this, theme)
    val adapter = object : ArrayAdapter<CollectionEntry>(
      builder.context,
      android.R.layout.simple_list_item_2,
      android.R.id.text1,
      entries,
    ) {
      override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
        val view = super.getView(position, convertView, parent)
        val entry = getItem(position)
        view.findViewById<TextView>(android.R.id.text1).text = entry?.name
        view.findViewById<TextView>(android.R.id.text2).apply {
          text = entry?.meta
          visibility = if (entry?.meta.isNullOrEmpty()) View.GONE else View.VISIBLE
        }
        return view
      }
    }

    builder
      .setTitle(appearance.text(this, "pickTitle", R.string.mufify_widget_pick_title))
      .setAdapter(adapter) { _, which -> choose(store, entries[which]) }
      .setOnCancelListener { finish() }
      .show()
  }

  private fun choose(store: WidgetStore, entry: CollectionEntry) {
    store.setCollectionFor(widgetId, entry.key)
    CollectionWidget.render(this, AppWidgetManager.getInstance(this), widgetId)
    setResult(RESULT_OK, result())
    finish()
  }

  private fun result() = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
}
