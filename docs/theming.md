# WARNING: THIS IS A BASELINE GUIDANCE, AND ANY PART CAN BE IGNORED TO ACHIVE INTENDED DESIGN

## Theme authoring contract

This document defines what a complete Invidious theme must provide and the shared
system it must work within. It is intended for human contributors and AI agents
creating themes. Requirements describe compatibility and completeness; visual
direction, palette, typography, decoration and CSS organization remain design
choices. Existing themes are implementations, not specifications for new designs.


## System context and boundaries

A theme controls the visual presentation of pages using the shared application
layout: colors, typography, spacing and CSS layout. The server resolves the active
theme through the [theme registry](../src/invidious/themes.cr). The
[main template](../src/invidious/views/template.ecr) loads page-specific header
styles, shared framework/grid styles, icons and application component styles,
followed by exactly one registered theme stylesheet.

The shared CSS is not an unstyled foundation. It contains legacy visual defaults,
component rules and selectors with their own specificity. A theme must account
for that cascade; defining tokens alone does not restyle every component. Themes
must be independent of other themes' stylesheets and assets, with no runtime
imports from another theme.

Templates, semantic content, routes, scripts and player behavior belong to the
shared application. Themes do not provide templates or JavaScript. Preserve
script hooks, IDs, classes, control semantics and states such as `hidden`, expanded
and selected. A visual design must not remove functionality or change behavior.
If additional markup is necessary, it must be a compatible shared hook, verified
across all themes. Embedded player pages and player styles have their own shared
implementation; the site theme does not replace that system. On watch pages,
theme CSS must preserve player controls and the independent player-style preference.

Theme identity is separate from light/dark/system color mode, density and thin
mode. A theme must work with each of those preferences rather than assume a
particular combination.

## Required theme deliverables

A complete theme consists of:

- **Registry identity:** a unique, stable lowercase slug using letters, digits and
  hyphens, a human-readable display name, and explicit stylesheet and preview URLs
  in the registry. `random` is reserved for the shared Random picker option.
- **Independent stylesheet:** a theme-owned `theme.css` under
  `assets/themes/<theme-id>/`, covering the shared pages and states below.
- **Representative preview:** one local, lightweight 16:9 screenshot of the actual
  theme, free of private data. The picker displays it in a 640×360 image slot. One
  preview represents all color modes; its format is determined by the registered
  URL. The shared picker supplies the adjacent name and empty image alt text.
- **Supporting assets, when used:** local theme-owned fonts, images and decorations
  with usable fallbacks. Decorations must not intercept input or carry essential
  information. Text and controls must remain usable while fonts or images load,
  or if they fail to load.

Registered asset URLs must be local absolute paths. The registry is the trusted
source of URLs; preference strings must never be used to construct asset paths.
The registry drives both the picker and stylesheet selection, so ordinary theme
registration requires no picker template changes.

The registry's default entry must remain resolvable: unknown or removed theme IDs
fall back to it. Registry changes require a rebuilt application and matching
assets. Stylesheet and preview URLs use `ASSET_COMMIT`, derived from committed
asset history at build time, for cache invalidation. Release assets therefore need
to be committed before the build, and asset replacement requires a restart because
the server can cache files.

## Styling interface

The shared template exposes these hooks. Their values describe application state;
a theme consumes them without redefining their meaning.

| Hook | Meaning |
| --- | --- |
| Body `data-theme` | Resolved registered theme ID |
| Body `.light-theme` | Explicit light mode |
| Body `.dark-theme` | Explicit dark mode |
| Body `.no-theme` | System mode, following `prefers-color-scheme` |
| Body `data-density` | `balanced` or `compact` |
| Body `data-thin` | `true` or `false`; thin mode can omit thumbnails |
| Body `data-page` | `watch`, `search`, `playlist`, or `browse`; broad layout categories, not an exhaustive route list |
| HTML `dir` | `ltr` or `rtl` |

Provide the existing token vocabulary for consistent component styling. Shared
components consume some of these directly; others are conventions used by theme
layouts. They do not constitute a complete component API.

