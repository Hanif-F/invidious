# Watch, player, and embed

The Watch and embed work owns player and tool presentation. Reuse the same playback and browser-state owners. The shared Save dialog belongs to the library work item, and standalone sign-in and verification notices belong to the status work item. [Shared overlays](01-foundation-and-shell.md#f3-menus-dialogs-and-feedback) · [Playlist management](02-discovery-and-library.md#playlist-management) · [Standalone and reading pages](04-settings-account-and-status.md#standalone-and-reading-pages)

## Watch page

Cover `/watch`, native and upstream clip destinations, playlist and mix playback, and live or scheduled playback. `/watch/:id`, `/live/:id`, `/shorts/:id`, `/w/:id`, `/v/:id`, and `/e/:id` use the current Watch redirects. Exercise one representative ID alias with retained playback parameters. `/watch_videos` follows the existing anonymous playlist handoff. Channel, user, and custom-name live paths can lead to Watch or a channel page. Keep existing redirect and availability behavior.

1. Use the existing single-column Watch order on phones. The player appears first, then the title, creator, metadata, actions, and description, then the available tools, then comments. Match the shared header and gutters. Keep the player in page flow and preserve its intrinsic aspect ratio. Retain the wider grid from 960 px and desktop docking eligibility from 1100 px.
2. Fit long titles, creator and subscription controls, publication and view metadata, description timestamps and links, music and other metadata, and spoiler/DeArrow affordances. Put Save, Share, Clip, and More in a wrapping action group with their existing availability gates. Keep audio/video mode, Download, Transcript, contributions, and external destinations in More where currently offered. Preserve the ordinary fallbacks, including the inline download form and the explicit comments link.
3. Place a wrapping shortcut group below the primary actions and before the description. Use the order Queue, Timestamps, Transcript, Chat Replay, Up Next, Comments. Render shortcuts only for sections the current page makes available. Use in-page links for visible Queue, Up Next, and Comments. Use buttons for Timestamps, Transcript, and Chat Replay with the same owner as the original control. Use existing localized labels and region targets.
4. Use idempotent open-and-focus behavior for expandable shortcuts. If already open, focus the panel without a second load. Keep existing toggle entry points and synchronize expanded state. Let focus land on the target heading or panel entry and scroll it clear of sticky chrome. Close back to the opener where visible, or to its visible menu summary or corresponding shortcut. While the clip editor suspends tools, suppress their shortcuts and preserve focus and scroll restoration when the tools return. Keep simple anchor links in the unenhanced version where the target is usable.
5. Below 960 px, hide the theater toggle when the grid is stacked and preserve the stored wider selection. Keep the wider-layout toggle and docking behavior. Resize the existing player when the grid or controls change. Preserve active stream, playhead, pause state, captions, volume, playback rate, queue occurrence, and resume owner. Layout changes must avoid new progress writes, source selection, or accidental autoplay.

**Accept when** portrait and short landscape expose all eligible actions and shortcut targets, show only the available tools, and keep playback and profile state through rotation. Test long and masked titles, captions-only and chapters-only variants, clips, no tools, disabled comments, guest/owner actions, inline downloads, and the ordinary Watch fallback.

[Watch template](../../src/invidious/views/watch.ecr) · [Watch behavior](../../assets/js/watch.js) · [Watch grid and tool styles](../../assets/css/watch-tools.css) · [Theater and player geometry](../../assets/js/player-ui.js)

## Player and tools

| Surface | Phone behavior and acceptance |
| --- | --- |
| Video.js and touch playback | Keep play/pause, seek, elapsed and duration, captions, settings, fullscreen and supported PiP accessible. Preserve current device volume handling and touch and keyboard seek intervals. Keep control labels and the playhead readable across landscape, portrait, audio-only, live/scheduled, masked and unavailable sources, and controls-disabled views. Keep gestures within the player and allow ordinary page scrolling outside seek controls. |
| Player settings and diagnostics | Fit the existing coarse-pointer settings panel and the fine-pointer menus at narrow widths. Retain captions and style controls, rate, quality, codec, audio/language and Stable Volume options, SponsorBlock controls, and the optional stats panel. Make close, Back, selection, and diagnostic copy reachable in short/fullscreen viewports. Verify player state through menu changes and overlay dismissal. |
| Chapters and Timestamps | Use the same generated chapter list and current-chapter control. Keep the list in the existing inline Watch tool, with current position and seek actions reachable. Preserve the existing player overlay in supported fullscreen and its return position after exit. Keep chapter marker, storyboard, and SponsorBlock hit areas and event precedence. |
| Queue and Up Next | Keep current occurrence, playlist/mix title, previous/next, continuation and retry, loop/auto-advance, and owner removal reachable. Reuse compact thumbnail-and-text rows. Reserve separate space for remove, reveal, and other controls. Keep internal queue scroll independent of the page. Verify duplicate videos and exact occurrence IDs, filtered or exhausted queues, failed reads, stale responses, and removed current item. |
| Transcript | Stack language, text filter and Follow ahead of a bounded scrolling list. Retain lazy load, current line, manual scroll stopping Follow, search, timestamps, and explicit retry. Seeking must preserve pause behavior and avoid moving the page with every followed line. |
| Chat Replay | On phones, open or focus the existing inline section from its shortcut. Keep the scrolling message list, follow/sync, retry, filters, settings, and per-video timing reachable. Keep current desktop in-player chat and its own control. Rotation or resizing uses the existing chat owner and preserves the active section, supported placement, and loading lifecycle. Verify timestamps, long messages, empty/filtered/failed states, and synchronization with seek. |
| Comments | Keep source and sort controls above results. Reuse the phone post and reply layout. Keep nested reply links, continuation, retry, disabled state, and no-JavaScript fallback. Preserve comment-source preferences and per-thread ownership. |
| Enhancements and actions | Keep share feedback and copy fallback, Save with inline creation, downloads for available formats and captions, DeArrow title/source selection and contributions, and channel spoiler reveal. Preserve guest/setup paths, statuses, local state and the existing save/retry contracts. |

Exercise real playback through the existing synthetic progressive, audio, DASH, and HLS assets where relevant. Keep one player element, one owner per overlay and read workflow, and the same media source on resize, rotation, fullscreen return, and overlay changes. Cover legacy annotations and VR affordances in supported fixtures. A browser capability absent from the test engine follows the existing fallback.

[Player styles](../../assets/css/player.css) · [Touch player](../../assets/js/player-mobile.js) · [Player interface](../../assets/css/player-interface.css) · [Replay chat](../../assets/js/live-chat.js) · [Transcript](../../assets/js/transcript.js) · [Playback contract](../playback.md)

## Clips and embeds

### Native clips and creation

- Keep the inline clip editor in the Watch flow. Use document scroll for the phone editor instead of the fixed desktop side-panel height. Keep the current player available above it and make the selected-boundary capture, range handles, literal start/end fields, title, preview, publish, cancel, and result actions reachable. Let time inputs stack at the narrow fallback. Provide range adjustment through the existing exact time inputs as well as the handles.
- Preserve the 5–120-second bounds, validation messages, exact values, draft, and current preview loop. Use the existing same-player preview session. Closing or publishing restores the previous player state and tool layout. Preview remains excluded from full-video progress, completion, and queue advancement. An ambiguous publish uses existing recovery and avoids an automatic repeat write.
- Cover `/create_clip` ordinary fallback and guest return, native public clip playback and bounded seek/loop, owner-only deletion, `/delete_clip` confirmation and errors, upstream clip handling, and the native unavailable page. Keep share/copy links and the source-video route usable. Coordinate channel and personal clip cards with the library owner.

[Clip editor](../../src/invidious/views/components/clip_editor.ecr) · [Inline panel](../../src/invidious/views/overhaul/watch_clip_editor.ecr) · [Clip styles](../../assets/css/clips.css) · [Clip behavior](../native-clips.md)

### Standalone embed

- Keep `/embed/:id` in its standalone shell. Use the iframe's available width and height for player controls, error/status overlays, and the Watch on Invidious link. Check as a top-level document and inside a small iframe. Keep `/embed/` playlist and home redirect behavior.
- Cover single video, regular and private playlists, series, audio-only, portrait, live/scheduled, masked, preview, and controls-disabled variants. Test captions and player settings, no-JavaScript playback, and explicit retry and next-item behavior. Keep autoplay policy, queue occurrence, and playback position on responsive changes.
- Exercise private iframe sign-in and verification handoffs, bounded media health checks, and return to the same occurrence and playhead. Test narrow notice buttons and statuses with the recovery owner. Preserve the current explicit recovery and read/write lifetimes.

**Accept when** the player, overlays and status fit at 320 × 568, 390 × 844, 844 × 390, and an iframe at 320 × 180 and 640 × 360. Keep the existing desktop embed suite green, including profile, access, and lifecycle checks.

[Embed template](../../src/invidious/views/embed.ecr) · [Embed styles](../../assets/css/embed.css) · [Embed lifecycle](../../assets/js/embed.js) · [Embed tests](../../tests/frontend/embed-surfaces.test.cjs)
