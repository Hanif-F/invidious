# AI channel filter

Preferences → Enhancements → AI channel filter offers independent AiSList
blocklist (high confidence) and warnlist (moderate confidence) controls for
Popular/Trending, search/hashtags, and watch recommendations. All six settings
default off. They are saved to account preferences or the guest preference cookie
and included in existing preference exports/imports and account preference JSON.
The public discovery APIs remain unpersonalized; native clients are unchanged.

The filter hides video cards only. Subscriptions, playlists, history, channel
pages, scoped library/channel searches, direct links and current playback remain
accessible. Manual channel blocking and membership filtering continue to apply
independently. Pagination uses the original upstream result count; filtered pages
can contain fewer videos. Removed recommendations cannot become autoplay targets.

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
