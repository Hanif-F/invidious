# Desktop visual and functional audit

Audit date: 2026-11-02. Implementation baseline: `ce40c0a018d4071e16de8ac0cb92bcd1f54cd745`.

All five baseline findings are resolved. The [resolution record](resolution.md) documents the fixes, 912 passing frontend tests and corrected browser evidence. The original audit and its evidence below are retained for comparison.

The original audit recorded observations without changing application code. Desktop viewports are 1280 × 720, 1440 × 900, and 1920 × 1080. Mobile and tablet layouts are deferred. Normal desktop journeys received priority over edge cases.

The repository desktop audit is complete within the local production-template/browser environment described below. Every desktop page family and shared interaction is accounted for in the [coverage checklist](coverage.md), with a [complete source inventory](source-inventory.md). No deployed instance or real account/database writes were tested.

## Findings

| ID | Priority | Finding | Focus |
| --- | --- | --- | --- |
| VF-001 | P2 | Feed menu preferences are exposed but ignored by the fixed desktop sidebar | Normal use |
| VF-002 | P2 | Inline description links look identical to surrounding prose | Normal use |
| VF-005 | P3 | Cancel and Delete swap positions between confirmation screens | Normal use |
| VF-003 | P3 | A long unbroken description value overflows the watch column | Secondary |
| VF-004 | P3 | The no-JavaScript shell exposes inert navigation/help controls | Secondary |

[Detailed findings, reproduction steps, source references and screenshots](findings.md)

## Verification

- **910 existing frontend checks passed**, with zero reported failures, skips or cancellations, across Chromium and Firefox.
- **602 current full documents per browser** were checked at all three desktop sizes: **3,612 viewport checks**. There were no page-wide overflow or unnamed visible-control flags in the unmodified fixture sweep. Content substitutions used to reproduce findings are recorded separately.
- **108 representative normal screen states**, the supplemental hashtag/menu views, and detailed player/editor/menu/dialog states received visual inspection. The five initial embed captures were replaced with actual-document captures after identifying the shared test transport's attachment stub.
- **93 templates/components, 50 browser modules and 13 stylesheets** are accounted for. Synthetic duplicate carousel IDs and obsolete fixture documents were excluded from product findings.

The [coverage and verification record](coverage.md) explains the checks and terminal teardown caveat. [Run metadata](evidence/run-summary.json), [complete TAP output](evidence/frontend-suite.tap), [finding measurements](evidence/findings-measurements.json), and renderer logs are retained here. Screenshots use synthetic content and contain no real credentials or accounts.

## Review method

- Inventory every production page template and shared component, and the first-party browser modules that supply interactions.
- Render production ECR templates using the repository's local fixtures; use synthetic thumbnails, media, accounts, provider responses, and intercepted requests.
- Run the existing Chromium and Firefox behavioral suites, then inspect representative desktop page images and interactive states separately.
- Check Light, Dark, System, keyboard operation, desktop RTL/enlarged text, empty/error/loading states, guest/account/admin availability, and ordinary form fallbacks.
- Record reproduction steps, expected and observed behavior, source locations, impact, and retained evidence for each confirmed finding.

Fixture checks establish browser behavior under the declared local responses. They do not establish live YouTube/Companion/provider availability, real database transactions, deployed proxy policy, hardware codec support, or operating-system fullscreen/PiP behavior.

## Reproduce the review

Run from the repository root after installing the existing frontend prerequisites described in [the frontend test guide](../../tests/frontend/README.md):

```sh
CRYSTAL_CACHE_DIR=/tmp/invidious-audit-crystal crystal run tests/frontend/render_fixtures.cr -Dskip_videojs_download
CRYSTAL_CACHE_DIR=/tmp/invidious-audit-crystal crystal run tests/frontend/render_recovery_fixtures.cr -Dapi_only -Dskip_videojs_download
cd tests/frontend
npm test -- --test-concurrency=2
```

Then return to the repository root:

```sh
AUDIT_OUTPUT=/tmp/invidious-desktop-chromium AUDIT_SCREENSHOTS=0 node docs/visualFunctionalInconsistencies/capture-desktop.cjs
AUDIT_ENGINE=firefox AUDIT_OUTPUT=/tmp/invidious-desktop-firefox AUDIT_SCREENSHOTS=0 node docs/visualFunctionalInconsistencies/capture-desktop.cjs
CRYSTAL_CACHE_DIR=/tmp/invidious-audit-crystal crystal run docs/visualFunctionalInconsistencies/render-audit-fixtures.cr -Dskip_videojs_download
AUDIT_OUTPUT=/tmp/invidious-extra-captures node docs/visualFunctionalInconsistencies/capture-desktop.cjs audit-hashtag-light audit-hashtag-dark audit-feed-menu-reordered
node docs/visualFunctionalInconsistencies/reproduce-findings.cjs
```

These support scripts are documentation-only. The capture utility reuses the transport helper from the audited `overhaul.test.cjs` revision; changes to that helper may require updating the utility. All requests are intercepted locally. The supplemental renderer includes the standard renderer before adding its three audit views. Preserve the normal media-generation prerequisites from the frontend guide when reproducing behavioral tests.

`reproduce-findings.cjs` now asserts the corrected behavior and writes follow-up screenshots and `resolution-measurements.json` under `evidence/resolved/` (or `AUDIT_OUTPUT`). It leaves the original failing evidence intact.
