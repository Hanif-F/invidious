# AI channel filter

Preferences → Enhancements → AI channel filter offers independent AiSList
blocklist (high confidence) and warnlist (moderate confidence) controls for
Popular/Trending, search/hashtags, and watch recommendations. Each list has a
Discovery action: **Hide videos** (the existing default) or **Replace thumbnails**.
All six Discovery switches default off. Each list also has an independent
**Replace thumbnails on other pages** switch, default off, covering subscriptions
and notifications, history, playlists/mixes, channel videos, scoped searches,
watch queues and clip cards. These pages only replace thumbnails; AiSList never
removes their videos or changes their order or autoplay eligibility.
The settings are saved to account preferences or the guest preference cookie
and included in existing preference exports/imports and account preference JSON.
The public discovery APIs remain unpersonalized; native clients are unchanged.

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

The additive preference fields are `ai_blocklist_action` / `ai_warnlist_action`
(`hide` or `replace_thumbnail`, with invalid values normalized to `hide`) and
`ai_blocklist_other_pages` / `ai_warnlist_other_pages` (booleans). Instance defaults
use the same names. Existing preferences require no migration.

The server downloads the official
[blocklist](https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt)
and [warnlist](https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_warnlist.txt)
at startup and every six hours. Each list is validated and persisted independently;
failed downloads keep the last successful copy. Preferences shows parsed channel
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
