package dev.mufify.audiotags

/**
 * Keeping recordings out of a music library.
 *
 * `IS_MUSIC` is supposed to answer this and on some devices simply does not.
 * Measured on a Mi 9T: every call recording MIUI had made was stored with
 * `is_music=1` and `is_podcast`, `is_ringtone`, `is_alarm` and
 * `is_notification` all `0` — indistinguishable, by flag, from an album track.
 * A library of 534 "songs" was largely phone calls and voice memos.
 *
 * So the folder has to decide. This is the same blacklist every serious
 * Android music player carries, for the same reason.
 *
 * Pure and free of Android imports so it runs as a plain JVM test.
 */
object MusicFilter {

  /**
   * Directory names whose contents are recordings rather than music.
   *
   * Matched case-insensitively against the whole path, so `Recordings`,
   * `/MIUI/sound_recorder/` and `WhatsApp Voice Notes` are all covered
   * wherever the vendor puts them.
   *
   * Deliberately conservative: every entry here is a folder created by a
   * recorder or a messenger, never one a person files music into. The cost of
   * a wrong entry is a silently missing album, which is worse than a stray
   * voice memo.
   */
  val EXCLUDED_DIRECTORIES = listOf(
    "call_rec",
    "callrecord",
    "sound_recorder",
    "soundrecorder",
    "voice_recorder",
    "voicerecorder",
    "recordings",
    "whatsapp audio",
    "whatsapp voice notes",
    "telegram audio",
  )

  /**
   * Whether this path looks like a recording rather than music.
   *
   * Matches on a path segment, not a substring: a folder genuinely called
   * `Recordings of Brahms` should still be scanned, and an album named
   * "Voice Recorder" should not vanish because of its title.
   */
  fun isExcludedPath(path: String?): Boolean {
    val normalized = path?.lowercase() ?: return false
    val segments = normalized.split('/').filter { it.isNotBlank() }

    // The file name itself is not a directory; only the folders decide.
    return segments.dropLast(1).any { segment -> segment in EXCLUDED_DIRECTORIES }
  }

  /**
   * The `WHERE` fragment that drops those folders, and its arguments.
   *
   * Filtering in SQL rather than after the fact keeps the rows from crossing
   * the bridge at all, and keeps the scan's progress count honest — a library
   * that reports 534 and shows 300 looks broken.
   */
  fun exclusionSelection(): Pair<String, Array<String>> {
    val clauses = EXCLUDED_DIRECTORIES.joinToString(" AND ") { "_data NOT LIKE ?" }
    val args = EXCLUDED_DIRECTORIES.map { "%/$it/%" }.toTypedArray()
    return clauses to args
  }
}
