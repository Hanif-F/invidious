# Phone responsiveness

This implementation plan covers the Invidious browser UI in checkout `a2c76094`. It is written for agents implementing and reviewing the work. Success means a person can complete the existing browser journeys on a phone in portrait or landscape, with familiar controls and the same desktop experience on wider viewports.

## Product decisions

| Area | Phone behavior |
| --- | --- |
| Layout | Reuse the current templates, CSS tokens, icons, themes, URLs, and state owners. Apply the phone shell below 768 CSS px, and below 960 CSS px in landscape when height is at most 500 CSS px. Support portrait from 320 CSS px. |
| Navigation | Keep the wordmark, menu trigger, theme, and account controls in the top row. Put full-width search below. Keep the top row sticky in portrait and let both rows scroll in landscape. Use the same role-aware navigation links in the drawer and its native disclosure fallback. |
| Discovery | Use a single feed-card column in portrait. Keep thumbnail-and-text rows for search, history, and playlists where they fit. Give channels a horizontal core-tab strip with a separately reachable More control. |
| Library | Use Move up and Move down in owned playlist row menus on phones. Reorder within the loaded page. Retain the existing wider-layout grip. |
| Watch | Keep the player in page flow. Keep the stacked sections and add shortcuts to available tools and comments. Phone chat is inline. Preserve the existing chapter and desktop chat behavior. |
| Settings | Use a native category selector and Go button. Keep the current draft, category loading, and browser history behavior. Stack editable matrix fields into labeled groups. |
| Overlays | Keep centered dialogs with contained scrolling. Keep existing action and focus ownership. |
| Completion | Require Chromium and Firefox CI evidence and review the visual artifacts. Physical-phone results can supplement CI. Implementation and verification complete this project. Release is separate. |

The work covers first-party browser HTML in full-web and API-only builds, including standalone and iframe pages, ordinary HTML fallbacks, and fragments that appear after page load. Native clients and their wire contracts, API payloads, RSS and Atom, stream delivery, account and privacy semantics, and database behavior are compatibility boundaries. Changes to presentation helpers are in scope when they support shared markup.

## Baseline

A 390 × 844 Firefox audit used generated production-template fixtures and local assets. On the sampled shared-shell pages, the 224 px sidebar left 166 px for main content. Document widths included 520 px for search, 700 px for a channel, 516 px for history, 596 px for an owned playlist, 620 px for AI Filter, and 741 px for SponsorBlock. The sampled Watch, standalone embed, and verification layouts fit at 390 px. That check measured initial geometry. Chromium launch was blocked by the local sandbox. The implementation must establish fresh behavior and geometry evidence for both engines in CI.

The most recent Watch, chapters, chat, and playlist-save behavior comes from the current source. Some handbook passages predate those changes. Use the route, templates, scripts, and fixture tests to resolve discrepancies. [Frontend architecture](../frontend.md) · [Shared styling](../theming.md) · [Frontend harness](../../tests/frontend/README.md)

## Agent work order

| Work | Start after | Acceptance handoff |
| --- | --- | --- |
| [01 Foundation and shell](01-foundation-and-shell.md) | Initial audit | Shared phone predicate, layout tokens, navigation, common overlays, and desktop shell checks. |
| [02 Discovery and library](02-discovery-and-library.md) | Shared shell and overlay contracts | Route and fragment coverage for browsing and collections, plus playlist move behavior. |
| [03 Watch, player, and embed](03-watch-player-and-embed.md) | Shared shell and overlay contracts | Watch shortcuts, player and tools, clips, embed, and media continuity. Coordinate Save dialog coverage with 02. |
| [04 Settings, account, and status](04-settings-account-and-status.md) | Shared shell and overlay contracts | Settings and forms, standalone recovery, account and operator surfaces, and reading pages. Coordinate history confirmation with 02 and iframe notices with 03. |
| [05 Verification and handoffs](05-verification-and-handoffs.md) | Starts with 01 and closes after 02–04 | Integrated route matrix, CI results, screenshot review, and recorded gaps. |

Foundation owns shared header, drawer, menu, dialog, and geometry behavior. Surface tasks own their presentation, local interaction state, and tests. If two work items edit the same CSS or browser module, coordinate that edit with the listed owner and merge shared changes first. Use the existing component, endpoint, and test harness before introducing a new one.

