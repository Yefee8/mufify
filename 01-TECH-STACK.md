# Tech Stack — Local-First Hi-Fi Music Player (Android, React Native) - Mufify

> Target: open-source, offline-only music player. FLAC / hi-res playback, local playlists,
> multiple shuffle algorithms, Spotify-Wrapped-style local statistics, SQLite storage,
> dark/light themes, TR/EN i18n. Published on Google Play.

---

## 0. Decisions that need to be made before writing code

These are the four choices that shape everything else. Read §2 before locking them in.

| # | Decision | Recommendation |
|---|---|---|
| 1 | Audio engine | **`expo-audio`** (MIT, first-party, Media3/ExoPlayer under the hood) |
| 2 | Styling | **NativeWind** — but see the v4 vs v5 risk in §2.2 |
| 3 | Where tracks come from | **MediaStore** (via `expo-media-library`) primary + optional SAF folder picker |
| 4 | "Editable bitrate" | **Tag editing, not transcoding.** See §7 — this requirement as written is not buildable cheaply |

---

## 1. Core stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Expo SDK 57** (RN 0.86, React 19.2) | SDK 56 (RN 0.85) is the conservative pick. SDK 55+ is New-Architecture-only. |
| Language | **TypeScript**, `strict: true` | No `any` in committed code. |
| Routing | **expo-router** (file-based) | Tabs + a modal route for Now Playing. |
| Audio | **`expo-audio`** | Background playback, media notification, lock-screen controls, playlists. Media3/ExoPlayer on Android → native FLAC, ALAC, Opus, Vorbis, WAV support. |
| Styling | **NativeWind** (Tailwind for RN) | Requested. Dark mode via `dark:` variant. |
| Database | **`expo-sqlite`** + **Drizzle ORM** | Typed schema, `drizzle-kit` migrations, `useLiveQuery` for reactive lists. |
| Key-value | **`react-native-mmkv`** | Settings, theme, last queue snapshot. Synchronous → no theme flash on boot. |
| State | **Zustand** | Player/UI state only. Persisted data lives in SQLite, not in a store. |
| Lists | **`@shopify/flash-list`** | Required — a 10k-track library will not survive `FlatList`. |
| Images | **`expo-image`** | Built-in memory + disk cache, `recyclingKey`, blurhash placeholders. |
| Animation | **`react-native-reanimated`** + **`react-native-gesture-handler`** | Mini-player → full-player transition, swipe-to-queue. |
| Sheets | **`@gorhom/bottom-sheet`** | Queue, track actions, sort/filter. |
| i18n | **`i18next`** + **`react-i18next`** + **`expo-localization`** | TR + EN. |
| Metadata | **`@missingcore/audio-metadata`** (JS) + a small Kotlin fallback module | See §4. |
| Haptics | **`expo-haptics`** | Cheap, big perceived-quality win. |
| Icons | **`lucide-react-native`** or **`@expo/vector-icons`** | Lucide has a more distinctive line weight. |
| Fonts | **`@expo-google-fonts/*`** + `expo-font` | See design direction in the build prompt. |
| Testing | **Jest** (`jest-expo`) + **`@testing-library/react-native`** | Plus Maestro for smoke e2e (optional). |
| Lint/format | **ESLint** (`eslint-config-expo`) + **Prettier** + `prettier-plugin-tailwindcss` | |
| Build | **EAS Build** (or local Gradle) | AAB for Play Store. |

**Verify every version at scaffold time with `npx expo install --check` and `npx expo-doctor`.**
Version numbers in this document are a starting point, not gospel.

---

## 2. The three real risks in this stack

### 2.1 `react-native-track-player` is no longer the free default

This matters, because every tutorial and every LLM's default answer says "use RNTP".

- **RNTP v4** (`react-native-track-player`, Apache-2.0) is **frozen**. No further updates.
  It predates the New Architecture, which SDK 55+ makes mandatory.
- **RNTP v5** (`@rntp/player`) is a full New-Architecture rewrite — and is **commercially licensed**.
  Personal and educational use is free; commercial use requires a paid license.

For an open-source app on the Play Store this is a licensing question you must answer
deliberately, not discover after three weeks of work.

**Recommendation: use `expo-audio`.** It is MIT, first-party, New-Arch-native, and now supports
what this app actually needs:

