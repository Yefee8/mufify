# 027 — The listening history lives outside the app too

**Status:** accepted
**Date:** 2026-09-15

## Context

"The statistics reset to zero on every update."

They do not, on an update. Installing 1.4.4 over 1.4.3 on an emulator, with a
listening history in place, kept every row: the database is in the app's
private storage, and an in-place update leaves that alone. Every release since
1.3.0 is signed with the same key and carries a higher `versionCode`, so
nothing about the releases themselves forces a reinstall.

What does empty the database is anything that removes the app first: an
uninstall, a "clear data", or a build signed with a **different** key — and a
developer's phone alternates between debug builds from `expo run:android` and
release builds signed with the upload key, each of which has to go before the
other can be installed. Every one of those is "an update" to the person doing
it, and every one of them takes the history with it.

The history is the only table that cannot be rebuilt. The library comes back
from a scan; the playlists are a separate loss the user has not raised. A year
of listening exists nowhere else.

## Decision

**Write the history to a file in a folder the app does not own, and read it
back when that folder is granted again.**

### Where

`<folder>/.mufify/statistics.json`, where the folder is one the user granted
through the system picker: the **first folder they added to the library**, or
one they **chose for this** in Settings. Both are persistable SAF grants the
app already holds, so no new permission is asked for and no new prompt is
shown. The dot on the directory keeps it out of the media scanner and out of
other players' libraries.

The alternatives were each unusable for the one case that matters, the app's
own data being gone: the app's external files directory goes with it;
`Documents/` and `Downloads/` written through MediaStore stay but are readable
afterwards only by the install that wrote them; Android's own backup needs a
Google account and a device that restores. A folder the user grants is the
only place the app can reach both before and after, and after a reinstall the
user grants it anyway — they have to, to see their music.

### What

Play events, with each track identified by its **file URI** and by its
**tags** — a normalised title, a normalised artist, and a length. Not database
ids, which a rescan hands out afresh; not rollups, which are keyed by artist
and album ids that are just as ephemeral. The events carry everything needed
to rebuild the rollups, and the restore does so through `rollupDeltas`, the
same fan-out `recordListen` uses, so a restored history and a lived one are
the same rows. Track hearts ride along, because they live in `track_stats`
beside the counters.

Matching on restore is by URI first — a MediaStore id is stable on one device
for as long as the file is — and by tags second, with the library's own
normalisation and the same length allowance `dedupeTracks` gives, so a spelling
the library treats as one track is one track here too. A track with no match
keeps its listens in the file: an unmounted SD card is not a reason to lose
the history on it.

### When

- **Written** twenty seconds after the last recorded listen, once, however
  many listens land in between — a listening session is one write. Also when a
  heart is added or removed, and, bounded, when the app is swiped away. Never
  on the path between one track and the next.
- **Read back** when a folder is added to the library and the history is
  **empty** — the moment after a reinstall, and the file was theirs to begin
  with, so nothing is asked. A history that is not empty is left alone: adding
  a second folder must not quietly merge whatever an old file in it says. For
  that there is a button.

Restoring is idempotent. An event is skipped when the database already holds
one for the same track at the same instant, so the same file restored twice,
or a file this very install wrote, changes nothing.

### The file is the user's

It sits in a folder they can open, so it is parsed defensively: every field the
restore reads is checked, and a file that is not ours, or is truncated, comes
back as "no backup" rather than as a crash halfway through a restore.

## Consequences

- A reinstall — for any reason — no longer costs the listening history, as
  long as the folder that was written to is added back. The Settings row says
  which folder that is.
- A user whose library came from the device-wide scan alone has no library
  folder, and therefore no backup until they choose a folder in Settings. The
  row says so.
- The music folder gains a hidden directory with one JSON file in it. A user
  who syncs that folder elsewhere syncs the file too; that is a feature for
  anyone moving phones, and a switch for anyone who minds.
- Playlists are still lost with the app. Recorded here so it is not mistaken
  for an oversight: it is the next thing, not this thing.
- `services/stats` stays pure. The format and the matching live there and are
  tested there; the database side is `db/queries/statsBackup`, the file is
  `services/backup/backupFile`, and `services/backup/statsBackup` owns the
  when.
