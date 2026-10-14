# Channel titles and thumbnails

Open **Preferences → Enhancements → Channel title and thumbnail settings → Manage channel settings**, or the same link on
a channel or watch page. Select a channel by ID or `/channel/UC…` URL, choose
**Hide title**, **Hide thumbnail**, or both, then save.

The optional **Reveal after this many days since upload** field is shared by both
switches. Enter `7` to hide selected content for the first seven days after upload.
Leave it blank to hide indefinitely. Reset, or turn both switches off, to remove
the rule. These settings cover video cards, search, feeds, history, playlists,
mixes, recommendations, queues, clips, and watch/embed titles and player posters.

Upload age uses available publication metadata and existing local caches. Missing
or synthetic dates remain unknown: the placeholder explicitly says **upload date
unknown**. There are no additional YouTube lookups. Clip age uses the source
video's publication date, rather than the clip creation date. Date-only metadata
uses midnight UTC; exact timestamps retain their precision. Expiry is checked
when loading content, without a background timer changing an open page.

Click a hidden thumbnail to reveal its original image. That first click does not
open the video; clicking again follows the link. A hidden player poster has its
own reveal button that does not start playback. Hiding does not prevent playback
or autoplay. Scrubbing previews remain disabled while the poster is hidden.

The title uses the existing blue DeArrow button. With DeArrow enabled and a
replacement available, clicks cycle **Hidden → DeArrow → Original → Hidden**.
Otherwise they cycle **Hidden → Original → Hidden**. A hidden title stays hidden
while its replacement loads; hover and keyboard focus alone never reveal it.
With DeArrow enabled, hidden card titles prefetch replacements within 200 pixels
of the viewport, and watch/embed titles fetch immediately. Prefetching keeps
titles hidden and caches the result for the first click. Clicking before the
request finishes waits for that same request.
The explicit cycle is available even when the global original-title switch is
off. Reveals are per displayed occurrence and reset on navigation or reload.

Signed-in settings are account preferences and work for initial rendering without
JavaScript. Guest settings use this browser's isolated guest storage and require
JavaScript. Reveal interactions also require JavaScript. Account saves never copy
guest settings. Storage errors are reported on the guest settings page.

Account JSON/YAML preferences and existing full preferences GET/PUT and
export/import include `channel_spoiler_settings`, a map keyed by channel ID. Each
entry has `name`, `hide_title`, `hide_thumbnail`, and nullable positive integer
`reveal_after_days`. Empty and invalid entries are discarded. Other preference
saves preserve the map. No database migration is required. Public video metadata
and native app interfaces keep their existing behavior.

Blank delays serialize explicitly as `null`; omitted delays in older saved rules
also mean indefinite hiding. Both forms retain the same manual reveal controls.
The browser runtime receives only hiding switches and delays, without channel
names. Accounts with no rules load no masking assets or extra card attributes;
guests with no local rules install no masking observer. Guest storage changes
still activate rules in an already open tab by reloading it.

Date fallback reads only missing publication dates in a batch. Account lookups
include matching channels only; guest lookups use the optional browser marker
because guest channel rules are stored locally. Known dates and inactive rules
require no fallback reads. Results and misses are retained for the request;
the database returns publication fields rather than full cached video JSON.

An active channel thumbnail rule takes precedence over an AI warning image;
explicit reveal shows the original thumbnail. Existing filters that remove a
video still apply. Browser-tab titles, player overlays, share titles, notifications,
and accessibility labels respect title hiding. The setting changes presentation,
not access to video metadata or descriptions.
