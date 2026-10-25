# Feature, screen and source coverage

[Master plan](README.md) · [Tasks](tasks.md) · [Verification](verification.md) · [Progress](progress.md)

Baseline: commit 22fc2a66, 26 October 2026. All entries start **not implemented**. Inventory membership is source accounting, not proof of current behavior, visual quality or overhaul completion. Access restrictions remain enforced server-side. Optional instance gates apply to public surfaces too.

## Screen families

Each family includes loading, empty, unavailable, validation/authorization and network/write-failure states where meaningful. Shared components inherit access/state contracts from their owning screen, never grant authorization and must work in dynamically appended content. Native wire contracts are documented in the existing handbook; public API JSON remains unpersonalized where currently defined.

| ID | Surface | Entry points | Access/availability | Owner task | Acceptance IDs | Current guide | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Shell/navigation | / and every main-template page | Guest/account; admin menu gated | D1/D2 | V01,V30,V35 | [frontend.md](../frontend.md); [preferences.md](../preferences.md) | Not implemented |
| S02 | Discovery/search/hashtags | /feed/popular, /feed/trending, /search, /results, /hashtag/:tag | Guest/account, instance gates | D3 | V02–V06 | [search-and-feeds.md](../search-and-feeds.md) | Not implemented |
| S03 | Channels/community/posts | /channel/:id and all content tabs, /post/:id | Guest/account; contextual write actions gated | D3 | V07,V20,V25,V27 | [search-and-feeds.md](../search-and-feeds.md) | Not implemented |
| S04 | Subscriptions/notification manager | /feed/subscriptions, /subscription_manager | Account; notification config respected | D4 | V08,V09,V13 | [accounts-and-library.md](../accounts-and-library.md); [search-and-feeds.md](../search-and-feeds.md) | Not implemented |
| S05 | History | /feed/history, /clear_watch_history | Account; history/sync opt-ins independent | D4/D7 | V10,V13,V30 | [accounts-and-library.md](../accounts-and-library.md); [playback.md](../playback.md) | Not implemented |
| S06 | Playlists/mixes | /feed/playlists, /playlist, /mix, create/edit/add/delete forms | Public/unlisted guest access; private/edits owner only | D4 | V11–V13,V18 | [accounts-and-library.md](../accounts-and-library.md) | Not implemented |
| S07 | Watch/media/utility panel | /watch and normalized watch/live/short URLs | Guest/account; server media restrictions retained | D5 | V14–V19,V24–V27,V36 | [playback.md](../playback.md) | Not implemented |
| S08 | Replay chat | Watch replay availability and chat preference/offset endpoints | Read-only replay; account persistence or isolated guest state | D6 | V21,V30 | [playback.md](../playback.md); [preferences.md](../preferences.md); [mobile-api.md](../mobile-api.md) | Not implemented |
| S09 | Clips | /clip/:id, /feed/clips, channel clips, /create_clip, /delete_clip | Public playback; creation account; deletion owner | D6 | V22,V23 | [native-clips.md](../native-clips.md) | Not implemented |
| S10 | Settings and enhancement editors | /preferences and dedicated channel/block/identity routes | Guest/account; private identity separate | D2/D6 | V24–V30 | [preferences.md](../preferences.md); [sponsorblock.md](../sponsorblock.md); [ai-channel-filter.md](../ai-channel-filter.md); [channel-spoilers.md](../channel-spoilers.md); [dearrow-contributions.md](../dearrow-contributions.md) | Not implemented |
| S11 | Account/auth/session authorization | /login, /signup, /account, /change_password, /delete_account, /token_manager, /authorize_token | Guest auth pages; account-owned sessions/actions | D7 | V30,V31 | [accounts-and-library.md](../accounts-and-library.md); [security.md](../security.md) | Not implemented |
| S12 | Import/export | /data_control and supported export links | Account + existing format/scope/CSRF restrictions | D7 | V32 | [data-import-export.md](../data-import-export.md) | Not implemented |
| S13 | TV approval | /tv | Account explicit code approval; native protocol unchanged | D7 | V33 | [tv-pairing.md](../tv-pairing.md); [mobile-api.md](../mobile-api.md) | Not implemented |
| S14 | Administration and verification | /admin/bot-protection, /verify and new separated admin settings | Admin config; public verification; recovery/API-only exceptions | D2/D7 | V33 | [bot-protection.md](../bot-protection.md); [configuration.md](../configuration.md); [security.md](../security.md) | Not implemented |
| S15 | Embed | /embed/:id and compatible redirects | Guest/account media; private playlist owner checks | D5/D7 | V11,V16,V17,V25,V34 | [playback.md](../playback.md); [api.md](../api.md) | Not implemented |
| S16 | Legal/messages/errors | /privacy, /licenses, errors/messages/unavailable states | Appropriate guest/recovery availability | D7 | V34,V35 | [frontend.md](../frontend.md); [security.md](../security.md) | Not implemented |

