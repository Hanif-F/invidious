# Finding resolutions — 2026-11-02

[Audit index](README.md) · [Original findings](findings.md)

**All five findings are resolved.**

| Finding | Corrected behavior |
| --- | --- |
| VF-001 | The server-rendered sidebar follows `preferences.feed_menu` order and selection. It skips duplicates and unsupported entries, respects disabled Popular and guest access, and retains History, My Clips and Settings as independent tools. Instance defaults reach the same template through ordinary preferences. |
| VF-002 | Inline links in watch, channel and playlist descriptions and comment bodies use the theme accent and an underline before hover or focus. Navigation, authors and buttons retain their control styling. |
| VF-003 | Watch descriptions wrap unbroken text, including long URL tokens, within their column. |
| VF-004 | Navigation toggle and keyboard-help controls start hidden and are revealed only after their handlers are installed. The native account menu, theme form, search and sidebar links remain available without JavaScript or when the shell script cannot load. |
| VF-005 | Playlist deletion/unsaving, clip deletion, account deletion and clearing history consistently place Cancel before the destructive action. Initial confirmations focus Cancel; failed account submissions retain their existing error presentation without autofocus. |

## Verification

The follow-up uses regenerated production Crystal/ECR templates and synthetic local responses, with no production account or database writes. Original audit evidence is retained under `evidence/`; corrected screenshots and measurements are written separately under `evidence/resolved/`.

The [production fixture renderer](evidence/resolved/fixture-render.log), [API-only recovery renderer](evidence/resolved/recovery-render.log) and [supplemental renderer](evidence/resolved/supplemental-render.log) completed successfully. Crystal formatting, JavaScript syntax, documentation links and whitespace checks passed.

The complete frontend suite passed **912 tests, 0 failures, 0 skipped and 0 cancelled**, with Chromium and Firefox, in 581.384 seconds. The detached test process exited with status **0**. See the [complete TAP output](evidence/resolved/frontend-suite.tap) and [verification summary](evidence/resolved/verification-summary.json).

The replay asserts reordered/selected feeds, visible inline-link styling in Light and Dark, containment of the original 256-character URL at 1280, 1440 and 1920 pixels, no-JavaScript shell availability, and action order/focus on all five confirmation variants in Chromium and Firefox. Navigation regression checks also cover guest access, disabled Popular, unknown entries and duplicates. Shell regression checks cover disabled JavaScript and a failed script request; existing interaction checks cover enabled toggle/help behavior and ordinary confirmation submissions.

The replay passed all **22 recorded browser states**. [Measurements](evidence/resolved/resolution-measurements.json) show document widths equal to all three viewport widths and an underline on inline links in both themes and browsers. Representative corrected screenshots were visually inspected: [feed order](evidence/resolved/chromium-feed-menu-reordered.png), [inline link](evidence/resolved/firefox-inline-link-light.png), [long description](evidence/resolved/firefox-long-description-dark.png), [account menu with JavaScript disabled](evidence/resolved/chromium-nojs-shell.png), [clip deletion](evidence/resolved/chromium-confirm-delete-clip.png), [account deletion](evidence/resolved/chromium-confirm-delete-account.png) and [history clearing](evidence/resolved/chromium-confirm-delete-history.png).

Run the renderers and frontend suite using the [frontend guide](../../tests/frontend/README.md). Render the supplemental fixture and run the corrected-behavior replay using the commands in the [audit index](README.md#reproduce-the-review).