- background playback via a `FOREGROUND_SERVICE_MEDIA_PLAYBACK` service (`AudioControlsService`)
- lock-screen / notification controls (`setActiveForLockScreen`)
- playlists, preloading, playback rate, raw sample access (useful for a visualiser later)

**Critical Android gotcha:** on Android you must call `setActiveForLockScreen` for sustained
background playback. Without it the OS kills audio after roughly 3 minutes. Also requires
`interruptionMode: 'doNotMix'` via `setAudioModeAsync` for the controls to bind correctly.

**Fallback if `expo-audio` proves insufficient** (e.g. you need Android Auto, or gapless turns out
to be unacceptable): `react-native-audio-pro` (rnap.dev), or accept RNTP v5's license terms.
Wrap the engine behind `src/services/audio/AudioEngine.ts` from day one so this stays a
one-file swap. **This is non-negotiable architecture.**

### 2.2 NativeWind v4 vs v5

- **v4.1** is the stable release, tested against Expo SDK 54 / Tailwind 3.4.
- **v5** aligns with Tailwind CSS v4 (CSS-first config, `@theme`, CSS variables, Reanimated-backed
  animations) and depends on RN 0.81+ styling internals. As of mid-2026 it is still labelled
  pre-release, with an RC and promotion-to-stable plan in flight.

So: v4 is stable but built for an older RN; v5 targets modern RN but is a preview.

**Recommendation:** check `nativewind@latest` on npm the day you start.
- If v5 is stable → use v5 with SDK 56/57, and use `@theme` in `global.css` for design tokens.
- If still preview → either pin Expo SDK 54 + NativeWind 4.1 (boring, works), or accept the
  preview. Do not mix.
- Escape hatch: `react-native-unistyles` is a mature non-Tailwind alternative if NativeWind
  blocks you. Keep all styling behind semantic class names (`bg-surface`, `text-muted`) so a
  swap is mechanical.

### 2.3 The "editable bitrate" requirement

Bitrate is not metadata. It is a property of the encoded audio stream. You cannot edit it
without re-encoding the file. Three interpretations, pick one explicitly:

| Interpretation | Feasibility | Verdict |
|---|---|---|
| Edit the **tags** (title, artist, album, year, genre, artwork) | Doable — needs a native tag writer | **Ship this.** This is what users actually want. |
| Correct a **wrong displayed value** in the app's DB only | Trivial (DB column override) | Ship as a small "fix metadata" affordance. |
| Actually **transcode** to a different bitrate | Hard | **Defer to v2**, as an explicit "Convert" feature. |

On transcoding: `ffmpeg-kit`, the library everyone reaches for, was retired by its maintainer
(binaries pulled from the public repos) — verify current status before planning around it.
The remaining paths are Android's own `MediaCodec` (encoder availability varies by device) or
compiling FFmpeg yourself. Neither belongs in v1 of a hobby project.

For tag *writing*, JAudiotagger (Java, Android forks exist) via a small Expo Module is the
practical route. Read-only in v1 is a perfectly respectable scope decision.

---

## 3. Architecture

```
app/                          # expo-router routes ONLY — thin, no logic
  _layout.tsx
  (tabs)/
    index.tsx                 # Library
    playlists.tsx
    stats.tsx
    settings.tsx
  player.tsx                  # Now Playing (modal)
  playlist/[id].tsx
  album/[id].tsx
  artist/[id].tsx

src/
  components/
    ui/                       # Button, Text, Card, Sheet, Slider, Switch, Skeleton…
    track/                    # TrackRow, TrackArtwork, SpecStrip
    player/                   # MiniPlayer, PlayerControls, SeekBar, QueueList
    stats/                    # StatCard, TopList, PeriodPicker, WrappedCard
  features/                   # feature-scoped hooks + orchestration
    library/ player/ playlists/ stats/ settings/ scanner/
  db/
    client.ts                 # openDatabaseSync + pragmas
    schema.ts                 # Drizzle schema
    migrations/               # drizzle-kit output, committed
    queries/                  # typed query functions, one file per domain
  services/
    audio/AudioEngine.ts      # the ONLY file that imports expo-audio
    scanner/                  # MediaStore + SAF scan, incremental diff
    artwork/                  # extract → resize → cache to disk
    shuffle/                  # one file per algorithm + registry
    stats/                    # play-event recording + rollup upserts
  hooks/
  i18n/
    index.ts
    locales/{en,tr}.json
  theme/
    global.css                # Tailwind theme / CSS variables
    tokens.ts                 # typed access to the same tokens
  utils/
docs/                         # architecture, db, player, shuffle, stats, theming, i18n
```

