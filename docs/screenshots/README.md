# Screenshot files

[`docs/screenshots.md`](../screenshots.md) and the project README point at the
names below. They are fixed so a retake replaces a file rather than editing two
markdown pages.

| File | What it shows |
|---|---|
| `now-playing.png` | Now Playing, expanded, with the spec strip and lossless badge |
| `album-detail.png` | An album page, with play-all and shuffle |
| `library-tracks.png` | The library's track list |
| `library-artists.png` | The artist shelf, including the unknown-artist card |
| `playlists.png` | The playlists tab |
| `playlist-detail.png` | One playlist, with reorder handles |
| `liked-songs.png` | Liked songs, the virtual playlist |
| `stats-week.png` | Statistics, week, the summary card |
| `stats-week-lists.png` | Statistics, week, top tracks/artists/albums |
| `settings-appearance.png` | Theme and language |
| `settings-shuffle.png` | The five shuffle algorithms |
| `settings-statistics-motion.png` | Haptics, listening history, animation speed |
| `settings-folders.png` | Animation speed, short files, scanned folders |

## Taking them

Dark theme, Turkish, on a real library — the synthetic `perf-NNN` files used for
performance work make the app look like a test harness, which is not what a
screenshot is for. Portrait, no notification shade, no debug overlays.

```bash
adb -s <device> exec-out screencap -p > docs/screenshots/<name>.png
```

Keep them as they come off the device. Do not upscale, crop the status bar, or
frame them in a mockup: the point is what the app looks like, and a device frame
is a picture of a phone.
