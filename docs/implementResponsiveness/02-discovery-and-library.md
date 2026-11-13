# Discovery and library

Implement the phone behavior in shared cards, rows, filters, and collection controls. Preserve the current wider grid and rows, server-rendered navigation, and existing read/write contracts. [Foundation](01-foundation-and-shell.md) · [Discovery behavior](../search-and-feeds.md) · [Library behavior](../accounts-and-library.md)

## Discovery

| Surface | Phone layout and interaction | Acceptance |
| --- | --- | --- |
| `/`, search home at `/search`, configured home redirects | Keep the existing logo, heading, and main search form. Use full available width with a flexible input and reachable submit. Reduce hero spacing in short landscape. The shared header leaves out its duplicate search row on this surface. | Default home resolves to the existing guest or signed-in destination. The main form works by touch, Enter, and ordinary submission. Smart pasted URLs and the literal backslash escape keep their behavior. |
| `/search` GET/POST and `/results` | Preserve the filter disclosure and active chips. Reflow the existing filter groups into one column in portrait and two when landscape width permits. Keep Apply and Clear visible in form order. Wrap chips and stack the visibility controls as needed. | Type, date, duration, features, sort, member visibility, and scoped search remain available. Applying controls preserves the current method and parameters. Verify active and cleared filters, no results, and filtered empty results with a continuation. |
| `/feed/popular`, `/feed/trending`, and `/hashtag/:hashtag` | Use the shared grid. Wrap category and region controls above results. Let headings, status messages, and load controls fit independently of the cards. | Verify populated, empty, disabled, failed, and continued pages where the route supports them. Category and region selection stay explicit. |
| `/feed/subscriptions` | Reflow shortcuts, then scoped search, More, filters, refresh, and the results/selection area in source order. Keep All subscriptions visible even when no shortcut fits. Let the existing container-based count select fitting shortcuts. Wrap sorting, latest, unseen, and notifications-only controls around an explicit Apply. | Signed-in users can open Manager, search subscribed videos, change feed options, use the private RSS link, and refresh new uploads. Notification permission and feedback stay reachable when enabled. Verify empty and filtered batches and the disabled notifications variant. |

### Cards, rows, and pagination

- Use one card per row for portrait grids. In phone landscape use two when both can meet the existing 240 px card minimum with the existing gap. Keep full-width status and section rows. Include video, channel, playlist, mix, hashtag, clip, unavailable, and category output where the shared renderer supports them.
- Keep a compact thumbnail with adjacent text in search, channel search, history, playlist, mix, and add-items rows. Use a shrinking thumbnail track and reserve a distinct touch target for row actions. Below 360 CSS px stack the thumbnail above the text in numbered or action-dense rows. Keep occurrence number and selection controls associated with the same row, separate from the media link. Preserve creator links, badges, duration, watch progress, empty metadata fallbacks, and understandable title/thumbnail reveal buttons.
- Keep card and row actions visible without hover. Preserve member gating, manual block/unblock, AI-filter placeholders and status, spoiler masking and reveal, and original/DeArrow title swapping. Check dynamic rows as well as initial renders. A reveal, menu action, or checkbox tap must avoid activating the surrounding video link.
- Keep explicit Load more, Previous/Next, and ordinary page navigation. Preserve GET Back and reload restoration and the privacy behavior of POST queries. Keep controls reachable after filtered batches, failed appends, or the end of a list. Continued rows reuse the same layout and single delegated action owner.

**Accept when** mixed results, search filters and feed controls fit with long translated strings, and a browser can load or navigate to another page from an empty/filtered batch where continuation exists. Verify initial and appended cards, no-JavaScript navigation, GET restoration, private POST behavior, and refresh/notification status.

[Discovery templates](../../src/invidious/views/search.ecr) · [Shared item](../../src/invidious/views/overhaul/item.ecr) · [Pagination controls](../../src/invidious/views/components/browse_controls.ecr) · [Browse controller](../../assets/js/browse.js)

## Channels and posts

1. Cover the channel home and Videos, Shorts, Streams, Podcasts, Releases, Courses, Shows, Playlists, Clips, Posts/Community, Channels, and Search. Cover About in the shared channel header. The `/about` route currently redirects to the channel root. Keep core and overflow groups from the existing helper, including availability rules and the selected tab. Keep handle, legacy custom/user, attribution, profile, live, and wildcard paths resolving through their existing destinations.
2. Fit the banner, then avatar and identity. Give subscription, RSS, and contextual actions a wrapping group below the identity when needed. Keep scoped search and sort below the tab strip. Give each field and Apply/Clear control its own reachable space. Preserve current filter actions and authorized channel operations.
3. Put core tabs inside a local horizontal scroller. Keep More outside that scroller and visible at logical end. Bring the selected or focused core tab into view without moving the document vertically. Let a long active overflow label wrap within More's allotted space. Keep the menu and About link usable with and without enhancement.
4. Keep community and individual posts in a single readable flow. Constrain image, carousel, and video embeds to the content width. Keep horizontal motion local to the carousel. Reduce reply indentation at phone width and let author, timestamps, reply actions, links, and long content wrap. Preserve independent reply continuation, explicit retry, and ordinary comment links.

**Accept when** the longest core tab set can be reached by swipe and keyboard, More remains in view, and all routes can reuse the same shell in RTL. Test both core and overflow selection, search with private POST, missing avatar, no available media, About, a multipicture post, nested replies, and load failure with retry.

