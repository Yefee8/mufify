# 034 — Live queries re-run once per burst of changes

**Status:** accepted
**Date:** 2026-11-07

## Context

Every list in the app is a live query: Drizzle's `useLiveQuery` subscribes to
expo-sqlite's change listener and re-runs when the table in `FROM` changes. What
was never written down is what "changes" means at the native end. The listener
is SQLite's update hook, and the update hook fires **once per row**. A scan
batch of 500 tracks is 500 events. Recording one listen is a play event, a
`track_stats` upsert and a rollup row per entity and period — about two dozen.
Drizzle re-ran every subscribed query on every one of them, and on expo-sqlite
every query runs synchronously on the JS thread.

Measured on the Pixel_7 AVD with 3,484 files: during a scan the JS thread sat
at 100% for the whole nine minutes; the library list stopped updating because
the thread was busy re-running it; the JS heap grew past 900 MB and most of the
process ended up in swap; and the screen stayed sluggish after the scan ended,
until the app was restarted. On the device, the same storm runs behind every
listen recorded and every playlist edit, and a page opened in that moment waits
behind it.

## Decision

**Our own `useLiveQuery`, in `src/db/queries/liveQuery.ts`, with Drizzle's
shape and a different trigger.** One native listener for the whole app feeds
`changeBatcher`, which only marks tables dirty; one flush 16 ms later runs each
subscriber whose tables were touched, once, however many rows changed. The
batcher is pure and tested without a clock.

Two smaller things came with it, because they were cheap once the hook was
ours. A query can **watch joined tables** as well as the one in `FROM` — the
"joined tables are invisible" trap is documented in four places in this
codebase, each with a two-query workaround. And a **null query** means "not
needed now": nothing runs and nothing is watched, the last result is kept. That
is how a closed sheet or an inactive filter stops costing anything without a
component split to make a hook conditional (`docs/adr/035`).

## Consequences

The same 3,484-file scan on the same emulator took **544 s** on 1.7.0 and
**155 s** after, with the list filling in as it went instead of freezing,
and the JS heap staying at the size of a normal session. A change reaches the
screen up to one frame later than before; a heart filling on the second frame
instead of the first is not visible, and there is one less thing to throttle.
Drizzle's hook is no longer used anywhere — anything new that wants a live
result goes through this one, which is also the only file outside `db/client`
that imports expo-sqlite's listener.
