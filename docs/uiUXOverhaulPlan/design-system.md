# Design and interaction contract

[Master plan](README.md) · [Coverage](coverage.md) · [Tasks](tasks.md) · [Verification](verification.md)

This is the target desktop contract. Until a task is verified, it does not describe shipped behavior. Dimensions below are implementation defaults; adjust only when representative-screen evidence warrants it, and record the adjustment in [progress](progress.md).

## Foundation tokens

| Token role | Light | Dark |
| --- | --- | --- |
| Page background | #ffffff | #101114 |
| Subtle surface | #f6f7f9 | #181a20 |
| Raised surface | #ffffff | #22252d |
| Primary text | #17191f | #f1f3f7 |
| Secondary text | #59616e | #abb3c1 |
| Decorative separator | #e1e5eb | #343943 |
| Control border | #768191 | #788394 |
| Accent | #245bd6 | #86afff |
| Accent foreground | #ffffff | #101827 |
| Selection | #eaf0fd | #24334f |
| Focus | #245bd6 | #9cbfff |
| Destructive text | #b42332 | #ff9ca7 |
| Success text | #17633d | #8ed5ad |

Use semantic custom properties, not these literals in feature styles. Separators may be quiet; control affordances and meaningful boundaries must meet contrast requirements. A selected item combines color with an indicator/weight/state attribute. Do not color every card or make metadata the accent color.

Use the system font stack already available in the application, with one sans-serif family for UI/reading. Body 16px/1.5; metadata 14px/1.4; section heading 20px/1.3; page/watch heading 24px/1.3. Use 400/500/600 weights. Keep title case natural rather than uppercase labels throughout. Media-specific caption fonts remain under caption appearance controls.

Spacing tokens: 4, 8, 12, 16, 24 and 32px. Main control radius 6px, thumbnail/panel radius 8px; avatars circular. Standard desktop control height 36px; icon control hit area at least 32px. Main form inputs 40px. No pill-button default. Use a short transition only for hover/focus/surface changes; no decorative motion.

### Icons

Use Lucide SVGs, pinned to one upstream release/revision and locally vendored with its license and source recorded. Serve a small sprite or inline trusted symbols through one renderer. Do not download or execute an icon runtime in the page. Use 20px icons on a 24px design grid, consistent stroke and currentColor.

Define an explicit icon map: menu, search, settings, user, log-out, sun/moon/monitor, home, trending-up, subscriptions, history, list-video, scissors, plus, check, x, ellipsis-vertical, bookmark, share, download, headphones, external-link, rss, grip-vertical, eye/eye-off, shield, captions, languages, gauge, chevron-right/down, play/pause, volume, picture-in-picture, fullscreen, layout and info. Use a simple rotate/cycle icon for title switching. If another icon is needed, choose from this same set and add it to the map.

Menus/settings use icon + text with a fixed icon column. Labels carry meaning; icons are decorative when text already labels the control. Pure icons require translated names and a tooltip. Never expose a hidden title in a tooltip or icon label.

## Layout geometry

Header is 60px, sticky at the viewport top. Search is centered in the available header area, maximum 640px. The single menu toggle sits before the brand. Account actions occupy the trailing slot. No header bell or separate sidebar collapse tools.

Browsing sidebar is 224px expanded / 64px collapsed, sticky beneath the header. Page padding/gutters are 24px. Content can use the available desktop width up to 1920px. Reading/forms use a maximum 800px primary measure. Cards use a minimum sensible width around 240px, growing with grid columns instead of fixed Pure fractions. Do not force four columns into every desktop window.

At 1280px standard watch, reserve roughly 360px for the utility panel, a 24px gap and the remainder for the player/details. Wider screens can give the player more space. Respect stored chat width within available space when Chat is active; constrain visually without destroying the saved value. Media keeps its actual aspect ratio with a sensible viewport-height limit. Theater spans content width with supporting columns below. Vertical sources must not be distorted.

Watch navigation is a collapsed rail by default. Its expanded drawer overlays rather than shrinking the media. Browsing expansion changes the grid normally. Reuse one nav DOM/component; do not render separate copies with independent controls. Close overlay navigation on outside click/Escape with focus restored to the toggle.

## Component contracts

| Component | Required anatomy/behavior |
| --- | --- |
| Primary button | Accent surface/foreground, icon optional, clear verb; reserved for principal action |
| Secondary button | Defined neutral surface/border, consistent height; not loose colored text |
| Icon button | Defined hit target, hover/focus surface, accessible name/tooltip |
| Menu | Raised contained surface, aligned icons/labels, separators by action group, keyboard focus |
| Tabs | One clear active state, semantic association to panel, keyboard support; no button-pile appearance |
| Toolbar | One baseline, deliberate groups, flexible space between primary and secondary actions |
| Card | Thumbnail then compact details, aligned overflow, no card-specific decorative color |
| Row | Leading optional grip/selection, thumbnail, flexible text, trailing actions; consistent alignment |
| Field | Label, input, help and error with explicit association; error does not replace user's input |
| Notice | Near the operation when local; shared toast only for page-wide feedback; no silent durability claims |
| Empty state | Plain explanation and one relevant recovery action; distinguish filtering from no content |
| Error state | Preserved content/draft, clear retry where safe, no automatic ambiguous write retries |
| Dialog | Title, close, scrollable body, clear actions; Escape/focus management |
| Confirmation | Action, object/count and consequences; destructive action visibly distinct |

Content links remain links within cards/rows/descriptions. Floating action labels such as channel-settings links are replaced by icon-labeled menu items or proper controls. Avoid nested interactive cards: thumbnail/title are navigation targets, trailing menu is separate, and text can be selected normally.

