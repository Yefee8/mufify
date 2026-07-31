# 008 — The audio permission is asked for, not assumed

## Context

The app declared `READ_MEDIA_AUDIO` and `READ_EXTERNAL_STORAGE` in `app.json`
and exposed `hasAudioPermission()` from the Kotlin module. Nothing ever
requested either one. Declaring a runtime permission does not grant it, so the
grant could only ever happen if the user went looking for it in system
settings.

That failure is invisible, which is what made it expensive. A MediaStore audio
query without the permission does not throw and does not return an error: under
scoped storage it returns only the rows the app itself owns, which is none. So
the scan ran, enumerated zero tracks, reported `done`, and the library showed
its empty state — identical to a device with no music on it.

The symptom reached us as "Add music is broken": the picker opened, a folder was
chosen, the screen changed for a moment, and the library came back empty. Every
part of that is the code working as written.

Confirmed on a Mi 9T (API 29): `dumpsys package` reported
`READ_EXTERNAL_STORAGE: granted=false` while `content query` over the same
collection returned rows. After granting, the same build found 14 tracks.

## Decision

**Request the permission before the first MediaStore query, and treat a
permanent denial as its own state.**

`requestAudioPermission()` joins `hasAudioPermission()` in the Kotlin module
rather than being done from JS with `PermissionsAndroid`. The API-level branch —
`READ_MEDIA_AUDIO` from 33, `READ_EXTERNAL_STORAGE` before it — then exists in
one place instead of two that can drift.

It returns `{ granted, canAskAgain }`, not a boolean. A denial the user can be
asked about again and a denial they cannot are different situations: the first
gets a retry, the second gets a link to system settings, because a retry there
is a button that silently does nothing. `permissionErrorFor` maps the answer to
the error code the screen renders and is unit tested, per the rule that logic
belongs in `src/services/` rather than in a hook body.

`addFolder` asks **before** opening the picker. Asking afterwards means a user
who declines has chosen a folder for nothing.

## Consequences

An empty scan result is now unambiguous: it means the library is empty, not
that the app was never allowed to look. That is the property worth having — the
previous behaviour was not a missing feature so much as a missing distinction.

The automatic launch sweep still stays silent when the permission is absent. It
runs behind first paint and a permission dialog on cold start, before the user
has asked for anything, is the wrong moment. The empty state and `Add music` do
the asking, at the point where the user has expressed intent.

MIUI blocks `adb shell pm grant` and `adb shell input` for this package
(`grantRuntimePermission` and `INJECT_EVENTS` both raise `SecurityException`),
so on Xiaomi hardware the permission dialog and every UI gesture have to be
driven by hand. Device verification on this phone cannot be fully automated;
plan on a human tapping.
