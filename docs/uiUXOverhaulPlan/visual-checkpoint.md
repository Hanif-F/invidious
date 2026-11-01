# D1 desktop visual checkpoint

[Master plan](README.md) · [Tasks](tasks.md) · [Progress](progress.md) · [Coverage](coverage.md)

**Historical D1 checkpoint: visual direction approved by the user on 26 October 2026.** The candidate descriptions and later-stage requirements below record that phase, before broad migration. The completed production-template views are in the [current gallery](../../screenshots/README.md) and [D8 acceptance](d8-acceptance.md). Thumbnails/media and service responses here are synthetic; the player and presentation helpers are real production code. The original images and evidence remain unchanged.

The review covers the shared neutral shell, browsing grid, watch/utility panel, playlist rows/grip and Appearance category at 1440×900. Open each image to inspect at full size.

| Screen | Light | Dark |
| --- | --- | --- |
| Browsing | [Light grid](review/browse-light-1440.png) | [Dark grid](review/browse-dark-1440.png) |
| Watch | [Light watch](review/watch-light-1440.png) | [Dark watch](review/watch-dark-1440.png) |
| Playlist | [Light rows/grip](review/playlist-light-1440.png) | [Dark rows/grip](review/playlist-dark-1440.png) |
| Settings | [Light Appearance](review/settings-light-1440.png) | [Dark Appearance](review/settings-dark-1440.png) |

The [evidence manifest](review/evidence.json) records the source context, image hashes, asset measurements and synthetic request observations. The [baseline asset inventory](asset-baseline.json) is retained for D8’s final comparison.

## Validation and boundaries

The fixture renderer and its existing preference/API/parser checks pass. Twelve D1 browser checks pass across Chromium and Firefox. They cover the three desktop sizes in Light/Dark, live System changes, RTL and enlarged desktop text, forced colors, semantic color contrast, shell/menu/dialog focus, browsing collapse/watch drawer, Appearance preview/Discard, real-player identity/time/rate/volume across utility tabs, deferred transcripts, and pointer/keyboard occurrence moves with cancel/failure handling. Sixty-four screenshots are generated locally; the eight review images above are retained with this document. Screenshots were manually inspected, including the 1440px light/dark representatives and selected edge-size/RTL/forced-color cases.

The two existing Chromium/Firefox live appearance/cross-tab tests also pass after SVG theme-control support. The full later regression/database/build matrix is not claimed by this checkpoint.

Category saves, complete settings search/drafts and separated administration are D2 work. Full discovery/library/watch/enhancement/account coverage, media-control hierarchy, chat/clip editing, legacy removal and final documentation remain D3–D9 work. Candidate ordering posts use intercepted test responses; real transaction/ownership/concurrency verification remains required in D4. No remote deployment or live upstream/native-device validation occurred.

The user explicitly answered “Approve this visual direction” to this checkpoint on 26 October 2026. The progress log records that approval. Later feature, compatibility and verification requirements remain in force.
