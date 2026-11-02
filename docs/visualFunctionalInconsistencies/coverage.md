# Desktop coverage

[Audit index](README.md) · [Findings](findings.md) · [Complete source inventory](source-inventory.md)

This checklist records the baseline audit. See the [resolution record](resolution.md) for the five follow-up fixes and their verification.

The completion boundary is every repository-owned desktop page family and shared interaction, using production templates, current browser assets and local synthetic transports. It is not every combination of content, upstream response, preference, browser version or deployment. Ordinary journeys received priority; unusual lengths, storage failures and lifecycle races were secondary, and much of their coverage comes from the existing suite.

## Surface checklist

All rows below have been reviewed. “No additional finding” records the result within the local test environment, not a guarantee that a surface is defect-free.

| Area | Pages and interactions checked | Evidence/method | Result |
| --- | --- | --- | --- |
| Shared shell | Header/brand, search, sidebar expansion and watch drawer, active navigation, account menu, theme control, footer, skip link, shortcuts, notices, menu/dialog focus and Escape | `overhaul.test.cjs`, `qol.test.cjs`; normal Light/Dark screenshots and keyboard checks | VF-001; secondary VF-004 |
| Discovery | Popular, Trending, country/type selection, explicit Apply, grids, metadata, thumbnail ratios, avatars, empty results | `d3-popular-*`, `d3-trending-*`, main-screen review | No additional finding |
| Search | Search home, mixed video/channel/playlist/hashtag rows, expanded filters, selected chips, clear/apply, scoped and private searches | `d3-search-*`, `channel-search*`, `d4-add*`; browser behavior assertions | No additional finding |
| Hashtag page | Heading, shared cards, pagination and desktop shell | Supplemental `audit-hashtag-light/dark` production template plus shared listing tests | No additional finding |
| Channels | Banner/identity, subscribe controls, About, search/sort, Videos/Shorts/Streams/Playlists/Clips, More and secondary tabs, Posts, RSS/external tools | Channel fixtures, Shows parser/navigation checks, `D3` channel tests and source review | VF-002 styling also applies to inline About links |
| Community and post | Post content, attachment/carousel display, standalone post, comment loading, replies, continuation and explicit retry | `d3-community-*`, `d3-post-*`, comment-thread tests and screenshots | VF-002 styling also applies to ordinary inline comment links; synthetic duplicate IDs excluded |
| Subscriptions | Search/filter/sort, latest/unwatched/new-upload choices, manage link, new-upload/Refresh notice, selection and loaded-item operations | `d4-subscriptions-*`, `D4` tests, request assertions | No additional finding |
| Subscription manager | Sorting, channel statistics and unknown values, subscribe/unsubscribe, bulk confirmation, import/export access | `d4-manager-*`, subscription tests and source review | No additional finding |
| History | Search, total count/date groups, unknown metadata, loaded batches, selection/removal, paused recording and clear-history confirmation | `d4-history-*`, `d4-clear-history`, QoL/library tests | VF-005 confirmation consistency |
| Playlist library | Owned versus saved references, covers, empty library, add-video entry, source flags and actions | `d4-library-*`, playlist browser checks and screenshots | No additional finding |
| Playlist and mix pages | Owned/guest/empty lists, play/save/unsave/RSS, description, add/remove items, duplicate occurrences, pointer/keyboard ordering and ordinary pagination | `d4-playlist-*`, `d4-mix-*`, `D4`/QoL tests | No additional finding |
| Playlist forms | Create, edit title/privacy/description, delete versus unsave, add-items search/filter, validation and uncertainty messages | `d4-create/edit/delete/unsave/add*`, `playlist-forms.js` tests | VF-005 |
| Watch/player | Standard/Theater, real media identity, controls, play/pause/seek/volume, captions and appearance, speed, quality/codec/audio identity, audio-only, portrait, DASH/HLS, chapters, buffer refresh, diagnostics | `d5-*`, `ui.test.cjs`, stream/player unit tests; detailed Settings screenshots | No additional finding in the exercised player controls |
| Watch details/actions | Title/stats/creator/subscribe, description/timestamps/details, Save dialog, Share/copy fallback, download options, More/external destinations and annotations | Watch fixtures, `D5` tests, source review and inline-link replay | VF-002; secondary VF-003 |
| Watch utilities | Queue/current/previous/next, exact occurrences and removal, Up next/play-next, Transcript search/language/follow/seek/retry, comments, Chat replay/sync/settings/timing/filtering | `d5-queue/replay/owned-*`, `d6-comments-*`, transcript/replay screenshots and tests | No additional finding |
| Mini player | Explicit enablement, docking, play/pause/mute, return/dismiss, preservation of original media and clip exclusions | `qol.test.cjs`, `player-dock.js`, existing real-player checks | No additional finding |
| Clips | My Clips, channel clips, source links, owner/public playback, immutable bounds/loop, inline and standalone creation, range/title/preview/publish/copy, delete and unavailable pages | `clips-*`, `channel-clips`, `d6-clip-*`, clip unit/browser tests and screenshots | VF-005 confirmation consistency |
| Settings categories | Appearance, Language/region/timezone, Browsing & feeds, Playback, Captions/comments, Library, SponsorBlock, DeArrow, AI filter; local search, Save/Discard, drafts and ordinary forms | All nine `settings-*` forms, `D2`/`D8` tests, screenshots and persistence renderer checks | VF-001 |
| Dedicated settings | Channel SponsorBlock defaults/inheritance/removal, title/thumbnail masking and reveal age, blocked-channel manager, DeArrow identity, Chat replay settings | Dedicated account/guest/empty/error fixtures, `D6` tests, source review and screenshots | No additional finding |
| Enhancements/actions | SponsorBlock modes/markers/skips, DeArrow replacement/original reveal/vote/proposal/review/identity, AI action matrix and placeholders, block/Undo, masking of titles/posters/cards, watched/progress indicators | `D6`, `ui.test.cjs`, renderer checks and contribution/editor screenshots | No additional finding |
| Authentication/account | Login/signup/CAPTCHA, retained failed username, rename/password forms, account tools, sign-out and account deletion | `account-surfaces.test.cjs`, account renderer checks, Light/Dark main-screen review | VF-005 confirmation consistency |
| Sessions/authorization/TV | Current/other/API session identity, revocation confirmation, empty sessions, permission/expiry/callback consent, issued token display, TV code/approve/deny/completion | Account-surface tests and normal screenshots | No additional finding |
| Data import/export | Source selection and upload for Invidious, YouTube subscriptions/playlists/history, FreeTube, NewPipe subscriptions/full archive; grouped exports and partial-failure guidance | All seven `d7-data-*` source screens, multipart/form assertions and source review | No additional finding |
| Administration/verification | Instance settings/role visibility, private-instance controls, environment-managed fields, bot protection/duration, browser/native verification and explicit retry, minimal API-only recovery login | Required-login/admin and verification suites, recovery renderer, standalone screenshots | VF-001 also affects exposed admin Feed menu defaults |
| Reading/status/error | Privacy, JS licenses, messages, known/unexpected/unavailable/not-found errors, details disclosure, safe destinations/reports and failed-write recovery | Status suite, production-route renderer and screenshots | Legal-page links provide the comparison for VF-002; no additional finding |
| Embedded player | Full desktop viewport, portrait/audio/progressive/DASH/HLS, shared Settings/captions/speed, playlist/series continuation, masking, explicit watch link and login/verification recovery | Dedicated embed suites, corrected actual-document captures at desktop sizes | No additional finding; initial attachment-stub captures discarded |