[Channel header](../../src/invidious/views/components/channel_info.ecr) · [Tab helper](../../src/invidious/frontend/channel_page.cr) · [Post template](../../src/invidious/views/post.ecr) · [Comment owner](../../assets/js/comment-threads.js)

## Library and collections

| Surface | Phone layout and interaction | Acceptance |
| --- | --- | --- |
| `/subscription_manager` | Keep channel identity first, statistics below or alongside when they fit, then row actions. Wrap manager header actions and keep sort and export controls usable. Reflow the shared selection controls. | Populated, empty, and unavailable statistics states. A long channel name fits. Unsubscribe and select-all operate on the existing loaded scope. |
| `/feed/history`, `/clear_watch_history` | Keep search, status, and clear action above date groups. Use compact rows with the shared narrow fallback. Keep the existing separate clear confirmation with distinct destructive and cancel actions. | History search, date grouping, unknown metadata, saved progress, paused history, continuation, and clear/cancel/error states. |
| `/feed/playlists`, `/view_all_playlists` | Preserve distinct owned and saved sections, existing covers/fallbacks, counts and visibility, create and open links, and saved-reference menus. Use the shared grid. Fit empty and inaccessible states. | Owned, saved YouTube/local reference, saved mix, empty, and save/unsave states. Saved references retain their existing semantics. |
| `/playlist`, `/show/:id`, `/mix` | Keep title, metadata and description, playback/shuffle controls when supplied, and save, feed, and owner tools ahead of ordered rows. Reflow the description, action group, and paging. | Verify owner, signed-in nonowner, guest, public, unlisted, private owner, inaccessible private, empty, mix, and Shows variants. |
| `/feed/clips`, `/channel/:ucid/clips` | Use the shared card and pagination rules. Keep time range, owner actions, creator links, and empty state within their cards. Use the channel header on channel clip pages. | Browse owned and public clips, open the permalink, reach delete only for owners, and retain empty and paginated behavior. Clip player and editor work is in [Clips and embeds](03-watch-player-and-embed.md#clips-and-embeds). |

Keep selection count, Select all, Clear, operation, target playlist, and Apply in source order. Stack labeled selects and wrap button groups. Keep status feedback next to the workflow and confirmations in the shared dialog. Preserve selection across layout changes, select loaded entries only, leave new entries unselected, and preserve counts and retry behavior after partial results. Preserve existing one-attempt handling for ambiguous writes and the reload/check action that reconciles the result.

[Library controller](../../assets/js/library.js) · [Collection toolbar](../../src/invidious/views/overhaul/collection_toolbar.ecr) · [History](../../src/invidious/views/feeds/history.ecr) · [Subscription Manager](../../src/invidious/views/user/subscription_manager.ecr)

## Playlist management

- Reflow `/create_playlist`, `/edit_playlist`, and `/delete_playlist` as stacked forms with full-width editable fields and wrapping action groups. Keep visibility choices, validation errors, recoverable values, cancel routes, and existing pending and uncertain states. Use the same ordinary forms for no-JavaScript.
- Keep `/add_playlist_items` scoped search, result row actions, selection, paging, and POST privacy behavior. Preserve the owned target and one-attempt add semantics. Keep `/feed/playlists?video_id=` as the ordinary Save fallback with the appropriate video and destination choices. Test success, no owned playlists, no matching items, failed/uncertain result, and form recovery.
- Open the existing Save to playlist dialog from Watch and other eligible item actions. Use the native selector on phones, with a visible label, Save action and feedback. Fit inline playlist creation and let its form scroll with the keyboard open. Keep desktop's existing list of choices and creation flow. Preserve sign-in and ordinary fallbacks, selected playlist, and status when resizing an open dialog. One explicit submission issues at most one write.

### Move up and Move down

1. Expose the localized Move up and Move down actions in an owned playlist occurrence's existing row menu in phone mode when enhancement is ready. Hide the drag grip in that mode. Keep the existing grip for pointer and keyboard on wider layouts. Keep reorder help appropriate to the visible control.
2. Compute the adjacent candidate from the current loaded rows in DOM order using their exact string occurrence IDs. Use `before` against the previous occurrence or `after` against the next. Disable the direction without an adjacent loaded occurrence. Never fetch another playlist page to find an anchor. Use the current owner, selection, stale, and busy gates for both the grip and menu.
3. Call the same commit path as the grip using the existing `/playlist_ajax?action=move_video_before` operation with the existing CSRF and canonical positions request. Share pending state with the collection owner. Reconcile using the returned positions and total, then announce the confirmed position. Close the menu on activation and return focus to that row's menu trigger when it remains visible. After a resize, use the moved row's available reorder control. If the write fails or becomes uncertain, use the existing reload recovery and keep stale actions disabled.
4. Cancel a transient drag when crossing into phone mode. Let an already submitted write reconcile once. Keep exact identities through duplicate videos, positions above the JavaScript integer precision boundary, paging offsets, selection, page restore, and profile invalidation.

**Accept when** a user can move a middle occurrence both ways with taps, reach disabled boundaries, and reorder independently of identical video IDs. Verify an existing wider keyboard and pointer reorder, one write per action, authoritative position updates, stale/unknown recovery, and rotation during both a local gesture and a submitted write.

[Playlist template](../../src/invidious/views/playlist.ecr) · [Row menu](../../src/invidious/views/overhaul/item_menu.ecr) · [Reorder owner](../../assets/js/overhaul.js) · [Playlist form owner](../../assets/js/playlist-forms.js) · [Video actions](../../assets/js/video-actions.js)