**Rules:**
- Routes render screens. Screens compose components. Components render props.
- Business logic lives in `services/` and `features/*/hooks`, never in a component body.
- Only `services/audio/*` may import the audio library. Only `db/queries/*` may import Drizzle.
- Components are pure and under 300 lines. If a component crosses 300, it wanted to be two.

---

## 4. Library scanning & metadata

Two-stage scan, because a fast first paint matters more than complete data:

**Stage 1 — enumerate (fast).** `expo-media-library` → `getAssetsAsync({ mediaType: 'audio' })`
gives URI, filename, duration, modificationTime, size. Insert into `tracks` in transactions of
~500 rows. UI is usable immediately.

**Stage 2 — enrich (background, chunked).** For each track without `last_scanned_at`:
- read tags via `@missingcore/audio-metadata` (pure JS/TS, New-Arch compatible, works with
  `expo-file-system`; reads ID3 and FLAC/Vorbis comment tags — **verify format coverage against
  your actual library before committing to it**)
- extract embedded artwork → resize to 512px and 128px → write JPEGs to
  `cacheDirectory/artwork/{hash}.jpg` → store the *path* in the DB, never the bytes
- yield between chunks (`InteractionManager` / `setTimeout(0)`) so scrolling never stutters

**If the JS parser is too slow or misses formats,** write a ~150-line Expo Module in Kotlin
using `MediaMetadataRetriever`. This is the reliable source for the technical spec strip:

| Field | Source |
|---|---|
| Bitrate | `METADATA_KEY_BITRATE`, fallback `fileSize * 8 / durationSeconds` |
| Sample rate | `METADATA_KEY_SAMPLERATE` (API 31+) |
| Bit depth | `METADATA_KEY_BITS_PER_SAMPLE` (API 31+) |
| Container/codec | `METADATA_KEY_MIMETYPE` |

Note that FLAC is variable-bitrate: the computed average is the honest number to display.

**Incremental rescan:** skip any file whose `(size, modificationTime)` is unchanged. Mark rows
`is_missing = 1` instead of deleting them, so playlist entries and play history survive a
temporarily unmounted SD card.

---

## 5. Database schema (sketch)

```
artists(id, name, sort_name)
albums(id, name, artist_id → artists, year, artwork_path)

tracks(
  id, media_store_id, file_uri, title, artist_id, album_id, album_artist,
  genre, track_no, disc_no, year, duration_ms, file_size,
  container, codec, bitrate_kbps, sample_rate_hz, bit_depth, channels,
  artwork_path, date_added, date_modified, last_scanned_at, is_missing
)

track_stats(track_id PK, play_count, skip_count, ms_played_total, last_played_at, is_favorite)

playlists(id, name, description, artwork_path, created_at, updated_at)
playlist_tracks(playlist_id, track_id, position, added_at)   -- PK(playlist_id, position)

play_events(
  id, track_id, started_at_utc, ms_played, completed,
  source_type,        -- 'library' | 'album' | 'artist' | 'playlist' | 'queue'
  source_id,
  shuffle_algorithm,  -- null when sequential
  week_key,           -- '2026-W31'
  month_key,          -- '2026-07'
  year_key            -- '2026'
)

stats_rollups(
  id, period_type, period_key, entity_type, entity_id, play_count, ms_played, updated_at
)  -- UNIQUE(period_type, period_key, entity_type, entity_id)

scan_folders(id, uri, enabled)
```

**Indexes:** `tracks(artist_id)`, `tracks(album_id)`, `tracks(title COLLATE NOCASE)`,
`play_events(started_at_utc)`, `play_events(track_id)`, `playlist_tracks(track_id)`,
plus the unique index on `stats_rollups`.

