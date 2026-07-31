# 002 — minSdkVersion 26

## Context

The obvious candidate was API 31 (Android 12), because `MediaMetadataRetriever`'s
`METADATA_KEY_SAMPLERATE` and `METADATA_KEY_BITS_PER_SAMPLE` were both added there, and the spec
strip — the app's signature element — wants those fields. The argument was that minSdk 31 deletes
the conditional path and guarantees a full spec strip everywhere.

Cumulative device coverage (April 2026): API 24 → 96.6%, API 26 → 96.1%, API 31 → 78.8%,
API 33 → 68.9%. So API 31 costs roughly a fifth of Android devices.

## Decision

**minSdkVersion 26** (Android 8.0), set via `expo-build-properties` in `app.json`.

API 31 buys much less than it appears. The metadata keys return `null` whenever the extractor
does not populate them — a per-file, per-codec property, not a per-API-level one — so the spec
strip must handle missing fields at any minSdk, and raising it cannot make the strip "always
full". What actually disappears is one `Build.VERSION.SDK_INT` check. Meanwhile the app's real
version branch is permissions, and `READ_MEDIA_AUDIO` is API **33**: at minSdk 31 we still carry
the `READ_EXTERNAL_STORAGE` / `maxSdkVersion=32` path. API 31 is the one value that pays full
price for almost nothing.

There is also an audience argument. microSD slots left flagship phones around 2019–2020, so the
person carrying a large FLAC library on a card skews toward older mid-range hardware — meaning the
excluded fifth is likely over-represented among our users, not under. Nothing in the app needs a
modern API: there is no network, and Media3/ExoPlayer ships its own FLAC decoder supporting API 21+.

26 rather than 24 because it costs only 0.5 percentage points and buys notification channels
(required for the media notification), adaptive icons, and freedom from pre-Oreo background
execution special cases.

## Consequences

On API 26–30, and on any file where the retriever returns null, `SpecStrip` renders the fields it
has (`FLAC · 1,411 kbps · 47.2 MB`) instead of the full line. That degradation path is required
regardless of minSdk, so it costs no extra code — but it must be designed for, not treated as an
error state.

The permission flow carries two branches: `READ_MEDIA_AUDIO` on API 33+, `READ_EXTERNAL_STORAGE`
below. Deleting that branch would need minSdk 33, which we are not doing.
