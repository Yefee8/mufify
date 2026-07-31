# 004 — A Kotlin module for MediaStore, tags and artwork

## Context

`docs/01-TECH-STACK.md` §4 proposed `@missingcore/audio-metadata` (JS) for tag reading, with a
Kotlin module as a fallback "if the JS parser is too slow or misses formats", and
`expo-media-library`'s `getAssetsAsync` for enumeration. Both were checked against the actual
package sources rather than their documentation.

`@missingcore/audio-metadata@1.3.0` was last published in July 2024 and does not work here. It
calls `getInfoAsync` / `readAsStringAsync` on `expo-file-system`, which in SDK 57 exist only under
`expo-file-system/legacy` — a runtime failure. Beyond that it skips the FLAC STREAMINFO block
entirely, so it returns no sample rate, bit depth, channel count or bitrate: none of the fields
the spec strip is built from. Its Vorbis comment support covers eight field names, excluding
`GENRE` and `DISCNUMBER`, both of which the schema and the Genres tab require. Embedded artwork
comes back as a base64 data URI, putting multi-megabyte covers on the JS heap.

`expo-media-library` was rewritten in SDK 57. `getAssetsAsync` now lives only under `/legacy` and
is deprecated; the new `Asset` API exposes one async getter per field (`getFilename()`,
`getDuration()`, …), which for a 10,000-track library is 30,000+ bridge calls. Neither API exposes
file size at all — a field needed for the spec strip *and* for the `(size, modificationTime)`
incremental-rescan key.

## Decision

Write `modules/audio-tags`, a local Expo Module in Kotlin, and give it both jobs: querying
MediaStore and reading tags plus technical fields. It is the first task of Phase 2, not a
fallback. `expo-media-library` stays only for the permission flow, where its
`GranularPermission: 'audio'` support is what we want.

Enumeration is a single `ContentResolver` cursor returning every column including `_size`, paged
on our side. Metadata uses `MediaMetadataRetriever` in a batched call —
`readTags(uris, artworkDir)` — so the JS↔native round trip is per chunk, not per file.

Artwork is resolved entirely in Kotlin: `getEmbeddedPicture()` → `BitmapFactory` with
`inSampleSize` → 512px and 128px JPEGs written straight to the cache directory → two paths
returned to JS. Bytes never cross the bridge, which satisfies the artwork rule in `AGENTS.md` for
free.

## Consequences

We own roughly 150–200 lines of Kotlin, and Phase 2 needs its own plan rather than being folded
into the existing one.

`METADATA_KEY_SAMPLERATE` and `METADATA_KEY_BITS_PER_SAMPLE` are API 31+, and null at any level
when the extractor does not populate them, so `SpecStrip` renders partial lines — see
`docs/adr/002-min-sdk-26.md`.

`music-metadata@11` was considered as a pure-JS alternative. It is MIT, actively maintained and
genuinely complete, but it is ESM-only with `engines: node >=18`; getting it running under Hermes
is its own research project. Rejected for v1, recorded here so it is not rediscovered.