### Lists and selection

Discovery grids show the title over at most two lines, channel identity, views/live viewer count and age as concise metadata. Known zero remains zero. Unknown metadata is omitted or labeled truthfully. Preserve watched bars and duration/member/live indicators without overlap.

Search/history/playlist contents are horizontal rows. On owned playlists the 24px leading grip slot is subtle and aligned to the row center; row number remains legible. No standalone reorder strips and no Move up/down commands. Grip keyboard operation is Space/Enter to pick up/drop, arrows while grabbed to choose position, Escape to cancel. Navigation/player shortcuts must not intercept these focused-control events. Announce the moved item's permitted display title and position.

Select mode exposes row/card checkboxes and one batch toolbar. New results are unselected. Do not prepend a checkbox label strip to every card. Keep partial failures selected and preserve truthful counts. Selection and dragging must not accidentally start each other.

## Watch action and tool hierarchy

Title and cycle control form one heading group. Creator identity/subscription is one row group. Save, Share, Clip and More form the other aligned group; use neutral defined toolbar buttons and one deliberate subscription treatment rather than random ovals.

More groups: media actions (Download, Listen); channel controls (SponsorBlock for channel, title/thumbnail settings, block/unblock where available); destinations (YouTube, other instance, embed/RSS where supported). Only show relevant/authorized actions. Do not duplicate the same action as both a loose link and menu entry.

Utility tabs: Queue / Chat / Transcript / Up next, only if meaningful. Initial selection follows playlist → replay → recommendations. Tab state is local to the current watch page; switching videos reevaluates availability. Hide/disable states do not destroy loaded media. An active clip editor temporarily occupies the panel, retains drafts while within the page and returns to the prior tab on close.

Player bar retains common controls. Settings uses one hierarchical menu with icon-labeled categories and a clear Back row for nested choices. Selected choices show checks and current value. Quality/codec/audio labels reflect actual metadata and preserve track identity. Diagnostic and buffer tools are grouped as advanced actions, not new permanent player buttons.

## Settings category ownership

Each category is a manifest of owned form fields. The first implementation must enumerate every preference field against this table and record preserved-only fields; no category save may rebuild another category.

| Category ID | Owns browser-editable settings |
| --- | --- |
| appearance | dark_mode and retained account-name display choice |
| language | locale, region, timezone |
| browsing | default_home, feed_menu, show_member_videos, show_original_title, search_privacy, automatic_instance_redirect |
| playback | preload, autoplay, continue, continue_autoplay, video_loop, listen, local, quality, quality_dash, video_codec, preferred_audio, speed, seek_seconds, vr_mode, annotations, annotations_subscribed |
| captions-comments | captions, comments, related_videos, extend_desc |
| library | watch_history, save_player_pos, max_results, sort, latest_only, unseen_only, notifications_only, default_playlist |
| chat | Existing chat preference endpoint for timestamps/font/width/filters; hide-user-IDs remains browser-local; offsets remain per video |
| sponsorblock | sponsorblock_enabled, modes and colors; channel override editor retains its dedicated endpoint |
| dearrow | dearrow_enabled, dearrow_show_original; identity and contributions retain their dedicated forms/endpoints |
| ai-filter | ai_filter_enabled and eight canonical page/list action fields; legacy converter compatibility preserved |
| blocked-channels | Dedicated block management endpoint, not a general-preference replacement |
| channel-visibility | Dedicated title/thumbnail channel-rule endpoint |

Retained-only browser retirement fields include ui_density, thin_mode, player_style and chat_overlay fields. New desktop rendering uses the unified layout even if an old saved value requests a retired variant. Preserve values for native/legacy callers and portable round trips; do not silently delete/reset them.

The existing feed-menu field can remain a compact advanced ordered group; it must not cause duplicated top navigation. Home choice remains editable. Keep identity material entirely outside ordinary preference manifests.

Use a Settings subnavigation and category page, not the entire old long form hidden by CSS. Search finds field/category metadata and opens the owning category. Keep category drafts for the active page's Settings navigation; use page memory, not unscoped or durable secret-containing caches. Explicit Save/Discard applies only to the active draft. Preserve existing old-form callers and use compatibility mapping for recognized old anchors.

Administrator settings are outside this category map. The admin form owns only its declared instance keys and may not overwrite unrelated YAML configuration. It uses current authentication/CSRF and preserves recovery routes. Its ordinary personal preferences remain independent.

## Validation and accessibility

Use native semantics first. Preserve visible labels, focus, selected state and active panel associations. Respect existing logical RTL layout without a mobile redesign. Menus fit the viewport and scroll internally. Focus is restored to the trigger or the nearest surviving meaningful control. Do not focus every newly appended card automatically.

Use shared server validation for saved choices. Keep guest/account UI ranges consistent with backend constraints, including chat font/width. A failed save retains typed fields, marks the owning category dirty and reports the exact affected setting where possible. An expired session does not discard drafts or claim success.

## CSS and module ownership

Foundation styles own tokens/reset/type/forms/layout. Component styles own shell/cards/rows/menus/dialogs/settings. Player and feature sheets own only their specific surfaces and reference tokens. No feature sheet restyles unrelated body/headings/forms globally. Remove old dependencies only after references in templates, Crystal-rendered fragments, JS fragments and embed/recovery paths are accounted for.

Browser code must use explicit behavior hooks, initialize appended regions once and clean up listeners/observers on disposal. Keep media lifecycle in the existing player modules. Storage changes go through validated InvidiousStorage keys. No raw account-agnostic localStorage keys or copied media elements.
