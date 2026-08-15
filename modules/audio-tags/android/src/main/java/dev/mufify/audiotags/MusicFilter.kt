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
  /**
   * Extensions the platform decoder can open.
   *
   * Used when walking a folder the user picked, to decide what is worth
   * handing to the media scanner. MediaStore does the real filtering
   * afterwards — this only keeps the scan request from being a list of every
   * photo and document in the folder.
   */
  val AUDIO_EXTENSIONS = setOf(
    "mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav", "wma", "aiff", "aif", "alac", "mp4",
    "m4b", "mka", "ape", "wv", "mpc", "3gp", "amr", "mid", "midi",
  )

  /** Whether a file name looks like audio. Case-insensitive, extension only. */
  fun isAudio(name: String): Boolean {
    val dot = name.lastIndexOf('.')
    if (dot < 0 || dot == name.length - 1) return false
    return name.substring(dot + 1).lowercase() in AUDIO_EXTENSIONS
  }

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