## State and persistence ownership

| Data/state | Authority | Required invariants |
| --- | --- | --- |
| Account preferences | PostgreSQL account JSON; dedicated safe write contracts | Category merge preserves unrelated/native/unknown values; browser stale-profile guards |
| Guest preferences | Existing guest cookie plus existing feature-specific profile storage | No implicit account import; durable vs page-only save distinguished |
| Sidebar/layout/docking | Validated InvidiousStorage profile keys | Persist across relevant pages/sessions; no raw global keys |
| Browse restoration | Bounded tab-local GET descriptors | Opaque tokens; no private POST query/HTML/media persistence |
| Library/playlist order | Server ownership and stable occurrence rows | Duplicate video IDs remain distinct; transaction/stale handling |
| Playback/progress/history | Existing account sync and profile fallback paths | No acknowledgment of failed writes; no clip-preview pollution |
| Chat prefs/offsets | Existing chat API and per-video offset store; profile-local guest data | Keep API limits; browser overlay removal preserves native fields |
| DeArrow identity | Dedicated encrypted account storage/form | Never ordinary prefs/config/export/browser storage |
| Notifications | Existing server state/SSE plus profile lease | One owner, stale-tab stop, no dependency on removed header node |
| Shared metadata/avatars/AI lists | Existing caches/extractors | No per-card presentation fetches, no guessed identities, unpersonalized public JSON |
| Admin settings | Admin-only declared config keys and policy store | Personal save cannot rewrite config; recovery routes remain reachable |

## Complete template inventory

The initial source inventory contains 64 ECR files, including partials and standalone shells. Every file is listed explicitly so less-used screens cannot vanish from the overhaul. Add a row when adding/replacing a template; record removals with their replacement in the progress log.

