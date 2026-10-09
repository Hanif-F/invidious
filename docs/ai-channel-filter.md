# AI channel filter

Preferences → Enhancements → AI channel filter starts with **Enable AI Channel
Filter**, a master switch for both lists on every supported page. Turning it off
pauses hiding, thumbnail replacement and filter-triggered channel lookups without
clearing any choices. Edit the actions while paused, then enable the filter and
**Save preferences** to apply them. Settings are saved to the account or the guest
preference cookie, and included in preference JSON and exports/imports.

The section explains AiSList's **High confidence — Blocklist** and **Moderate
confidence — Warnlist** community classifications. They may be incorrect; Invidious
does not perform automatic AI detection. Each page group has a separate action for
each list:

| Page group | Applies to | Actions |
| --- | --- | --- |
| Popular and Trending | Videos in these feeds | Off, Hide videos, Replace thumbnails |
| Search and hashtags | General search and hashtag pages | Off, Hide videos, Replace thumbnails |
| Watch-page recommendations | Suggested videos beside or below the player | Off, Hide videos, Replace thumbnails |
| Library, channels and queues | Subscriptions/notifications, history, playlists/mixes, channel videos, channel/subscription searches, watch queues and clip cards | Off, Replace thumbnails |

Off leaves matching videos unchanged. Hide removes matching video cards from that
page and excludes hidden recommendations from autoplay. Replacement retains the
card and shows a warning instead of its image. Library/channel/queue pages never
hide AI matches, change their order, or change their autoplay eligibility.
The controls and the **List status and technical details** disclosure work without
JavaScript. Public discovery APIs remain unpersonalized. Mobivious uses the public
classification API described in [Mobile API](mobile-api.md#ai-channel-filter).

Replacement thumbnails use a muted charcoal background and grey, regular-weight
text: “Likely AI-generated” with “AiSList Blocklist”, or “Possibly AI-generated”
with “AiSList Warnlist”. They replace the image markup entirely, including in thin
mode, while preserving links, titles and controls. Player posters, avatars and
aggregate playlist covers retain their existing behavior. Direct links and current
playback remain accessible. Manual channel blocking and membership filtering continue to apply
independently. Pagination uses the original upstream result count; filtered pages
can contain fewer videos. Removed recommendations cannot become autoplay targets;
replaced recommendations remain eligible. If both enabled lists match on a
Discovery page, Hide wins over replacement. When both request replacement, the
Blocklist warning takes precedence. Other-page replacements always use the
Blocklist warning when both lists match.

The canonical preference fields are `ai_filter_enabled` (boolean) and eight
`ai_{blocklist|warnlist}_{feeds|search|recommendations|other_pages}_action` strings.
Discovery actions accept `off`, `hide` and `replace_thumbnail`; other-page actions
accept only `off` and `replace_thumbnail`. Invalid new actions resolve to `off`,
including `hide` on other pages. Instance defaults accept the same fields.

All actions default off. Missing master values use an explicitly configured
instance master default, otherwise enablement is inferred from any active action.
An explicit master value always wins. Legacy booleans and per-list shared actions
remain readable: checked discovery pages inherit the old shared action, unchecked
pages become off, and checked other-page switches become replacement. Explicit
new actions win over legacy fields; saved legacy page choices win over new instance
action defaults. Effective canonical values are written on the next save/export.
The versioned settings form preserves actions when fields are omitted and keeps
new settings intact when an older form is submitted. No new preference migration
is required for this settings overhaul.

The server downloads the official
[blocklist](https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt)
and [warnlist](https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_warnlist.txt)
at startup and every six hours. Each list is validated and persisted independently;
failed downloads keep the last successful copy. The settings disclosure shows parsed channel
counts, the last successful download time in UTC, and unavailable/stale status.
The source files' `Last Modified` comments are not used as download timestamps.
These are community classifications, not automatic detection performed by Invidious.
The source lists declare [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
The list data is downloaded at runtime and is not bundled with the source code.

YouTube handles are learned from author navigation endpoints already present in
browsing responses. Matching uses exact normalized handles or canonical channel
IDs, never creator display names or arbitrary text. Unknown handles require one
channel-metadata lookup through the instance's existing YouTube client. Lookups are
shared across users, deduplicated, limited to four workers and a bounded queue, and
cached for seven days. Failures and channels without a handle are retried after an
hour. No metadata lookups are scheduled when the relevant filter is off or its
lists are unavailable; direct channel-ID matches also need no lookup.

Each page waits at most two additional seconds for all its missing handles together.
Unresolved videos remain visible and queued lookups finish in the background for
later visits. Queue saturation also leaves unresolved videos visible. No account
identifier or viewing history is sent to AiSList; GitHub receives only periodic
list downloads. Normal browsing can populate the shared handle cache even with
filtering disabled, without additional YouTube requests.

Existing deployments need migration **22** (`--migrate`) before starting the updated
server. Fresh-install SQL includes `ai_slist_snapshots` and `channel_handles`.
Both tables are shared caches; handle entries expired for over seven days are
pruned by the refresh job. Existing preferences require no migration.