Resolve small gaps such as spacing, text wrapping, or a missing fixture using the nearest existing component and token. Record the choice and its test in the handoff. Escalate a change to a confirmed interaction, desktop behavior, role visibility, or wire contract to the integration owner and update this plan before implementing it. Keep independent defects in the handoff unless they block the phone journey.

[Implementation handoff and verification evidence](implementation-handoff.md)

## Route and surface index

Paths in braces share an implementation family. Check available tabs, roles, and alternate outputs where the destination varies by data or build. The detailed plans identify the source templates and required variants. [Route registrations](../../src/invidious/routing.cr) · [Route reference](../reference/routes.md)

| Routes or rendered surfaces | Work item |
| --- | --- |
| `/` search home and configured feed redirects, `/search` GET/POST, `/results`, `/hashtag/:hashtag`, `/feed/{popular,trending,subscriptions}` | [Discovery](02-discovery-and-library.md#discovery) |
| `/channel/:ucid` and `/channel/:ucid/{home,videos,shorts,streams,podcasts,releases,courses,shows,playlists,clips,community,posts,channels,search,about}`, `/post/:id` | [Channels and posts](02-discovery-and-library.md#channels-and-posts) |
| `/c/:user`, `/c/:user/:tab`, `/user/:user`, `/user/:user/:tab`, `/@:user`, `/@:user/:tab`, `/attribution_link`, `/attribution_link/:tab`, `/profile`, `/profile/*`, `/channel/:ucid/*` | [Channel destinations and errors](02-discovery-and-library.md#channels-and-posts) |
| `/subscription_manager`, `/feed/history`, `/clear_watch_history`, `/feed/playlists` including `?video_id=`, `/view_all_playlists`, `/playlist`, `/show/:id`, `/mix`, `/feed/clips` | [Library and collections](02-discovery-and-library.md#library-and-collections) |
| `/create_playlist`, `/edit_playlist`, `/delete_playlist`, `/add_playlist_items` GET/POST, owned ordering and row actions, Save dialog and fallback | [Playlist management](02-discovery-and-library.md#playlist-management) |
| `/watch`, `/watch/:id`, `/live/:id`, `/shorts/:id`, `/w/:id`, `/v/:id`, `/e/:id`, `/watch_videos`, `/channel/:ucid/live`, `/user/:user/live`, `/c/:user/live` | [Watch page](03-watch-player-and-embed.md#watch-page) |
| `/clip/:clip`, `/create_clip`, `/delete_clip`, `/embed/`, `/embed/:id`, `/download` form and player-generated surfaces | [Clips and embeds](03-watch-player-and-embed.md#clips-and-embeds) |
| `/preferences` and its categories, legacy fragments, `/preferences/sponsorblock/channels`, `/preferences/spoilers/channels`, `/blocked_channels`, `/preferences/dearrow/identity`, `/admin/settings` | [Settings](04-settings-account-and-status.md#settings) |
| `/login`, `/signup`, `/account`, `/account/username`, `/change_password`, `/delete_account`, `/token_manager`, `/authorize_token`, `POST /api/v1/auth/tokens/register` when it renders browser consent, `/data_control`, `/tv` | [Account and data](04-settings-account-and-status.md#account-and-data) |
| `/verify` including native web handoffs, `/admin/bot-protection`, required-login and verification notices, API-only recovery, `/privacy`, `/licenses`, generic messages and errors | [Standalone and reading pages](04-settings-account-and-status.md#standalone-and-reading-pages) |
| Browser fragments and callbacks such as `/video_actions`, appended browse results, comments and replies, queue, playlist picker and collection responses, and Settings category loads | [Fragment and interaction coverage](05-verification-and-handoffs.md#fragment-and-interaction-coverage) |
| `/redirect` cross-instance handoff, form writes and redirect responses, machine-only routes | Follow the existing destination and test applicable entry forms in the owning work item. The external instance and machine response formats remain outside the layout work. |

Search aliases and configured home use the discovery destination. `/view_all_playlists` points to the playlist library, and `/show/:id` uses playlist rendering. Link and form journeys retain their existing parameters and destinations. This applies to `/signout`, `/toggle_theme`, `/subscription_ajax`, `/subscribe_playlist`, `/playlist_ajax`, `/watch_ajax`, `/token_ajax`, `/preferences/timezone`, `/dearrow_submit`, and `/dearrow_identity`. The resulting browser feedback belongs to the originating work item.
