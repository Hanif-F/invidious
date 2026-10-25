# Desktop UI/UX overhaul: master plan

[Documentation index](../README.md) · [Design contract](design-system.md) · [Feature coverage](coverage.md) · [Implementation tasks](tasks.md) · [Verification](verification.md) · [Decision and progress log](progress.md)

## Purpose and authority

**Current authorization: planning only.** This package specifies future work. Do not implement the interface, perform either documentation cleanup pass, or treat these task descriptions as permission to start. Implementation requires a new explicit instruction from the user.

Replace the browser interface with a simple, consistent, functional, beautiful desktop design. Familiar video-platform conventions are the starting point; visual restraint, coherent controls and predictable behavior matter more than decoration. This is a complete interface overhaul, not another stylesheet layered over Diary.

This specification records the planning conversation of 26 October 2026. The initial code baseline is commit **22fc2a66**. The user explicitly asked for the plan and supporting specifications to live in **docs/uiUXOverhaulPlan/**, for current-version documentation cleanup before interface development, and for a second documentation cleanup after the overhaul.

The master plan, linked contracts and coverage matrix together define completion. Progress must be evidence-based: existing tests or attractive screenshots do not by themselves prove a requirement is implemented. Future behavior in this package is a specification, not a claim about the currently shipped application.

## Fixed scope and decisions

| Area | Agreed direction |
| --- | --- |
| Audience | Personal desktop use, primarily browser widths from 1280 to 1920 pixels |
| Mobile website | Deferred; no mobile implementation or mobile-specific acceptance work in this overhaul |
| Native clients | Keep Android/native APIs, permissions, data and preference contracts compatible |
| Architecture | Crystal/ECR HTML pages with focused JavaScript; normal page navigation |
| Design | One neutral design, blue accent, system sans-serif typography, useful consistent icons |
| Color modes | Dark, Light and System; preserve existing saved choices |
| Home | Popular remains the new-profile default; keep Trending accessible and respect saved home destinations |
| Navigation | One collapsible labeled sidebar, controlled from the header beside the brand |
| Content layouts | Discovery/channel grids; horizontal rows for search, history and playlist contents |
| Pagination | Explicit Load more, stable fallback links and reliable Back/scroll restoration |
| Watch page | Large player/details on the left; one tabbed utility panel on the right |
| Theater mode | Persist standard/theater choice in the current browser profile across videos and sessions |
| Floating player | Optional automatic docking, disabled by default |
| Player controls | Common controls visible; advanced choices grouped under player Settings |
| Settings | Searchable categories with explicit Save/Discard per category |
| Enhancements | Dedicated Settings destinations plus contextual shortcuts |
| Notifications | Inside Subscriptions; remove the global header bell |
| Chat replay | Synchronized panel and advanced options; remove browser overlay mode |
| Clip creation | Side-panel editor using the existing player |
| Comments | Visible compact threads beneath the video, collapsed replies, explicit continuation |
| Titles | Keep click-to-cycle behavior, represented by a simple icon |
| Watch actions | Subscribe beside creator identity; Save, Share, Clip and More in an aligned toolbar |
| Playlist ordering | Subtle row grip; no Move up/down buttons or menu commands |
| Layout variants | Remove browser Compact and reduced-image modes; maintain one balanced layout |
| Channel tabs | Core tabs plus More |
| Documentation history | Archive useful dated records, remove obsolete/duplicate guidance, keep current instructions authoritative |
| Delivery | Dependency-ordered stages; one coherent switch after all surfaces are covered |
| Review | User reviews representative light/dark screens before the design is propagated |
| Deployment | Work on this repository only. The user deploys and activates the result on the remote server |

Major capabilities stay: SponsorBlock, DeArrow, AI filtering, manual blocks, masking rules, clips, library management, streams/audio, captions, transcripts, chat replay, history and playback synchronization. Minor duplicate controls may be consolidated. Do not add an SPA, recommendation engine, live-chat posting, password recovery, media extraction/muxing, clip editing/federation/import/export or native clip embeds.

## Stage 0: accurate current-version documentation

Finish this stage before changing the interface. Compare the handbook against actual routes, templates, presentation helpers, browser scripts, models and tests. Tests are evidence with limits, not unquestionable product requirements.

Audit the README and screenshots; browsing/playback/account/preferences guides; enhancements and data exchange; frontend architecture and storage; APIs/native contracts; configuration/migrations/operations/security; test instructions; root feature documents; historical reports; and all seven generated references.

Correct stale descriptions and destinations, consolidate duplicated guidance, fill behavioral gaps and archive useful dated reports. Preserve attribution, licensing and security procedures. Do not describe the new interface as shipped before it exists. Diary and current mobile behavior remain valid baseline documentation until their browser replacements are complete.

Known starting discrepancies include the accounts guide calling web playlist reordering unfinished, old Preferences → Content directions, stale migration counts, and a handbook review date preceding recent changes. The existing link/reference checker passing does not establish semantic accuracy.

The [coverage matrix](coverage.md) must identify every HTML route family, template/partial and dynamically generated surface, including server-built comment HTML and JS-created queue rows/controls. Each entry records access roles, states, storage ownership, API constraints, documentation, tests and its implementation task.

Stage 0 exits only when the current handbook is accurate, useful history is clearly separated, generated references and links pass, and every interface surface has an assigned task. Record limitations rather than implying live deployment verification.

## Shared design and interaction foundation

The [design contract](design-system.md) fixes tokens, geometry, component patterns, icon treatment and interaction behavior. Build this foundation once and apply it across all screens.

Remove Diary handwriting, textures, paper/tape/doodles, alternating card colors, decorative rules and gradients. Use the spacing scale 4/8/12/16/24/32px, restrained rounding, neutral light/dark surfaces and blue selection/emphasis. Reserve feature colors for actual meaning, such as SponsorBlock segments.

Use one locally vendored, pinned subset of Lucide SVGs with license/source attribution. No client icon framework, remote icon/font requests, emoji controls or mixed Unicode iconography. Icons accompany labels in menus/settings; familiar compact controls may be icon-only with accessible names, focus and tooltips. See [Lucide static assets](https://lucide.dev/guide/static).

### No floating action text

The user specifically identified standalone SponsorBlock and channel title/thumbnail settings links on the watch page as bad UI. Put actions into defined buttons, menus, tabs, toolbars or structured rows. Content links such as titles, channel names and links in descriptions remain normal links.

Primary/secondary/destructive/icon-button styles are shared. Do not distribute oval buttons arbitrarily. Avoid multiple controls for the same task in the same context. Clear, Reset, Retry and Discard appear only when relevant. Navigation is a link; mutation is a button/form.

### Shell and navigation

Use one header and one sidebar, with one toggle and one source of state. Header order: sidebar toggle, brand, persistent search, account menu. Remove the global bell. Put account/security destinations, appearance choice, keyboard help and sign-out in a structured menu; retain guest sign-in where enabled.

Sidebar destinations are Popular, Trending, Subscriptions, History, Playlists, Clips and Settings, respecting roles and server availability. Eliminate duplicate in-page feed navigation. Indicate the current destination. Persist browsing collapse state through InvidiousStorage. Watch pages start collapsed; expansion is a drawer and does not unexpectedly resize playback. Preserve labels via accessible names/tooltips in the rail.

Keep privacy, source, license, attribution, documentation and version information in a compact secondary area. Reading pages use a restrained readable measure.

### Interaction lifecycle

Shared primitives own menus, dialogs, tabs, toolbars, notices, loading states, validation and confirmations. Support Escape, appropriate outside-click dismissal, focus restoration and visible keyboard focus. Prevent duplicate submissions, preserve failed drafts/selections, and provide actionable failures.

Confirm destructive collections/accounts, bulk destructive changes and security-sensitive operations. Routine actions remain lightweight. Undo is offered only when the backend can restore the action correctly. Never automatically retry ambiguous creations, playlist additions, votes or contributions.

Target normal text contrast of at least 4.5:1 and meaningful controls/states of at least 3:1. Do not communicate status only by color. See [W3C text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Technical and persistence contracts

Keep Crystal/ECR, existing presentation helpers and Video.js. Do not introduce SPA navigation or cross-page persistent playback. Page destinations and search/filter submission use normal HTML navigation. JavaScript handles media, menus, inline actions, deliberate content loading, selection and reordering.

Render important controls with their owning template/component instead of appending unstructured strips after load. Separate CSS classes from behavior hooks. Make initialization idempotent and cleanup explicit. Escape upstream strings and allowlist JSON page configuration. Load feature modules where needed; optional enhancement failures must not block playback.

Replace the first-party CSS foundation and consolidate feature sheets. Remove Pure.css dependencies, first-party Ionicons usage, obsolete layout classes and Diary assets after their complete migration, including dynamic markup. Preserve required player vendor assets and licenses.

### Storage

Continue using InvidiousStorage for browser state, profile isolation, stale-tab protection, denied/quota fallbacks and deletion cleanup. Never copy guest state into accounts on sign-in. Add validated browser-profile state for standard/theater layout and docking opt-in. Keep existing sidebar state.

Preserve current playback persistence: quality/audio choices remain scoped as implemented, and speed/volume/caption/account-default behavior remains intact. State scope must be understandable in the UI.

### Settings interface changes

GET /preferences?section=<id> opens one category. POST /preferences with section saves only that category's allowlisted fields; keep the legacy full-form path for old callers. Preserve the existing JSON success response for redirect=false.

Merge account changes into the latest stored preferences transactionally. Preserve unrelated, unknown, native-only and compatibility fields. Validate the category before writing. Omitted checkboxes affect only booleans owned by the submitted category. Verify canonical saved category values without requiring unrelated categories to stay unchanged. Failure retains the draft and truthful persistence status.

Administrator settings get a separate admin-only page/handler; a personal save must never rewrite instance config. Keep dedicated endpoints for channel overrides, blocks, chat, identity and account/security operations, sharing components rather than folding them into unsafe full-object replacement.

Keep existing native schemas, scopes, CSRF, private/no-store responses, URL compatibility, playlist occurrence IDs and portable formats. No database migration is expected for the redesign. Retired browser fields remain readable/round-trippable where native clients, older callers or exports require them.

## Discovery, search and channel screens

Popular/Trending use a clean thumbnail grid with a page heading and existing data sources; retain region/category tools where available. Search home stays simple, not a new dashboard. Search results are horizontal rows with distinct video/channel/playlist forms. Hashtags reuse listing components.

Queries submit explicitly. Filters use a compact expandable panel with Apply, active chips and relevant Clear. Keep sort/date/duration/type/features, membership and blocked-channel overrides. Preserve pasted-link interpretation and its literal-search escape. Channel/subscription/history/playlist-item searches have explicit scope labels. Typing makes no suggestions/results requests. Private POST searches retain their privacy boundaries.

Channels use a restrained banner, avatar/identity, Subscribe and a channel-actions menu. Core tabs: Videos, Shorts, Live, Playlists, Clips and Posts when supported. Podcasts, releases, courses, related channels and About remain accessible under More. A selected overflow tab is clearly identified. Preserve all route aliases/continuations; do not invent unsupported tab capabilities.

Community/individual posts use readable content, consistent attachments and shared comments/replies. YouTube, alternate instance, RSS and other secondary destinations belong in menus/tool sections.

### Cards, rows and continuation

Discovery cards show stable thumbnails, duration/live states, two-line titles, channel identity, concise metadata and a consistent trailing overflow control. Preserve watched/progress/member states, masking, AI replacements, avatar fallback and zero-versus-unknown counts.

Rows align thumbnail, title/metadata and trailing actions. Add history/playlist information without inventing another visual language. Keep safe fallbacks for incomplete/deleted media.

Load more appends only on request, preserves results after failures, passes opaque tokens unchanged and never deduplicates valid playlist occurrences. Preserve ordinary GET Back/scroll restoration; keep POST search reconstruction inside existing privacy limits. A filtered-empty batch can still offer continuation. Merge adjacent history date groups and initialize appended controls once, without unexpected focus jumps. Retain links/forms for ordinary pagination/direct entry.

## Subscriptions, history and playlists

### Subscriptions and notifications

Use one subscription toolbar for searching, sorting/filtering, channel management and notification choices. Retain latest-only, unseen-only, notifications-only and supported sorting. Present new-upload information inside Subscriptions, not in a header bell. Incoming SSE updates offer an explicit refresh instead of reordering content while it is being read.

Preserve optional browser notifications and profile-scoped SSE lease/ownership behavior. Remove assumptions that a header ticker exists. Keep channel notification choices in subscription controls. The manager uses aligned channel rows, cached statistics, ranking/sort behavior and on-demand selection; no new upstream statistics calls.

### History

Horizontal rows preserve date groups, search, timezone, unknown dates, progress and available metadata. Keep individual/bulk removal, disabled/empty/error states and relevant Settings access. History recording and position synchronization stay independent. Clearing history explains that synced positions are cleared too.

### Playlist library and contents

Distinguish owned playlists from saved references and their ownership/privacy. Use Save playlist for references, and do not confuse unsaving with deleting the source. Redesign create/edit/add-items/delete/unsave and mix screens with shared forms/collections, preserving limits/privacy.

Contents use horizontal rows and stable occurrence IDs. Owners get one subtle grip in the leading row slot. Do not add Move up/down buttons or menu commands. Show a clear insertion indicator; support scrolling while dragging, preserve duplicates/unloaded entries, and save each completed move immediately. A failed/stale move cannot silently leave a misleading order. Keyboard dragging uses the same grip: pick up, reposition, drop or cancel, with concise announcements.

Collection toolbars expose Select. Show checkboxes/batch actions only while selecting. Select all means loaded eligible items; new batches start unselected. Preserve failed selections after partial results. Do not automatically retry ambiguous playlist additions.

## Watching and media

### Layout and utility panel

Standard: player on the left, title/creator/actions/description/comments below, utility panel on the right. Chat must be outside the media container. Theater: widen the player and move supporting content below it. Persist layout per browser profile across videos/sessions; resize the existing media element instead of rebuilding playback.

Available utility tabs are Queue, Chat, Transcript and Up next. Default to Queue for playlists/mixes; otherwise Chat when replay exists; otherwise Up next. Transcript is explicitly opened. Hide unavailable tabs and preserve playback on tab changes. Each tool owns loading/empty/error/retry states. Do not imply support for live chat posting.

### Details and actions

Keep the simple title-cycle icon, with an accurate next-action tooltip/accessibility label. Preserve Hidden → DeArrow → Original when applicable. Hover/focus/tooltips/accessibility/browser metadata must never leak a masked title.

Subscribe sits with creator identity. Save/Share/Clip/More form a deliberate aligned action toolbar. Download, Listen, external links and channel tools are menu items with useful icons/labels. SponsorBlock and title/thumbnail settings are not standalone floating links. Put technical details in structured expandable sections and preserve music, chapters, annotations and source metadata.

### Player controls and capabilities

Keep playback, seek/time, volume, captions, layout, supported PiP and fullscreen accessible. Use a consistent settings hierarchy for quality/codec/audio/speed/caption appearance/enhancements/buffer refresh/diagnostics.

Preserve adaptive/fallback delivery; original/dubbed/Stable Volume track identity; quality/codec selection; captions/downloads/appearance/shortcuts; chapters/storyboards/SponsorBlock; audio-only/VR/annotations; resume/sync/profile isolation; local diagnostics and unknown values; URL overrides and server restrictions. Do not introduce cosmetic changes that silently alter stream behavior.

### Docking

Docking is opt-in and browser-profile scoped. Move only the existing media surface, preserve its original layout space and expose play/pause, mute, return and dismiss. Suspend during fullscreen/PiP/audio-only/clip editing. Dismissal suppresses docking for the current video. Chat and utility content never join the floating player.

## Transcripts, comments, chat and clips

Transcripts retain language, search, timestamps/seeking, current line and Follow playback. Manual browsing must not be repeatedly overridden by automatic scrolling.

Comments appear as compact threads beneath details, with source/sort controls, collapsed replies and explicit continuation for both comments and replies. Preserve YouTube/Reddit availability, disabled/failure states and reuse on community/post screens.

Chat retains synchronization, timestamps, current-time return, user/word filters, font/panel settings and per-video offsets. Put advanced controls behind one settings entry. Replay is read-only, and unavailable differs from network failure. Remove browser overlay mode, geometry/opacity and movement/resizing controls; preserve native/API fields and stored values. Match browser validation ranges to server acceptance.

### Clip creation and viewing

The watch Clip action opens a temporary editor in the utility panel and uses the existing player, not another preview iframe/player. Preserve title validation, timestamp input, range handles, playhead capture, eligibility and 5–120-second bounds. Consolidate repetitive boundary controls. Keep failed drafts and state that publication is public/immutable.

Before previewing, remember playhead/play state. Preview must not save temporary clip positions as full-video progress. Closing restores normal bounds and the prior state. Retain the direct standalone creation route as a consistent fallback.

Keep bounded clip playback, looping, source navigation, creator attribution, owner deletion, My Clips/channel clips and unavailable-source states. Do not add media extraction, editing, federation, import/export or native clip embedding.

## Enhancements and content controls

| Feature | Required behavior |
| --- | --- |
| SponsorBlock | Dedicated category; master, eight category modes/colors, inherited per-channel overrides, markers/prompts/skipping |
| DeArrow | Dedicated category; replacement/original settings, cycle icon, contributions and dedicated identity management |
| Contributions | Explicit suggestions/votes, failure draft retention, locked state, no automatic write retries |
| AI filter | Master plus compact page-group × Blocklist/Warnlist action matrix |
| AI status | Counts, last success, stale/unavailable state and attribution behind disclosure |
| Manual blocks | Searchable management and contextual actions; direct access remains possible |
| Masking | Clear per-channel title/thumbnail rules, upload-age delay, removal and explicit reveal |
| Membership | Preference/search visibility choices without implying access entitlement |

Preserve discovery-hide versus library/channel/queue replacement semantics; no silent library removal/reorder. Keep masking precedence, cache behavior, safe unresolved results and original-title selection. Presentation changes must not introduce per-card metadata fetches.

## Settings and all secondary pages

Settings destinations: Appearance; Language and region; Browsing and search; Playback; Captions and comments; Subscriptions/history/library; Chat replay; SponsorBlock; DeArrow; AI filtering; Blocked channels; Channel titles/thumbnails. Each editable category has one Save/Discard area and saved/unsaved/failure status. Dedicated endpoints can share the same form/component contract.

Search setting names/descriptions/features and navigate to the owning category/field. Preserve drafts between categories; warn before leaving Settings with drafts. Appearance preview is local and Discard restores the saved appearance. Assign every setting to one authoritative editor. Map old URLs/recognized anchors. Never expose private DeArrow identity in ordinary preferences/config.

| Surface | Completion requirement |
| --- | --- |
| Login/signup | Shared forms, validation, return destination, CAPTCHA/gates and configured availability |
| Credentials | Username/password forms and accurate revocation consequences |
| Sessions/tokens | Structured rows, scopes, current session distinction, clear revoke |
| Token authorization | Deliberate approval after account/scope review |
| TV approval | Account/code comparison, Approve/Deny; unchanged native protocol |
| Import | Source/type selector, appropriate file input, explicit import and truthful result |
| Export | Purpose/format grouping; portable export is not a full DB backup |
| Deletion/clear | Shared confirmations for accounts/history/playlists/clips |
| Administration | Personal/instance separation, existing access/defaults/bot controls |
| Verification/recovery | Minimal consistent shell, retained admin recovery/API-only paths |
| Errors/messages | Clear reason and relevant recovery; optional technical detail |
| Legal/privacy/licenses | Readable layout and retained legal/source access |
| Embeds | Shared player, no app shell, unchanged media/embed behavior |

## Explicit retirements and compatibility

Remove Diary design/assets, Compact/reduced-image browser modes, browser player-skin choice, browser chat overlay, header bell, playlist Move up/down controls, duplicate navigation/toggles, loose action links, old popup as primary clip creation and redundant control strips.

Retain compatibility fields wherever APIs/native clients/imports/exports/old callers depend on them. Document when a retained value stops affecting desktop rendering. Do not reset native values to make web rendering simpler.

## Delivery, review and verification

| Stage | Deliverable and exit |
| --- | --- |
| 0 | Accurate baseline documentation, archive and complete assigned inventory |
| 1 | Tokens/components/shell/icons and representative screens; user visual checkpoint |
| 2 | Shared lifecycles/storage, safe category saves and separated administration |
| 3 | Discovery/search/channels/subscriptions/history/playlists and reordering |
| 4 | Watch/player/tabs/transcript/comments/chat/clips/enhancements |
| 5 | Account/admin/verification/data/embed/legal/error coverage |
| 6 | Remove legacy dependencies and complete behavioral/visual regression review |
| 7 | Final handbook/reference cleanup and repository handoff |

Stage 1 shows real shared components applied to shell/browsing, watch/utility panel, playlist rows/grip and one Settings category. Review light/dark at a representative width, with target desktop-width checks, before broad propagation. This checkpoint is explicitly requested; do not silently mark it approved or deploy a mixed interface.

Use Chromium/Firefox at 1280×720, 1440×900 and 1920×1080. Cover long/incomplete/RTL content, enlarged desktop text, live System mode, reduced motion and forced colors where relevant. Inspect screenshots manually; generation alone is not visual acceptance. Mobile browser checks are deferred, not claimed.

The [verification contract](verification.md) lists full journeys and failure cases. Run relevant specs, fixtures, browser checks, guarded disposable DB harnesses and affected normal/API-only builds. Preserve native contracts without Android UI work. Update tests that encode retired visuals/controls instead of keeping unwanted UI to satisfy them.

Record before/after compressed asset/request counts. Avoid new frontend runtimes and remote fonts/icons; preserve lazy loading, deduplication and bounded observation. Menus/tabs/layout/docking must not recreate the player or leak handlers. Distinguish synthetic media from live upstream and remote-host validation.

## Final documentation and handoff

After code completion, rewrite guides around the finished UI and actual state scopes. Replace active Diary authoring guidance, update Settings destinations/screenshots/storage/architecture, regenerate references and test instructions, and document retired browser controls versus retained API fields. Delete temporary/abandoned guidance and stale screenshots, reconcile every coverage row, and provide cache-refresh/rollback/deployment notes for the user.

Add documentation checks to CI so source/reference changes cannot silently drift. State exactly which checks ran locally and which remote/upstream checks remain for user deployment. The user activates the result; no remote host access or deployment is part of implementation.

## Rules for implementation agents and gap filling

- Follow approved shared patterns before inventing a component. Preserve major capabilities unless this plan explicitly retires web behavior.
- Record small gap-filling decisions and their reason in [progress](progress.md); prefer documented existing behavior and reuse.
- Escalate changes to major scope, privacy, permissions, native contracts, destructive migrations or approved visual direction.
- Keep task documentation and evidence current. Do not replace hard requirements with easier tests or a narrower implementation.
- A task is complete only with behavior, visual inspection, relevant tests and documentation. A phase can be in progress without pretending the whole goal is finished.
- Overall completion requires every inventory entry, coherent rendering, no accidental legacy dependencies and the second documentation pass. Intent, a green subset or plausible screenshots are insufficient.
