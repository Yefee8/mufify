# 021 — Deleting a file is the system's question, not ours

**Status:** accepted
**Date:** 2026-08-19

## Context

The brief asks for deleting tracks and albums from the device, and for a
multi-select mode that can delete several at once. These are the user's own
music files, and Mufify did not put any of them there.

Under scoped storage an app cannot delete media it did not create. Android
offers two ways through, and they are not the same shape:

- **API 30+** — `MediaStore.createDeleteRequest` takes a list of URIs and
  returns a `PendingIntent`. The system draws one dialog naming every file and
  deletes them itself on approval.
- **API 29** — no such call. `ContentResolver.delete` throws a
  `RecoverableSecurityException` carrying an `IntentSender` for **one** file.
  Consent is per file, and the delete has to be retried afterwards, because the
  dialog grants access rather than performing the deletion.
- **API 26–28** — neither. The only route is `WRITE_EXTERNAL_STORAGE`.

`minSdkVersion` is 26 (ADR 002), and the development phone — a Mi 9T — runs
Android 10, so API 29 is not a corner to skip.

`WRITE_EXTERNAL_STORAGE` is blocked in `app.json`, and its absence is checked
in the README and stated in every release note.

## Decision

**Deletion goes through the platform's consent flow, and is unavailable where
there isn't one.** `canDeleteAudioFiles` answers false below API 29 and the
delete action is *absent* from both action sheets and from the selection bar on
those devices — not greyed out. A disabled control invites a tap that then has
to be explained; an absent one asks nothing.

`WRITE_EXTERNAL_STORAGE` is not added back. A file manager's permission, taken
permanently, to add one action, in an app whose stated promise is that it asks
for as little as it can, is a bad trade — and it is the one permission whose
absence has been advertised.

**On API 29 the run stops at the first refusal.** Somebody who declines the
third of twelve dialogs has decided; asking nine more times is the app arguing
with them. What was already confirmed stays deleted, and the caller is told
exactly which those were.

**Rows are retired, not deleted.** A track whose file is gone gets
`is_missing = 1` — the same thing a rescan does to a file that has vanished.
Deleting the row would cascade into `play_events` and `track_stats` and quietly
rewrite the statistics: a year's listening would lose whatever the user tidied
up last week, and the Wrapped totals would change for reasons nobody could
connect to deleting a file. Every list already filters on `is_missing = 0`, so
retiring is what makes the track disappear from the library, from albums and
from the playlists holding it.

**Rows are retired only for the URIs the platform reported as deleted**, never
on the request merely having returned. Of the two ways to be wrong, a leftover
row is fixed by the next scan and an invisible file is fixed by nothing the
user can find.

**One app-level confirmation, and it is about the count.** The system's dialog
is the one that matters — it names the files, it cannot be impersonated by an
app drawing its own — so a second dialog repeating the question would be noise.
The one Mufify shows says *how many*, because on Android 10 the next thing to
happen is twelve prompts in a row, and by the time the first appears it is too
late to count.

## Consequences

- Android 8.0 and 8.1 (API 26–27) cannot delete from within Mufify. A file
  manager can, and a rescan then retires the row.
- Android 10 users get one system prompt per file. This is the platform's
  design, not a shortcut here.
- Deleting is a `MediaDeleter` instance owned by `AudioTagsModule`, holding one
  `CompletableDeferred` completed from `OnActivityResult`. Consent is never
  cached: what is being confirmed is *which files*, which differs every time.
- A deleted track keeps its listening history. The stats screens go on counting
  a play that happened, which is the honest answer — it did.
