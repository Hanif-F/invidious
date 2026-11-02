# Desktop findings — 2026-11-02

[Audit scope and results](README.md) · [Coverage](coverage.md)

Three findings affect ordinary desktop use. Two secondary observations concern content length and JavaScript-disabled browsing. They are kept separate to reflect the requested emphasis on normal journeys. This page preserves the original observations; follow-up fixes and verification are documented in the [resolution record](resolution.md).

Priority: **P2** = normal-use functional/discoverability problem; **P3** = lower-priority or conditional problem. “Confirmed” means reproduced locally in Chromium and Firefox and corroborated by the current source. Responses, accounts and content are synthetic; this is not a claim of testing against a deployed instance.

## VF-001 — Feed menu preferences do not control the desktop navigation

**P2 · Functional inconsistency · Confirmed**

**Location:** Settings → Browsing & feeds → Feed menu, and Instance settings → Instance defaults → Feed menu.

**Reproduction:** Set the first feed entry to Trending and the second to Popular, save, then reload a desktop page and compare the sidebar order. The supplemental production-template fixture also renders an already-configured `feed_menu = ["Trending", "Popular"]`, without depending on a mocked save receipt.

**Expected:** The visible feed entries reflect the configured order. A setting presented as a browser navigation preference should affect that navigation.

**Observed:** The sidebar remains Popular → Trending → account library entries → Settings. Its template iterates a fixed list and never reads `preferences.feed_menu`. Reloading cannot apply a different order or selection. The category and admin forms continue to expose and persist this option, so users can save a preference that the desktop interface ignores.

**Evidence:** [Default controls and sidebar](evidence/chromium-feed-menu.png), [reordered preference render](evidence/chromium-audit-feed-menu-reordered.png), [browser measurements](evidence/findings-measurements.json). The second screenshot is the important comparison: Trending is first in the configured fields, while Popular remains first in the sidebar.

**Source:** [Fixed navigation list](../../src/invidious/views/overhaul/navigation.ecr), [browser category ownership](../../src/invidious/web_preferences.cr), [category form](../../src/invidious/views/overhaul/settings.ecr), [admin fields](../../src/invidious/views/admin/settings.ecr). The relevant navigation declaration is line 1; browser ownership is line 13.

**Verification limit:** The audit renders the changed preference through the production template and traces its persistence code; it does not claim a live PostgreSQL save/reload exercise.

## VF-002 — Inline description links are visually indistinguishable from prose

**P2 · Visual/interaction inconsistency · Confirmed**

**Location:** Watch page → expanded Description. The same global styling also applies to ordinary inline links in channel descriptions and comment bodies unless a more specific rule intervenes.

**Reproduction:** Open a video whose description contains an ordinary sentence such as “Read the field notes for this video,” with “field notes” linked. Inspect the sentence before hovering or focusing the link. The replay supplies exactly that valid content to the existing description container; it adds no stylesheet.

**Expected:** A reader can identify the clickable phrase before moving the pointer over every word. The interface already gives legal-page inline links an accent color and underline.

**Observed:** The link and surrounding prose share the same color, 400 font weight and undecorated text. Clicking works, but its availability is concealed until hover/focus. At all three desktop widths, Light reports `rgb(23, 25, 31)` for both link and prose; Dark reports `rgb(241, 243, 247)` for both. `text-decoration-line` is `none`. The difference from privacy/license-page links is also visible.

**Evidence:** [Light](evidence/chromium-inline-link-light.png), [Dark](evidence/chromium-inline-link-dark.png), [Firefox](evidence/firefox-inline-link-light.png), [computed styles](evidence/findings-measurements.json).

**Source:** [Global anchor rules](../../assets/css/foundation.css), lines 29–30; compare the legal-page override near line 352. [Description markup](../../src/invidious/views/overhaul/watch_description.ecr) places upstream description HTML directly inside `#descriptionWrapper`.

## VF-005 — Confirmation action order changes between deletion screens

**P3 · Normal-use visual/interaction inconsistency · Confirmed**

**Location:** Delete playlist, Delete clip, Delete account and Clear watch history.

**Reproduction:** At the same desktop viewport and locale, open the Delete playlist confirmation and compare it with Delete clip or Delete account. No deletion needs to be submitted.