| Template/partial | Screen contract | Owner task | Status |
| --- | --- | --- | --- |
| [add_playlist_items.ecr](../../src/invidious/views/add_playlist_items.ecr) | S06 | D4 | Not implemented |
| [admin/bot_protection.ecr](../../src/invidious/views/admin/bot_protection.ecr) | S14 | D2/D7 | Not implemented |
| [channel.ecr](../../src/invidious/views/channel.ecr) | S03 | D3 | Not implemented |
| [channel_clips.ecr](../../src/invidious/views/channel_clips.ecr) | S09 | D6 | Not implemented |
| [channel_search.ecr](../../src/invidious/views/channel_search.ecr) | S03 | D3 | Not implemented |
| [clip_unavailable.ecr](../../src/invidious/views/clip_unavailable.ecr) | S09 | D6 | Not implemented |
| [community.ecr](../../src/invidious/views/community.ecr) | S03 | D3 | Not implemented |
| [components/ai-filter-empty.ecr](../../src/invidious/views/components/ai-filter-empty.ecr) | S10 | D2/D6 | Not implemented |
| [components/ai-filter-preferences.ecr](../../src/invidious/views/components/ai-filter-preferences.ecr) | S10 | D2/D6 | Not implemented |
| [components/channel_info.ecr](../../src/invidious/views/components/channel_info.ecr) | S03 | D3 | Not implemented |
| [components/channel_spoiler_scripts.ecr](../../src/invidious/views/components/channel_spoiler_scripts.ecr) | S10 | D2/D6 | Not implemented |
| [components/clip_dialog.ecr](../../src/invidious/views/components/clip_dialog.ecr) | S09 | D6 | Not implemented |
| [components/clip_editor.ecr](../../src/invidious/views/components/clip_editor.ecr) | S09 | D6 | Not implemented |
| [components/clips.ecr](../../src/invidious/views/components/clips.ecr) | S09 | D6 | Not implemented |
| [components/dearrow_contributions.ecr](../../src/invidious/views/components/dearrow_contributions.ecr) | S10 | D2/D6 | Not implemented |
| [components/feed_menu.ecr](../../src/invidious/views/components/feed_menu.ecr) | S01 | D1/D2 | Not implemented |
| [components/item.ecr](../../src/invidious/views/components/item.ecr) | S02 | D3 | Not implemented |
| [components/items_paginated.ecr](../../src/invidious/views/components/items_paginated.ecr) | S02 | D3 | Not implemented |
| [components/navigation.ecr](../../src/invidious/views/components/navigation.ecr) | S01 | D1/D2 | Not implemented |
| [components/player.ecr](../../src/invidious/views/components/player.ecr) | S07 | D5 | Not implemented |
| [components/player_sources.ecr](../../src/invidious/views/components/player_sources.ecr) | S07 | D5 | Not implemented |
| [components/search_box.ecr](../../src/invidious/views/components/search_box.ecr) | S01 | D1/D2 | Not implemented |
| [components/subscribe_widget.ecr](../../src/invidious/views/components/subscribe_widget.ecr) | S04 | D4 | Not implemented |
| [components/video-actions-dialog.ecr](../../src/invidious/views/components/video-actions-dialog.ecr) | S07 | D5 | Not implemented |
| [components/video-context-buttons.ecr](../../src/invidious/views/components/video-context-buttons.ecr) | S07 | D5 | Not implemented |
| [create_clip.ecr](../../src/invidious/views/create_clip.ecr) | S09 | D6 | Not implemented |
| [create_playlist.ecr](../../src/invidious/views/create_playlist.ecr) | S06 | D4 | Not implemented |
| [delete_clip.ecr](../../src/invidious/views/delete_clip.ecr) | S09 | D6 | Not implemented |
| [delete_playlist.ecr](../../src/invidious/views/delete_playlist.ecr) | S06 | D4 | Not implemented |
| [edit_playlist.ecr](../../src/invidious/views/edit_playlist.ecr) | S06 | D4 | Not implemented |
| [embed.ecr](../../src/invidious/views/embed.ecr) | S15 | D5/D7 | Not implemented |
| [error.ecr](../../src/invidious/views/error.ecr) | S16 | D7 | Not implemented |
| [feeds/clips.ecr](../../src/invidious/views/feeds/clips.ecr) | S09 | D6 | Not implemented |
| [feeds/history.ecr](../../src/invidious/views/feeds/history.ecr) | S05 | D4/D7 | Not implemented |
| [feeds/playlists.ecr](../../src/invidious/views/feeds/playlists.ecr) | S06 | D4 | Not implemented |
| [feeds/popular.ecr](../../src/invidious/views/feeds/popular.ecr) | S02 | D3 | Not implemented |
| [feeds/subscriptions.ecr](../../src/invidious/views/feeds/subscriptions.ecr) | S04 | D4 | Not implemented |
| [feeds/trending.ecr](../../src/invidious/views/feeds/trending.ecr) | S02 | D3 | Not implemented |
| [hashtag.ecr](../../src/invidious/views/hashtag.ecr) | S02 | D3 | Not implemented |
| [licenses.ecr](../../src/invidious/views/licenses.ecr) | S16 | D7 | Not implemented |
| [message.ecr](../../src/invidious/views/message.ecr) | S16 | D7 | Not implemented |
| [mix.ecr](../../src/invidious/views/mix.ecr) | S06 | D4 | Not implemented |
| [playlist.ecr](../../src/invidious/views/playlist.ecr) | S06 | D4 | Not implemented |
| [post.ecr](../../src/invidious/views/post.ecr) | S03 | D3 | Not implemented |
| [privacy.ecr](../../src/invidious/views/privacy.ecr) | S16 | D7 | Not implemented |
| [search.ecr](../../src/invidious/views/search.ecr) | S02 | D3 | Not implemented |
| [search_homepage.ecr](../../src/invidious/views/search_homepage.ecr) | S02 | D3 | Not implemented |
| [template.ecr](../../src/invidious/views/template.ecr) | S01 | D1/D2 | Not implemented |
| [user/account.ecr](../../src/invidious/views/user/account.ecr) | S11 | D7 | Not implemented |
| [user/authorize_token.ecr](../../src/invidious/views/user/authorize_token.ecr) | S11 | D7 | Not implemented |
| [user/blocked_channels.ecr](../../src/invidious/views/user/blocked_channels.ecr) | S10 | D2/D6 | Not implemented |
| [user/change_password.ecr](../../src/invidious/views/user/change_password.ecr) | S11 | D7 | Not implemented |
| [user/channel_spoilers.ecr](../../src/invidious/views/user/channel_spoilers.ecr) | S10 | D2/D6 | Not implemented |
| [user/clear_watch_history.ecr](../../src/invidious/views/user/clear_watch_history.ecr) | S05 | D4/D7 | Not implemented |
| [user/data_control.ecr](../../src/invidious/views/user/data_control.ecr) | S12 | D7 | Not implemented |
| [user/delete_account.ecr](../../src/invidious/views/user/delete_account.ecr) | S11 | D7 | Not implemented |
| [user/login.ecr](../../src/invidious/views/user/login.ecr) | S11 | D7 | Not implemented |
| [user/preferences.ecr](../../src/invidious/views/user/preferences.ecr) | S10 | D2/D6 | Not implemented |
| [user/sponsorblock_channels.ecr](../../src/invidious/views/user/sponsorblock_channels.ecr) | S10 | D2/D6 | Not implemented |
| [user/subscription_manager.ecr](../../src/invidious/views/user/subscription_manager.ecr) | S04 | D4 | Not implemented |
| [user/token_manager.ecr](../../src/invidious/views/user/token_manager.ecr) | S11 | D7 | Not implemented |
| [user/tv_pairing.ecr](../../src/invidious/views/user/tv_pairing.ecr) | S13 | D7 | Not implemented |
| [verification.ecr](../../src/invidious/views/verification.ecr) | S14 | D2/D7 | Not implemented |
| [watch.ecr](../../src/invidious/views/watch.ecr) | S07 | D5 | Not implemented |