| Token | Role |
| --- | --- |
| `--page` | Page background |
| `--surface` | Primary component background |
| `--surface-raised` | Raised or contrasting component background |
| `--text` | Primary text |
| `--muted` | Secondary text that must remain readable |
| `--line` | Borders and separators |
| `--accent` | Accent color for links and actions |
| `--accent-ink` | Foreground on accent backgrounds |
| `--focus` | Visible keyboard-focus indicator |
| `--selected` | Selected-state background |
| `--gradient` | Decorative background value; a solid color is also valid |
| `--radius` | Common corner radius |
| `--gap` | General layout/grid spacing |
| `--card-gap` | Spacing within card layouts |
| `--header-height` | Header sizing reference |

Token values and component rules must produce coherent light and dark appearances,
with a matching `color-scheme` for native controls. Explicit light or dark mode
must override system appearance. System mode must follow system changes while the
page remains open. The shared [mode script](../assets/js/themes.js) changes mode
classes without replacing theme identity or other body attributes; theme rules
must respond to those changes without custom JavaScript or a reload. No particular
selector organization or palette is required.

Both densities must remain usable, and thin mode must produce a complete layout
when thumbnails are absent. Support right-to-left content and direction-aware
spacing, long or translated labels, enlarged text and viewport widths from 320px
through desktop sizes. Core content and controls must remain reachable without
accidental clipping or page-wide overflow.

Keyboard focus, selected states, hover, disabled controls and expanded menus must
remain distinguishable and usable. Do not rely solely on color for selection.
Preserve readable contrast, touch targets and the shared skip link. Respect reduced
motion and forced-colors preferences; decorative effects must not obscure content
or controls in those modes.

## Selection and persistence context

The shared preferences form selects and saves themes without JavaScript. `theme`
is stored through existing anonymous cookies, account preferences, configuration,
authenticated preferences API and import/export. Themes need no new storage,
database migration or endpoint. Missing values use the configured default;
unrecognized IDs resolve to the registry fallback. Theme authors must preserve
this shared selection flow rather than introduce theme-specific settings storage.

Random is a selection policy, not a theme or stylesheet. It keeps an active
registered theme and can choose another when its interval is overdue on eligible
HTML document navigation. It does not replace the theme on an already-open page.
Selecting a named theme disables Random. Every registered theme must therefore be
complete when selected independently, without relying on a previously loaded
theme or an initialization script. Color mode remains independent of this policy.

## Completion criteria and verification references

A theme is complete when there is evidence for all of the following:

- **Page coverage:** preferences and its picker; browse/feed cards; search results;
  channels; watch pages, queues and transcripts; playlists and playlist libraries;
  history; login/account forms; and error and empty states. Coverage extends beyond
  the four broad `data-page` categories.
- **Preference and layout coverage:** light, dark and system modes, including live
  mode changes; balanced and compact density; thin mode; enlarged text; and
  mobile through wide desktop layouts.
- **Interaction coverage:** keyboard navigation and visible focus, picker radio
  selection and its selected indicator, menus/dialogs, form controls, and working
  shared player controls. Theme selection and navigation remain usable without
  JavaScript wherever the shared application supports them.
- **Integration coverage:** previews load, only the selected theme stylesheet is
  loaded, supporting assets remain independent of other themes, saved selections
  persist for guests and accounts, and invalid or removed IDs retain a valid
  fallback.
- **Asset and visual verification:** new shipped assets are included in the asset
  budget inventory, applicable browser checks pass, and rendered screenshots are
  inspected for layout and readability. A passing test suite alone is not visual
  approval. Previews must represent the resulting implementation.

[Frontend verification](../tests/frontend/README.md) documents fixture generation,
browser commands, screenshot artifacts and test limitations. The
[browser suite](../tests/frontend/ui.test.cjs) and
[asset inventory](../tests/frontend/asset-baseline.json) define the enforced budget
checks, including separate stylesheet/shared-asset and preview accounting.
[Theme preference checks](../tests/frontend/theme_checks.cr) cover shared selection
and persistence behavior. Extend relevant fixtures and coverage for a new theme;
test-only theme alternatives belong in fixtures rather than the shipped registry.
