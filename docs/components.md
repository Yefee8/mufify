# Components

What each component is for, and the ones with a reason worth knowing.

Every exported component already carries a JSDoc saying what it does; this is
the map, not a duplicate of it. Where a component has a non-obvious constraint,
it is repeated here because that is the thing a reader needs before touching it.

## Rules that shape all of them

- **Under 300 lines.** Over means it should be two components. Enforced in
  review, not aspirational — `LibraryScreen` was split at exactly 300.
- **One component per file**, file named for the component.
- **NativeWind only.** No `StyleSheet.create`, no inline style objects, except
  for Reanimated animated styles and native components NativeWind cannot reach
  into (the platform `Switch`).
- **Semantic classes only** — `bg-surface`, `text-muted`, `border-subtle`. The
  Tailwind config *overrides* rather than extends the scales, so anything
  outside the design system compiles to nothing at all. `src/theme/scale.test.ts`
  fails on spacing values outside the scale, because five such classes shipped
  invisible before it existed.
- **Every screen has its empty, loading and error state** in the same commit as
  the happy path.

---

## `components/ui` — shared

| Component | What it is for |
|---|---|
| `Screen` | The standard frame: safe area, surface, display-face title. |
| `EmptyState` | Icon, one line, and the way out. Picks one of several phrasings per mount so the app does not read like a recording. |
| `ErrorState` | What failed in one plain sentence, and the retry. Never a raw error string. |
| `TabErrorBoundary` | Contains a render failure to its selected tab and shows `ErrorState`; retry remounts only that tab. |
| `Skeleton` | One placeholder block, sized by the caller. Pulses via a Reanimated worklet; stops dead under reduce-motion. |
| `SkeletonRows` | A list's worth, shaped like real rows so nothing jumps when data lands. Hidden from screen readers. |
| `SkeletonCards` | The same for the artist and album grids. Mirrors `CollectionGrid`'s two-column layout exactly. |
| `SegmentedControl` | Two to four short, self-evident choices on one line. `perRow` wraps when there are more. |
| `OptionList` | One choice per row with a sentence explaining it. The right control when the names need explaining — which is why shuffle uses it and theme does not. |
| `SettingGroup` / `SettingRow` / `SettingSwitch` | A titled block, a labelled row with a description line, and an on/off row. Every setting gets a description; a list of bare names makes the user guess. |
| `ActionSheet` | A sheet of actions for one thing. Closes before running the action, so the sheet never lingers while a track loads. |
| `ConfirmDialog` | Asks before something slow or irreversible. The confirm button names the action — never "OK". |
| `SwipeableRow` | Reveals one action when dragged left. **Transient by design**: it never stays open, because this lives in a recycling list and a row holding open state gets recycled with it. |
| `Toaster` | Where transient confirmations appear. Reads a module-level store, so a toast re-renders this and nothing else. Sits above the mini player in the tab bar stack. |
| `ProgressBar` | A determinate bar. Used by the scan banner. |

---

## `features/library`

| Component | What it is for |
|---|---|
| `LibraryScreen` | Owns the *library*: scanning, searching, which of the three views is showing. |
| `LibraryTracks` | Owns *tracks*: the sheets and playing. Split from the screen at the 300-line limit; the boundary is by subject, and it is reused verbatim by `CollectionDetailScreen`. |
| `CollectionDetailScreen` | One artist or one album. Reuses `LibraryTracks` so a track has the same verbs everywhere. |
| `LibraryHeader` | Count, folder picker, Scan. The count is always `tracks.length` — never a second query. |
| `TrackList` | The FlashList. `drawDistance` is 1200 rather than the 250 default; at 64px rows the default is under four rows of buffer and a fling outruns it, which is what left blank rows behind the finger. |
| `LibraryRow` | One row plus its swipe gesture. Memoized on primitives only, so a render elsewhere cannot reach it. |
| `TrackRow` | Artwork, title, artist, duration. Compared by value, because a live query hands back fresh objects on every re-run. |
| `CollectionCard` / `CollectionGrid` | An artist or album as a square card, and the two-column grid of them. |
| `CollectionHeader` | Cover, name and size for a detail screen. |
| `SearchField` | Debounced input. The field stays instant; only the query waits. |
| `ScanBanner` | Progress above the list, never instead of it — the user can scroll throughout. Hides the counter until a total is known rather than showing "0 / 0". |
| `TrackActionSheet` | Long-press actions. Its doc says which two items from the brief are deliberately absent, and why. |
| `TrackInfoSheet` | Every technical field. Absent values render as an em dash rather than disappearing. |
| `TrackListSkeleton` | Named wrapper over `SkeletonRows`, so row geometry stays in one place next to `TrackRow`. |

---

## `features/player`

| Component | What it is for |
|---|---|
| `PlayerLayer` / `PlayerScreen` | Root-mounted Now Playing overlay and its content. The mini player and full screen share one Reanimated expansion value; no route transition sits between them. |
| `ArtworkCarousel` | Three slots — previous, current, next — all mounted, so a neighbour slides in already decoded. Commits on distance **or** velocity. Rubber-bands at the ends of the queue. |
| `MiniPlayer` | The persistent transport strip. Subscribes to phase and track only, never position; horizontal swipe changes tracks and vertical swipe opens Now Playing. |
| `MiniProgress` | The progress hairline, and the only thing in the tab bar that hears about position. Width lives in a shared value; React renders it once. |
| `Scrubber` | The seek bar. The drag runs entirely in a worklet; React hears about it once, on release. |
| `SpecStrip` | The signature element — one monospaced line of a file's technical truth. |
| `FavoriteButton` | The heart. It is also the only writer of `is_favorite`, which the `favorites` shuffle weights on. |
| `QueueScreen` / `QueueRow` | What is playing and what follows. Subscribes to the engine's queue rather than its playback state, so it does not re-render at 2 Hz. |

---

## `features/playlists`

| Component | What it is for |
|---|---|
| `PlaylistsScreen` / `PlaylistRow` | The list, and one playlist in it. |
| `PlaylistDetailScreen` / `PlaylistDetailHeader` | One playlist, laid out the way a streaming app does because that arrangement is already in everyone's hands. |
| `PlaylistMosaic` | A playlist's cover: the first four album covers in a 2×2 grid. Each count is a deliberate case, not a degradation — one cover fills the square rather than repeating four times. |
| `ReorderableEntry` | Drag by a handle, not by long-press: long-press is the action sheet everywhere else, and a list where holding sometimes does either is a list nobody trusts. |
| `AddToPlaylistSheet` | Pick a playlist for some tracks, or make one. |
| `NamePlaylistDialog` | A `Modal`, not `Alert.prompt`, which is iOS-only and silently does nothing on Android. |

---

## `features/stats`

| Component | What it is for |
|---|---|
| `StatsScreen` | Reads `stats_rollups` only. Aggregating `play_events` here would be a scan over the whole history on every tab switch, growing forever. |
| `Wrapped` | The period in one card, leading with the listening time. Deliberately not a gradient, a collage, or a share sheet — a screenshot is already the share mechanism. |
| `StatTotals` | The three headline tiles. |
| `TopList` | A ranked list. Every row carries both the count and the duration, because they disagree constantly. Renders nothing when empty. |

---

## `features/settings`

| Component | What it is for |
|---|---|
| `SettingsScreen` | Every setting, each with a line saying what it does. |
| `ScanFolderList` | Folders the user added by hand, on top of what MediaStore indexes. |
| `DevTools` | The stress-library seeder and query timer. `__DEV__` only, and its strings are deliberately not translated — none of it ships. |