**Pragmas** (set once in `db/client.ts`):
`journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `temp_store = MEMORY`.

**Period keys are written at insert time, in the user's local timezone.** Do not compute them at
read time — you will get wrong answers across DST and travel, and it forces a table scan.
Week boundary (Monday vs Sunday) is a settings value; changing it triggers a rollup rebuild.

**Play counting rule** (make it explicit and testable):
- counts as a play when `ms_played >= min(30_000, duration_ms * 0.5)`
- counts as a skip when `ms_played < duration_ms * 0.2`
- seeking backwards does not create a second event

Every play event write does an incremental `upsert` into `stats_rollups` for
week/month/year × track/artist/album/playlist. **Stats screens read rollups only.**
Never aggregate `play_events` at render time.

---

## 6. Shuffle algorithms

All implement one interface, all are pure, all are seedable, all are unit tested:

```ts
type ShuffleFn = (tracks: TrackRef[], ctx: ShuffleContext) => TrackRef[];
// ctx: { currentTrackId?, stats: Map<id, TrackStat>, now: number, rng: () => number }
```

| Key | Name (EN / TR) | Behaviour |
|---|---|---|
| `pure` | True Random / Tam Rastgele | Fisher-Yates, uniform. The honest baseline. |
| `balanced` | Balanced / Dengeli | Round-robin over artist buckets: no two tracks by the same artist within N positions. This is what people *mean* when they say shuffle feels broken. |
| `discovery` | Discovery / Keşif | Weight ∝ `1 / (play_count + 1)` × recency decay. Surfaces the forgotten half of the library. |
| `favorites` | Favourites / Favoriler | Weight ∝ `play_count`, favourites boosted. |
| `album` | Album-aware / Albüm Sırası | Shuffles albums, preserves intra-album track order. Essential for classical and concept records. |

Selected in Settings, persisted in MMKV, recorded on every `play_event` so the Wrapped screen can
say "you listened on Discovery 62% of the time".

---

## 7. Performance & caching plan

This is the part that separates a real music player from a demo.

**Artwork** — the single biggest risk. Never decode embedded art at render time; a 24-bit FLAC's
picture block can be several MB. Extract once at scan, write two JPEGs (512 / 128), store paths.
`expo-image` with `cachePolicy="memory-disk"` and a `recyclingKey` equal to the track id.

**Lists** — FlashList with a memoized `TrackRow`. No inline arrow functions in `renderItem`; pass
the id and a stable callback. `getItemType` to separate headers from rows.

**Database** — prepared statements for hot queries; `useLiveQuery` for reactive lists so you're
not manually invalidating; pagination or virtualised queries above ~5k tracks.

**Boot** — read theme + last queue from MMKV synchronously so there's no flash of the wrong theme.
Defer scanner start until after first paint.

**Scanning** — chunked, cancellable, resumable, with visible progress. Never block the JS thread.

**Rendering** — enable the React Compiler if it's stable on your RN version; otherwise memoize
deliberately. Reanimated worklets for the seek bar and mini-player transition so playback
progress never crosses the JS bridge 60 times a second.

**Budget to hold yourself to:** cold start under 1.5s on a mid-range device, 60fps scroll on a
5,000-track list, play-tap-to-audio under 200ms.

---

## 8. Android specifics

**Permissions** (`app.json` → `android.permissions`):
- `READ_MEDIA_AUDIO` (API 33+) — request at runtime
- `READ_EXTERNAL_STORAGE` with `maxSdkVersion="32"`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `POST_NOTIFICATIONS` (API 33+)
- `WAKE_LOCK`

The `expo-audio` config plugin adds the foreground-service permissions and declares the media
playback service. Enable background playback through the plugin, not by hand-editing the manifest.

**Play Console:** the `mediaPlayback` foreground service type needs a declaration and
justification in the console. Data Safety form is easy here — the app collects nothing and has no
network calls at all. Say so plainly; it's a selling point.

**Local dev on macOS:**
- Node 22 LTS, JDK 17 (confirm against your RN version), Android Studio + SDK Platform 35/36
- `npx expo run:android` — CNG prebuilds automatically; don't commit `android/`
- Test files: `adb push ~/Music/*.flac /sdcard/Music/`, then trigger a MediaStore rescan
  (or use the app's SAF folder picker, which sidesteps the emulator's flaky scanner entirely)
- **Test hi-res on a physical device.** Emulator audio output is unreliable and won't tell you
  anything true about 24/96 playback.

---

## 9. Explicit non-goals for v1

Write these down so scope stays honest:

- no streaming, no accounts, no network calls of any kind
- no iOS build (the stack supports it; don't spend time on it in v1)
- no transcoding
- no equaliser (`AudioEffect` / `DynamicsProcessing` — genuinely nice, genuinely v2)
- no Android Auto (the main reason someone would pay for RNTP v5)
- no lyrics, no last.fm scrobbling
