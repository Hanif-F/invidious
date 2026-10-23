# Diary styling

[Documentation index](README.md)

Diary is the only site design. The main template loads its stylesheet directly;
there is no theme registry, picker, preview imagery, or random rotation.

## Assets and cascade

[Diary’s stylesheet](../assets/themes/diary/theme.css) follows the shared base and
feature stylesheets. Keep its fonts and `doodles.svg` in the same directory so
existing relative asset URLs remain valid. Base CSS also contains component rules
and specificity that Diary must account for; token changes alone do not restyle
every component. Keep feature-specific markup and behavior in their existing
shared templates and scripts.

Dudu Calligraphy and Helvetica Punk use `font-display: swap` and local fallback
fonts. Short interface text uses handwriting; dense reading text, icon glyphs and
player controls retain their existing font families. Decorative artwork carries
no essential information and must not intercept input.

## Color modes and layout

`dark_mode` remains empty for System, `light`, or `dark`. The header cycles
System → Light → Dark → System through `/toggle_theme`. The existing mode script
updates body classes and synchronizes browser tabs. Diary responds to live system
appearance changes in System mode, while explicit modes override system settings.

Preserve balanced/compact density, thin mode, direction-aware RTL layouts,
enlarged text and responsive sizing. Forced-colors mode removes nonessential
decoration while retaining usable text, focus indicators and controls.

## Player and interaction compatibility

The site design shares player components with embedded pages. Embedded player
styles and player selection remain independent of Diary. Keep video surfaces,
controls, menus, captions, dialogs, overlays and chat interactions functional.
Navigation, form controls and dialogs need visible keyboard focus and readable
light/dark palettes. Preserve accessible names and shared interaction behavior.

## Maintenance checks

[Frontend verification](../tests/frontend/README.md) describes fixture generation,
browser commands, screenshot artifacts and test limitations. Appearance checks
cover old preference documents, cookie/account persistence, API output,
import/export, mode cycling, live appearance changes and browser synchronization.
The browser suite also covers mobile/desktop layouts, RTL, compact/thin mode,
enlarged text, local fonts, and forced-colors decoration removal.

Include shipped assets in [asset accounting](../tests/frontend/asset-baseline.json).
Report stylesheet/JavaScript size and growth as performance observations;
measurements do not impose a fixed size target. Inspect representative rendered
screenshots for layout and readability alongside automated checks.

## Older preferences

Old `theme`, `theme_random`, `theme_random_interval_hours`, and
`theme_random_next_at` fields are ignored when reading saved settings,
configuration and imports. New serialized preferences omit them, and subsequent
saves remove them. Sparse updates remove only these retired keys and preserve
other unrelated unknown fields. Existing accounts and guests use Diary immediately
without a database migration.
