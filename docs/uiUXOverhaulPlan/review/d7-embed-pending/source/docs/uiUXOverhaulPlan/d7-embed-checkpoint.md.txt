# D7 embedded-player checkpoint

[Master plan](README.md) · [D7 acceptance](d7-acceptance.md) · [Contract](d7-contract.md) · [Evidence](review/d7-embed-evidence.json)

Minimal embedded media and required-login iframe recovery are locally verified
on 31 October 2026. This checkpoint completes D7 alongside its three earlier
checkpoints. D8–D9 and overall goal acceptance remain required. Nothing has been
deployed.

## Embedded surface and controls

The standalone embed uses Foundation and the shared player interface without
application navigation or the retired default/Diary/Pure styles. The existing
media element fills the iframe with contained video, including portrait content.
Shared Settings retains real quality/audio/caption/speed callbacks and ordinary
disabled-control behavior. Masking, paused long titles, notices and a bounded
thumbnail Reveal control fit the media surface. Forced-color controls have an
opaque system-color background so arbitrary video cannot obscure their contrast.

Open on Invidious is a labeled real anchor rather than a nested interactive
control. It opens a new window with playlist/occurrence context, the known
playhead and current speed/listening/proxy choices; previews retain their bounds.
Source attributes, caption labels/URLs, metadata and inline JSON are escaped
without changing decoded values. Opaque HLS manifest/segment query values remain
intact when adding the proxy flag. Compatible playlist redirects preserve spaces,
Unicode, literal plus signs and existing query fields.

The embed controller owns one cancelable next-item read and one ended callback.
It retains exact decimal Int64-sized cursors and duplicate explicit-series
entries. A failed read offers explicit Retry rather than automatic repeated
requests. Looping and bounded previews do not advance. Departure, profile changes
and disposal invalidate old work; cached return waits for the canonical profile
owner. The shared player guards delayed reload/source restoration, speed-CSRF
preflights, position callbacks and keyboard work while retaining permitted final
pagehide position delivery. No owner rebuilds the media element.

## Access and recovery

Required-login gate failures carry the noncredential
`X-Invidious-Login-Required: 1` marker, CORS-exposed on API/media errors. Existing
JSON fields/scopes stay compatible. A denied framed GET has a script-free 401
notice and explicit new-window sign-in/watch action, with its original context.

Private watch/embed pages can load the access owner without a bot pass. A media
failure checks HEAD on the existing local stats route, then existing verification
discovery when appropriate. Login and verification failures stay distinct;
outages and unrelated endpoint/scope 401 responses do not establish expired
instance access. Recovery performs no video/provider lookup or write replay.

Framed recovery pauses/disposes playback and retires enhancement consumers before
replacing the media with readable recovery. It clears stale title/thumbnail/social
metadata. The page-local last positive playhead, including seek/pause events,
survives a failed reload that resets media time. Fetch/XHR responses and explicit
probes from before departure cannot interrupt a returned page. Private state is
not copied into browser storage by this owner.

## Verification and retained phases

- Combined account/data/verification/reading/embed/access/controller/playback run:
  **106/106**. This precedes only the final seek-event refinement and forced-color
  control-bar correction below.
- Final embedded media, verification and access run: **46/46**, including actual
  cross-origin private-iframe media denial, completed seek/time preservation,
  ignored old fetch/XHR/probe denials, HLS decode/refresh and forced-color keyboard
  checks. Final control-bar styling is additionally verified by **4/4** focused
  embed/watch geometry/forced-color cases. These overlapping totals are not added.
- Shared actual-player/watch/D6 runtime regression: **98/98**; shared storage,
  masking, clip and stream-identity boundaries: **68/68**; shell/category/Settings
  entry checks: **10/10**. The 98-case phase predates only the final access
  seek-event and forced-color refinements covered by the later focused runs.
- Relevant native/audio/masking/clip/web preference specs: **43 examples**, no
  failures. Final normal/API-only application type checks, fresh production
  fixture build/render, JavaScript syntax, Crystal format, references,
  documentation and whitespace checks pass.
- Fresh guarded production QoL/security and required-login harnesses pass:
  playlist ownership/duplicates/cursors/concurrency/library/security, compatible
  embed redirects, framed recovery/marker, legal methods, credentials/scopes/CSRF,
  whitelist, signed feeds and administration. The final task-container guard
  confirms loopback-only access, 24 account tables and zero other database clients.

Initial phases found the thumbnail overlay covering controls and a test-only
reload of an attached MSE blob in Chromium. Corrected geometry/HLS checks passed
4/4. The first fresh backend QoL run exposed the actual query-stripping redirect;
its corrected rerun passes. A subsequent embed run passed 19/20 because Firefox
raced an uncompleted seek against denied reload. The final test waits for actual
seek completion, and the access owner also records seek/pause events; the final
46/46 includes that correction. Earlier failed logs are retained, not presented
as acceptance. Temporary evidence from before device shutdown is not reconstructed
or added to these resumed-run totals.

Seven inspected views are retained: [Light](review/d7-embed-pending/images/chromium-single-light.png),
[Dark Settings](review/d7-embed-pending/images/chromium-settings-dark.png),
[masked](review/d7-embed-pending/images/chromium-masked-dark.png),
[enlarged RTL](review/d7-embed-pending/images/firefox-single-rtl.png),
[portrait](review/d7-embed-pending/images/firefox-portrait-light.png),
[forced colors](review/d7-embed-pending/images/chromium-forced-colors.png) and
[private recovery](review/d7-embed-pending/images/chromium-private-expired-dark.png).

All browser/media/provider traffic is intercepted synthetic data. PostgreSQL and
HTTP work use only task-owned local fixtures. No deployed server, upstream service
or native device was contacted; the TV work remains the web approval surface,
not native TV application development. Eighteen preceding manifests and their
701 existing review files remain unchanged. D8 owns the full repository matrix,
legacy asset/module retirement and remaining old assertions; D9 owns final
semantic documentation and requirements reconciliation.
