package dev.mufify.audiotags

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MusicFilterTest {

  @Test
  fun `excludes the folders MIUI records into`() {
    // These were all is_music=1 on a real Mi 9T, so nothing but the folder
    // tells them apart from an album track.
    assertTrue(MusicFilter.isExcludedPath("/storage/emulated/0/MIUI/sound_recorder/24 Oca 20.42.mp3"))
    assertTrue(MusicFilter.isExcludedPath("/storage/emulated/0/MIUI/call_rec/Annem(0534)_2025.mp3"))
  }

  @Test
  fun `excludes messenger audio`() {
    assertTrue(
      MusicFilter.isExcludedPath("/storage/emulated/0/WhatsApp/Media/WhatsApp Audio/AUD-1.opus"),
    )
    assertTrue(
      MusicFilter.isExcludedPath("/storage/emulated/0/WhatsApp/Media/WhatsApp Voice Notes/x.opus"),
    )
  }

  @Test
  fun `is case-insensitive, because vendors disagree about capitals`() {
    assertTrue(MusicFilter.isExcludedPath("/storage/emulated/0/Recordings/a.m4a"))
    assertTrue(MusicFilter.isExcludedPath("/storage/emulated/0/RECORDINGS/a.m4a"))
  }

  @Test
  fun `keeps ordinary music`() {
    assertFalse(MusicFilter.isExcludedPath("/storage/emulated/0/Music/Sakla Samani/03.flac"))
    assertFalse(MusicFilter.isExcludedPath("/storage/emulated/0/Music/bulk/perf-001.flac"))
  }

  @Test
  fun `matches a whole folder, never a substring of one`() {
    // An album filed under "Recordings of Brahms" is music, and a track called
    // "Voice Recorder" must not delete its own album.
    assertFalse(MusicFilter.isExcludedPath("/storage/emulated/0/Music/Recordings of Brahms/1.flac"))
    assertFalse(MusicFilter.isExcludedPath("/storage/emulated/0/Music/Album/Voice Recorder.flac"))
  }

  @Test
  fun `never excludes on the file name alone`() {
    // The last segment is the file. Only folders decide.
    assertFalse(MusicFilter.isExcludedPath("/storage/emulated/0/Music/recordings.flac"))
  }

  @Test
  fun `survives a missing or malformed path`() {
    assertFalse(MusicFilter.isExcludedPath(null))
    assertFalse(MusicFilter.isExcludedPath(""))
  }

  @Test
  fun `builds one clause and one argument per excluded folder`() {
    val (clause, args) = MusicFilter.exclusionSelection()
    assertTrue(args.size == MusicFilter.EXCLUDED_DIRECTORIES.size)
    assertTrue(clause.split(" AND ").size == MusicFilter.EXCLUDED_DIRECTORIES.size)
    assertTrue(args.all { it.startsWith("%/") && it.endsWith("/%") })
  }
}

class MusicFilterAudioTest {

  @Test
  fun `recognises the formats a library is made of`() {
    for (name in listOf("a.mp3", "b.FLAC", "c.m4a", "d.opus", "e.wav", "f.Ogg")) {
      assertTrue(name, MusicFilter.isAudio(name))
    }
  }

  @Test
  fun `rejects everything that is not audio`() {
    for (name in listOf("cover.jpg", "notes.txt", "album.pdf", "video.mkv", "song", "song.")) {
      assertFalse(name, MusicFilter.isAudio(name))
    }
  }

  @Test
  fun `is not fooled by a dot in a folder-like name`() {
    assertFalse(MusicFilter.isAudio("The Beatles - 1962.1966"))
  }
}
