# Screenshots

Taken on a Xiaomi Mi 9T (Android 10, MIUI), dark theme, Turkish, against a real
FLAC library rather than the synthetic one used for performance work.

> The files live in [`docs/screenshots/`](screenshots/). If an image below is
> missing, see the note in that directory — the names are fixed so this page
> keeps working when they are replaced.

## Playing

| Now Playing | Album |
|---|---|
| <img src="screenshots/now-playing.png" width="260" alt="Now Playing showing Keys to the Kingdom by Linkin Park, with square artwork, a lossless badge and the file's technical spec"> | <img src="screenshots/album-detail.png" width="260" alt="The Hunting Party album page with twelve tracks, play-all and shuffle buttons"> |

The spec strip under the title is the point of the app: `FLAC · 44,1 kHz ·
16-bit · 1.010 kbps · Stereo · 26,3 MB`, and a **Kayıpsız** badge that only
appears when the format is actually lossless. The transport strip at the bottom
stays put on every screen.

## Library

| Tracks | Artists |
|---|---|
| <img src="screenshots/library-tracks.png" width="260" alt="Library track list with artwork thumbnails, artist and album, and durations"> | <img src="screenshots/library-artists.png" width="260" alt="Artist grid showing Linkin Park, Mike Zhou and an Unknown artist card"> |

Artists and albums are shelves over the same table rather than separate scans.
A file with no artist tag gets an **Bilinmeyen sanatçı** card rather than being
dropped — see [ADR 013](adr/013-unknown-metadata.md).

## Playlists

| Playlists | A playlist | Liked songs |
|---|---|---|
| <img src="screenshots/playlists.png" width="200" alt="Playlists tab listing Beğenilenler and Akşamüstü with cover mosaics"> | <img src="screenshots/playlist-detail.png" width="200" alt="The Akşamüstü playlist with two tracks, each with a remove button and a drag handle"> | <img src="screenshots/liked-songs.png" width="200" alt="Liked songs, a virtual playlist holding one track"> |

Liked songs is a virtual playlist over `track_stats.is_favorite`, and the count
on the card comes from the same query that fills the screen behind it — that
was not always true, and it is the sort of thing that goes wrong quietly.

## Statistics

| This week | Lists |
|---|---|
| <img src="screenshots/stats-week.png" width="260" alt="Statistics for the week: 3 minutes listened, one play across two tracks, top track and top artist"> | <img src="screenshots/stats-week-lists.png" width="260" alt="Top tracks, top artists and top albums for the week, each with play counts and listening time"> |

Everything is read from `stats_rollups`, never aggregated from the event log at
render time. A track heard for seven seconds shows as **0 çalma · 7s** — it
counted as listening time without counting as a play, which is the whole reason
there are three outcomes and not two ([ADR 005](adr/005-play-skip-partial.md)).

## Settings

| Appearance and language | Shuffle | Statistics and motion | Folders |
|---|---|---|---|
| <img src="screenshots/settings-appearance.png" width="190" alt="Theme and language settings, each with a description"> | <img src="screenshots/settings-shuffle.png" width="190" alt="Five shuffle algorithms, each with a sentence explaining what it does"> | <img src="screenshots/settings-statistics-motion.png" width="190" alt="Switches for haptics and listening history, and an animation speed control"> | <img src="screenshots/settings-folders.png" width="190" alt="Animation speed, ignore-short-files switch, and the scanned folder list"> |

Every row says what it does. Five shuffle algorithms named without explanation
would be five names nobody can choose between — nobody knows what "Keşif" means
from the word.