## Verification record

- The production frontend renderer and API-only recovery renderer completed successfully. They exercise real ECR/Crystal presentation and numerous preference/route projection contracts without contacting YouTube or a production database.
- The complete declared frontend command reported **910 tests passed, 0 failed, 0 skipped, 0 cancelled** in **639.174 seconds**, using Chromium and Firefox. The retained suite includes compatibility checks outside this audit's focus; they do not constitute a mobile/tablet audit.
- A separate document sweep checks page width, visible labels, duplicate IDs and content geometry at 1280 × 720, 1440 × 900 and 1920 × 1080. Heuristics were treated as leads and reviewed before becoming findings.
- The normal visual review covers 108 representative screen states, with corrected captures of the five embed states, plus supplemental hashtag and configured-menu views. Detailed player Settings, transcript, replay, clip editor, contribution dialog, menu and drawer images from the successful suite were inspected separately.
- The source inventory accounts for **93 templates/components, 50 unminified first-party JavaScript modules and 13 unminified stylesheets**. Required vendor player assets were exercised through their integrated controls rather than treated as independent application pages.

See [run metadata](evidence/run-summary.json), [suite output](evidence/frontend-suite.tap), and the [source inventory](source-inventory.md). The suite reached its complete TAP summary; the later terminal-session collection returned status 143, so the retained TAP result is distinguished from a clean shell teardown. This was not converted into an application defect.

## Boundaries

No deployed application URL or configured production runtime was supplied. Real account/database writes, upstream search/video/comment/provider availability, production caching/proxy behavior and physical OS fullscreen/PiP/codec behavior are not certified by this audit. Synthetic transports let the desktop UI and request behavior be exercised without changing useful accounts or sending real votes.

Mobile/tablet layouts, native Android/iOS/TV applications, every language/browser combination, hardware/device acceptance and a comprehensive security or accessibility standards assessment are outside this desktop review. Desktop RTL, enlarged text, focus/forced colors and reduced-motion cases already present in the suite were retained as secondary consistency checks.
