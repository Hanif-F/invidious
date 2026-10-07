# Native clips

Signed-in users can create public 5–120 second clips from playable videos and
completed livestream archives. Click **Create clip** beside **Share** to open a
centered desktop popup or a full-screen mobile overlay. Choose a title and range,
preview inside the popup, and publish without leaving the watch page. A successful
publish shows **Copy link**, **Watch clip**, and **Done**; if copying is unavailable,
select and copy the displayed link.

Enter whole-second timestamps as **MM:SS** (for example, `00:01`) or **HH:MM:SS**
(`01:00:05`). Both fields show hours when either boundary reaches an hour.
The highlighted timeline has keyboard-accessible start/end handles, one-second
adjustments, and **Use playback time** buttons. These capture the preview's
playhead, or the main player's position when the popup opened. The initial
selection spans 30 seconds around the current position rounded down to a whole
second, bounded by the source duration. The 5–120 second clip limit still applies.

Opening pauses the main player; closing resumes it only if it was already playing.
Closing keeps an unpublished draft for reopening within that page. Changing the
range stops the previous preview, and closing unloads it. Preview playback never
saves full-video resume positions. Guests sign in and return to the popup.
The normal `/create_clip` form also works without JavaScript and is used if popup
assets cannot load. It accepts formatted timestamps and existing numeric-second
submissions, retaining typed fields after validation errors.

Published clips play the selected range on a loop, with a
loop toggle and a link to the full video. Playback does not change full-video
resume positions.

**My Clips**, directly below **Playlists** in Library, lists clips created by the
current account. Each source channel also has a public **Clips** tab containing
clips made by all users on this instance. Lists contain 30 clips per page, newest
first. The creator's current username is public; internal account identifiers are
not included in public metadata.

Published titles and ranges cannot be edited. Owners can delete their clips after
confirmation. Deletion removes the clip from both lists and makes its permalink
return 404. Deleting an account removes its clips too.

## Storage and upgrades

Clips contain metadata and source timestamps; no media is extracted or stored.
Migration **19** creates the persistent `clips` table. For existing installations,
back up the database and run the application's existing `--migrate` command before
starting the upgraded application. Fresh-install SQL, Docker initialization, and
`check_tables` include the table.

Video cache eviction does not delete clips. If the original video becomes
unavailable or its duration no longer contains the selected range, the clip shows
an unavailable state and remains stored for retry or deletion.

Native clip IDs start with `IVCL`. Existing YouTube clip IDs retain their prior
resolution and playback behavior. Native clips remain local to their instance;
switching instances does not transfer them.

## API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/v1/clips/:id` | Public clip metadata; native IDs are read locally, YouTube IDs use the existing resolver |
| GET | `/api/v1/channels/:ucid/clips?page=1` | Public array of clips from the source channel |
| GET | `/api/v1/auth/clips?page=1` | Array of clips created by the authenticated account |
| POST | `/api/v1/auth/clips` | Create an immutable public clip; returns 201 and `Location` |
| DELETE | `/api/v1/auth/clips/:id` | Delete an owned clip; returns 204, or 404 if absent/not owned |

Creation takes a JSON object:

```json
{"videoId":"2isYuQZMbdU","title":"A memorable moment","startTime":10.25,"endTime":40.25}
```

Times use seconds and are stored at millisecond precision. Native metadata has
`type: "invidiousClip"`, `clipId`, `clipTitle`, `startTime`, `endTime`, `creator`,
`createdAt` (Unix seconds), `url`, and saved source metadata under `video`.
Native lookup does not fetch the source video. Legacy YouTube lookup responses
retain their existing shape.

The popup obtains a browser-session token from `/api/v1/auth/csrf`, then posts
numeric seconds to the existing authenticated creation API. Whole-second
timestamp editing does not change API schemas or existing fractional clips.

Use existing API authentication and method/path scopes (`GET:clips`, `POST:clips`,
`DELETE:clips/*`). Browser-session mutations require a valid CSRF token. All
authenticated responses use `private, no-store`.

Mobivious native sign-in now grants these three permissions. Existing mobile
tokens retain their original scopes; sign out and sign in again after deploying
the update. Android's token management groups expose clip reading separately
from creation/deletion. No additional migration is needed beyond migration 19.
The public channel API advertises `clips` in website tab order, between playlists
and posts, independently of YouTube's discontinued clips tab.

The native editor retains tenths of a second; saved clips retain their original
millisecond bounds. Android uses Media3 clipping so system controls and player
seeks operate within a timeline from zero to the clip duration. Native clip
permalinks retain their origin instance, and foreign-instance links do not switch
the configured Android server.

Active livestreams, clip editing, native clip embeds, federation, and clip
import/export are excluded from this version. YouTube's clipping permission
settings do not control native clips.

## Verification

Run `crystal spec`, the normal/API-only builds, and the frontend harness described
in `tests/frontend/README.md`. Database/route checks require an **empty disposable**
PostgreSQL database named `invidious_clips_test`:

```sh
CLIPS_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_clips_test crystal run tests/database/clips.cr
```

The harness checks migration tracking, public access, scopes, CSRF, ownership,
escaped rendering, immutable playback bounds, cache eviction, username changes,
pagination, account deletion, and the fresh-install schema. Remove the disposable
database after testing.