## Dynamic HTML and browser modules

| Surface/source | Owner | Behavior and verification scope | Status |
| --- | --- | --- | --- |
| Crystal frontend comments_youtube/comments_reddit; comments.js/community.js/post.js | D3/D6 | Server/API-generated threads/replies/source switching; V07,V20 | Not implemented |
| Crystal frontend pagination/search_filters/channel_page | D3 | Actual navigation/filter/tab fragments, normal GET/POST and opaque continuation; V03–V07 | Not implemented |
| Crystal frontend watch_page; watch.js | D5 | Queue/recommendation/current/next rows and occurrence controls; V18 | Not implemented |
| Crystal frontend ai_channels/ai_thumbnail/channel_spoilers | D3/D6 | Warning/masking fragments and no-leak metadata across surfaces; V25,V27 | Not implemented |
| Crystal frontend channel_avatars/view_counts/watched_indicator/member_videos/blocked_channels | D3/D4 | Cache-derived metadata, zero/unknown values and personalization; V02,V10,V18,V27 | Not implemented |
| browser-storage.js/_helpers.js/ui.js | D2 | Requests, profile guards, scoped persistence, retries and feedback; V29,V30,V36 | Not implemented |
| interface.js/handlers.js/themes.js/timezone.js | D1/D2 | Single navigation, shortcuts, forms, mode/timezone; V01,V28–V30 | Not implemented |
| browse.js/pagination.js | D3 | Append/restore/continuation lifecycle; explicit filter navigation; V03–V06 | Not implemented |
| library.js/playlist_widget.js/watched_widget.js/watched_indicator.js/video-actions.js | D4 | Selection, occurrence order, inline actions, consistent menus/progress; V10–V13 | Not implemented |
| subscribe_widget.js/notifications.js/sse.js | D4 | Subscription controls/stream lease and new-upload refresh without header bell; V08,V09 | Not implemented |
| player.js/player-ui.js/player-stream-menu.js/player-chapters.js/player-stats.js/player-dock.js | D5 | Unified player hierarchy, preserved stream identity/lifecycle and opt-in docking; V14–V18,V24,V36 | Not implemented |
| player-mobile.js | D5/D8 | No new mobile UI work; retain required shared calls/contracts and avoid accidental watch/embed failures | Not implemented |
| transcript.js | D6 | Transcript query/seek/follow and manual browsing; V19 | Not implemented |
| live-chat.js | D6 | Panel-only replay, validation/offsets; remove web overlay but preserve API data; V21 | Not implemented |
| clip-loader.js/clip-editor.js/clip-player.js | D6 | Same-player editor, range/bounds/drafts and immutable watch; V22,V23 | Not implemented |
| dearrow.js/dearrow-loader.js/dearrow-contributions.js | D6 | Icon cycling/no leakage/explicit safe writes; V25,V26 | Not implemented |
| sponsorblock.js/sponsorblock-preferences.js | D6 | Segment/override modes and Settings forms; V24 | Not implemented |
| channel-spoilers.js/channel-spoiler-preferences.js | D6 | Mask/reveal states, rules and limited observers; V25,V27,V36 | Not implemented |
| preferences.js | D2 | Category-local drafts, canonical saves/search/preview; V28,V29 | Not implemented |
| bot-protection.js/verification.js | D7 | Protected media verification/retry/recovery and API-only shell; V33 | Not implemented |
| HTTP server required-login/bot-protection handlers and error helpers | D7 | Inline challenge/embed HTML and auth/media error responses outside templates; V33,V34 | Not implemented |
| embed.js | D5/D7 | Embed-only player, URL/private resource and masking behavior; V11,V16,V17,V25,V34 | Not implemented |
| Vendored Video.js plugins and minified selector/annotation files | D5/D8 | Preserve required media support/licenses; remove dependency only with coverage proof | Not implemented |

## Stylesheet and asset accounting

D1/D8 account for all first-party stylesheet families: default, ui, search, player, embed, video-actions, carousel, clips, live-chat, dearrow, dearrow-contributions, channel-spoilers, verification, quality-selector and empty. Pure/grid and Ionicons foundations must be removed after their markup users migrate. Annotation/player vendor styles remain only where required. Diary stylesheet/fonts/doodles are removed after the replacement covers all entry points. Branding/favicon/manifest assets remain appropriate to the product and are not silently deleted.

## Completion evidence

Update each relevant row with task status and direct evidence links/commands as work lands. Screen families must account for all listed templates and dynamic modules before being marked complete. Final verification is the V01–V36 matrix, full visual review and the second handbook pass; this table's existence does not establish completion.
