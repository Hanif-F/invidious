# Verification and handoffs

Use the production ECR fixture renderer and Playwright harness. The required evidence comes from deterministic Chromium and Firefox CI. Record any optional physical-device checks separately. [Frontend verification](../../tests/frontend/README.md) · [Frontend CI](../../.github/workflows/frontend.yml)

## Matrix and pass criteria

| Coverage | Required matrix |
| --- | --- |
| Geometry smoke | Every distinct HTML page family in the fixture map below, in Chromium and Firefox, at 320 × 568, 390 × 844, and 844 × 390. Map shared-template routes to a representative fixture and add variants when a route changes the template, available controls, or dominant content. |
| Breakpoints | Use 767 × 900 and 768 × 900 for the portrait shell, and 359/360 px for dense rows. Use 959 × 390 and 960 × 390 for phone landscape and Watch stacking. Use 844 × 500 and 844 × 501 for landscape height. Exercise 1099/1100 px on Watch for docking and 568 × 320 for the drawer, player and dialogs. Resize live pages as well as opening at the destination size. |
| Narrow and accessibility variants | Use a narrow fine-pointer and keyboard context, a coarse-pointer touch context where the browser supports it, enlarged text, RTL, Light/Dark/System, forced colors, and reduced motion. For enhanced dialogs and forms, simulate a shortened visible viewport and verify focus visibility and action reachability. Check 320 × 180 and 640 × 360 embedded frames. |
| Ordinary HTML and roles | Disable JavaScript for the shell, search/filter/paging, playlist fallback, Watch/download/comments, Settings and account forms, standalone errors, and embeds. Exercise guest, signed-in, owner/nonowner, administrator/denied, required login, enabled/disabled feature, and API-only variants where the role or build changes the result. |
| Wider regression | Keep existing desktop cases at 1280 × 720, 1440 × 900, and 1920 × 1080. Compare shared shell, discovery, owned playlists, Watch theater and dock, Settings and forms, and embeds against the existing assertions and representative screenshots. |

- Assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1` at the intended viewport and inspect the relevant component rectangles and scrollers. A hidden, offscreen, overlapped, or clipped required control fails even if the document width fits. Test both initial and open/active states. For expected horizontal scrollers, assert the scrolling stays inside that element and the keyboard can reach its content.
- Verify primary controls have reachable targets, visible focus, and readable labels. When an action is below the fold, scroll to it and exercise it. For overlays, assert their boxes fit the usable viewport or have a reachable internal scroll path. Test keyboard and touch dismissal, active focus, and restoration. For sticky headers and notices, check the focused or anchored element remains visible.
- Assert the existing request method and payload where the UI submits or fetches. Check one request per activation, no new mutations on reflow, preserved private search and role rules, bounded explicit retries, and stale response handling. Compare player element/source and playhead around rotation, modal use, and breakpoint transitions. Check exact occurrence IDs and Settings drafts after responsive transitions.
- Use role/label and behavior assertions where practical. Use geometry checks for known failure modes. Record reviewed screenshots alongside those assertions. A green page-width assertion or a screenshot alone is insufficient.

## Fixture map and required journeys

Fixture names below omit `.html` and common theme suffixes. Use the existing fixture under the owning suite and check that its route, role, and controls match the case. Render additional variants with the same production templates when a listed branch is absent. Keep generated output under `tests/frontend/.generated/`.

| Work | Fixtures to start from | Required journeys and gaps to cover |
| --- | --- | --- |
| Foundation | `overhaul-browse`, `overhaul-watch`, `overhaul-settings`, `d3-search-home`, `browse-signed-in` | Guest and signed-in header and search, drawer open/close and focus, resize with drawer open, role-filtered navigation, native disclosure without script, account menu, theme, notices, and edge-positioned menus. Verify the script-load failure fallback as well as JS disabled. |
| Discovery | `d3-search-*`, `d3-popular-*`, `d3-trending-*`, `audit-hashtag`, `qol-search-*`, `qol-browse-*` | Configured home, search and aliases, filters and chips, scoped and private searches, mixed card/row types, long content, empty and filtered batches, continuation retry, ordinary pagination, and GET Back/scroll restoration. |
| Channels and posts | `d3-channel-more`, `channel-search*`, `channel-playlists-*`, `channel-clips`, `upstream-shows`, `d3-community`, `d3-post*`, `d3-thread-*.json` | Core and overflow tabs, About, availability, channel identity/actions, scoped search, sort and community, post images/embeds, and reply continuation. Add targeted renders for any distinct tab layout or content type that is missing. |
| Collections | `d4-subscriptions*`, `d4-manager`, `d4-history*`, `d4-clear-history`, `d4-library*`, `d4-playlist*`, `d4-mix`, `clips-library`, `clips-empty` | Subscription shortcuts and notifications, history groups, signed-in bulk selection, loaded scope and partial results, private/owner playlist variants, saved reference and mix, duplicate occurrences, Move up/Down and stale recovery, and clip lists. |
| Playlist forms and Save | `d4-create*`, `d4-edit*`, `d4-delete`, `d4-add*`, `d4-library-add`, `watch-actions` | Create/edit/delete, private add-items search, ordinary save fallback, one-attempt add, dialog native selection and inline creation, empty choices, return focus, resize during pending write, and uncertain outcomes. |
| Watch and tools | `d5-single`, `d5-no-tools`, `d5-long`, `d5-owned`, `d5-queue*`, `d5-portrait`, `d5-audio`, `d5-dash`, `d5-replay`, `watch-chapters`, `watch-chat-only`, `d6-comments*`, `d6-contribution-*` | Available shortcuts and focus, player state through rotation, touch settings, subtitles, fullscreen return, queue/remove/retry, transcript follow, chapters and SponsorBlock, inline chat and timing, watch history and progress, comment replies, share, save, download and DeArrow. Include disabled tools and at least one locale with long or RTL labels. |
| Clips and embed | `create-clip`, `watch-clips-*`, `d6-clip-*`, `d7-embed-*`, `embed-mobile` | Same-player preview/publish/restore, ordinary create, guest/owner/unavailable playback and delete, standalone and iframe geometry, caption and settings menus, source modes, required-login/verification, precise queue identity and recovery, and no-JavaScript playback. |
| Settings and admin | `settings-*`, `d6-settings-*`, `d6-sb-*`, `d6-masking-*`, `d6-blocks-*`, `d6-identity-*`, `d6-chat-settings-*`, `admin-settings*`, `preferences-admin*` | Every category and editor, stacked controls, role-filtered native selector, Go versus selection alone, search and field deep links, existing Back behavior, category drafts and retry, legacy bookmarks, ordinary forms, and full-web and API-only admin. |
| Account and data | `d7-login*`, `d7-signup*`, `d7-account*`, `d7-delete*`, `d7-sessions*`, `d7-authorize*`, `d7-token-issued`, `d7-data-*`, `d7-tv*`, `d7-api-login` | Login and registration/CAPTCHA, account writes and error focus, deletion, authorization and sessions, seven import types and partial outcomes, export links, TV approval and recovery, and ordinary forms. |
| Standalone and reading | `d7-verify-*`, `d7-api-verify`, `d7-api-cloudflare`, `d7-api-error`, `d7-status-*`, `d7-embed-login` | Browser, native, and Cloudflare handoffs, API-only recovery, admin approval or denial, provider retry and expiry, privacy and license scrolling, feature-disabled messages, full-web and iframe errors, and no-JavaScript recovery links. |

### Template audit

Use the following to reconcile fixture coverage with the actual renders. Paths in this table are relative to `src/invidious/views/` and omit `.ecr`. A shared renderer can cover multiple routes when its branch-specific UI also appears in the fixture. [View tree](../../src/invidious/views)

| Work | Page templates and shells |
| --- | --- |
| Foundation | `template`, `overhaul/shell`, `overhaul/navigation` |
| Discovery and library | `search_homepage`, `search`, `hashtag`, `channel`, `channel_search`, `channel_clips`, `community`, `post`, every `feeds/*` page, `user/subscription_manager`, `user/clear_watch_history`, `playlist`, `mix`, `create_playlist`, `edit_playlist`, `delete_playlist`, `add_playlist_items` |
| Watch, clips, and embed | `watch`, `embed`, `create_clip`, `delete_clip`, `clip_unavailable` |
| Settings and account | `overhaul/settings`, `overhaul/chat_settings`, `user/{sponsorblock_channels,channel_spoilers,blocked_channels,dearrow_identity,login,account,delete_account,authorize_token,token_manager,data_control,tv_pairing}`, `admin/settings`, `admin/standalone_shell` |
| Standalone and reading | `verification`, `cloudflare_verification`, `admin/bot_protection`, `overhaul/standalone_notice`, `overhaul/status_shell`, `error`, `message`, `privacy`, `licenses` |

Add an actual API-only `/admin/settings` render to the recovery fixtures if the available admin fixtures only cover the full-web shell. Check both permitted admin rendering and recovery behavior. The existing API-only renderer already covers login, verification, Cloudflare handoff, and error output. [API-only fixture renderer](../../tests/frontend/render_recovery_fixtures.cr)

### Fragment and interaction coverage

Exercise production-rendered fragments or the existing deterministic fixture responses where state changes after load. Check that phone CSS and delegated handlers apply on first and subsequent insertions.

| Insertion or update | Verify |
| --- | --- |
| `iv:content-added` and browse appends | Grid/row geometry, menus, masking, reveal, and progress on appended cards. Test duplicate items and failed loads. |
| Comments and community replies | Independent continuation, expanded and collapsed replies, failed read with explicit retry, and local focus and wrapping. |
| Watch playlist and mix responses | Browser queue HTML, current and removed occurrence, recommendation rows and reveal actions, retry, and next-item continuity. Retain existing browser fragment parameters. |
| `/video_actions`, Save choices, and collections | Correct role and current channel actions, playlist choices and new playlist flow, selection and confirmation, and success, partial, and uncertain feedback. |
| Settings category replacement and dedicated editors | Correct active option, visible field/heading, retained drafts, stale/profile guard, and reflow of newly loaded form content. |
| Runtime-generated UI | Video.js settings, chapter and chat placement, captions, transcript, chat messages, stats, toasts and notices, and embed health and next-item recovery. Verify one owner and normal cleanup after resize, navigation, and cached return. |

## Test execution and evidence

1. Follow the existing fixture and synthetic media setup in the frontend README and CI. Re-render full-web and API-only fixture output from the implementation checkout before testing. Add phone cases to the owning suites. If a shared phone geometry suite is needed, register it in the explicit npm test command. Keep existing entry points and both default browser engines.
2. Run a focused case during development, then `npm test --prefix tests/frontend` with both default engines for the integrated check. Run `python3 docs/tools/check_docs.py` and `git diff --check`. Record the handbook reference drift if it is still present. Fixture-based results do not substitute for existing server-side assertions about access and mutations.
3. Capture representative portrait and short-landscape screenshots under the existing `tests/frontend/artifacts/` collection. Include the shell/drawer, search filters, channel tabs, a dense playlist with open row menu, a Watch tool, a player/settings overlay, the Save dialog, the Settings matrix, an account or verification form, and the narrow embed. Review at least one RTL or enlarged-text case and a desktop comparison. Use synthetic titles, media, users, and credentials.
4. Include the fixture name, viewport, role, state, and owning test for each reviewed visual. Record failures or unsupported browser capabilities with reproduction details and the corresponding verified fallback. If the local sandbox prevents a browser launch, use the CI result for that engine.

## Completion checklist

See the [implementation handoff](implementation-handoff.md) for local evidence and pending hosted CI.

- [x] All route families and conditional HTML in the [route index](README.md#route-and-surface-index) have a fixture, a shared-template mapping, or an explicit existing redirect/fallback destination.
- [x] Every work item lists the covered routes and states, relevant changes and any deviations, exact test commands and results, screenshot locations, and open gaps.
- [x] Phone state stays local to presentation. Desktop preferences, forms, authorization, playback, and collection semantics pass their existing regression checks.
- [x] Both browser engines pass the phone matrix and the existing desktop tests locally, and representative screenshots have been inspected.
- [x] Dependencies are integrated and required journeys pass local verification. Release and deployment handoff remain separate.
- [ ] The hosted frontend workflow records passing Chromium and Firefox results for the implementation.