**Expected:** Comparable confirmation screens use a consistent relative position for Cancel and the destructive action.

**Observed:** The playlist screen places **Cancel → Delete playlist**. Clip and account deletion place **Delete → Cancel**, as does Clear watch history. The playlist confirmation also initially focuses Cancel, while the other layouts use their ordinary form order. The controls are labeled correctly and still function; the finding is the inconsistent action placement across closely related tasks.

**Evidence:** [Playlist](evidence/chromium-confirm-delete-playlist.png), [clip](evidence/chromium-confirm-delete-clip.png), [account](evidence/chromium-confirm-delete-account.png), [Firefox clip](evidence/firefox-confirm-delete-clip.png), [recorded action order](evidence/findings-measurements.json).

**Source:** [Playlist confirmation](../../src/invidious/views/delete_playlist.ecr), [clip confirmation](../../src/invidious/views/delete_clip.ecr), [account confirmation](../../src/invidious/views/user/delete_account.ecr), [history confirmation](../../src/invidious/views/user/clear_watch_history.ecr).

## Secondary observations

### VF-003 — A long unbroken description value escapes the watch column

**P3 · Conditional visual defect · Confirmed**

An expanded description containing a URL with a 256-character unbroken token creates horizontal document overflow and paints across the utility column. At a 1280px viewport, the original probe measured a document width of 2454px in Chromium and 2456px in Firefox. It also reproduced at 1440px and 1920px. This is a content-length case, not a failure observed in the ordinary short-description fixtures.

**Reproduction:** Put `https://example.test/resource?token=` followed by 256 `a` characters in a video's description, expand it, and inspect the page width. **Expected:** Content stays in the watch description column. **Observed:** `#descriptionWrapper` has `overflow-wrap: normal`; its scroll width exceeds its column and the desktop viewport. Playlist descriptions, channel About content and comment bodies have explicit wrapping rules, making this inconsistent across content surfaces.

**Evidence:** [Chromium](evidence/chromium-long-description-light.png), [Firefox](evidence/firefox-long-description-light.png), [measurements](evidence/findings-measurements.json). **Source:** [Description container](../../src/invidious/views/overhaul/watch_description.ecr), [foundation styles](../../assets/css/foundation.css), especially `#descriptionWrapper` near line 220 and the wrapping rules for other descriptions.

### VF-004 — The no-JavaScript shell exposes controls that cannot act

**P3 · Conditional functional inconsistency · Confirmed**

With JavaScript disabled, visit Popular, click the navigation toggle, then open the account menu and choose Keyboard shortcuts. Both controls remain visible and enabled, but the sidebar does not change and the help dialog does not open. The ordinary account `<details>` menu itself works, which makes the inert menu item appear equally available.

**Expected:** Visible shell controls work in the supported ordinary-navigation fallback, or their availability is communicated. **Observed:** `aria-expanded` stays `true` before and after clicking the toggle, and the shortcut dialog remains closed in both browsers.

**Evidence:** [Chromium](evidence/chromium-nojs-shell.png), [Firefox](evidence/firefox-nojs-shell.png), [measurements](evidence/findings-measurements.json). **Source:** [Unconditional shell controls](../../src/invidious/views/overhaul/shell.ecr), [JavaScript-only handlers](../../assets/js/overhaul.js). Playback itself requiring JavaScript is outside this finding.

## Observations not promoted to findings

- The initial fixture directory contained 58 obsolete full documents and one navigation fragment without the current foundation stylesheet. Their outdated markup was excluded from product findings.
- Reused post identifiers in the synthetic no-JavaScript post/comment sample produce duplicate carousel IDs. The fixture supplies the same post as both the post and a comment; this does not establish an ordinary upstream failure.
- The shared discovery-test transport substitutes a small `<video>` document for community embed attachments. Initial top-level embed captures therefore showed a tiny player; that was an audit transport artifact. Actual embed documents were subsequently captured and inspected, and the dedicated embed suite passed.
- A synthetic queue/API response being unavailable, a stub verification widget, placeholder thumbnails, fixture publication dates, and unloaded media durations were not treated as product defects.
