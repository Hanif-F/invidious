# Shared web styling

[Documentation index](README.md)

Browser pages share one design through [foundation.css](../assets/css/foundation.css)
and the [shell](../src/invidious/views/overhaul/shell.ecr). The previous Diary
stylesheet, fonts and doodles, Pure foundations and Ionicons font assets were
removed after their consumers migrated. There is no theme registry or picker.

## Assets and components

Use the shared color, spacing, typography, border and focus tokens. Feature
stylesheets own player controls, watch utilities, replay, clips, enhancements and
verification. Keep component markup and behavior in their shared templates and
scripts. First-party icons use the local [Lucide sprite](../assets/icons/lucide.svg)
through [Icons.render](../src/invidious/frontend/icons.cr); retain its license.
Required Video.js plugins, annotation styles and VR dependencies remain vendored.

Use readable system typography, contained actions and visible labels. Decorative
artwork must carry no essential information or intercept input. Do not reintroduce
an alternative shell, font-glyph icons or a second player design in a feature sheet.

## Color modes and layout

`dark_mode` remains empty for System, `light`, or `dark`. The header cycles
System → Light → Dark → System through a CSRF-protected POST to `/toggle_theme`.
[themes.js](../assets/js/themes.js) updates body classes, the SVG control and its
accessible label, and synchronizes current-profile browser tabs. CSS follows live
system appearance changes while System is selected.

Browser cards and rows use their owning page layout; the player uses unified
controls. Raw `thin_mode`, `ui_density` and `player_style` values remain compatible
with native clients and legacy POSTs, without browser editors. Ordinary API HTML
retains its thin-mode contract; `ui=desktop` fragments use browser cards. Avoid
rewriting stored preferences merely to change presentation.

Preserve direction-aware RTL layout, enlarged text, Light/Dark/System, keyboard
focus and reduced motion. Forced colors must retain readable text, borders and
controls, including over arbitrary video. Mobile website redesign is deferred;
shared media, embed and native compatibility still apply.

## Player and interaction compatibility

Watch and embedded pages share media controls; embeds omit application navigation.
Keep source/audio/caption identity, playhead, speed, pause, volume and bounded clip
playback when controls or utility tabs change. Existing player elements and their
owners must survive such interactions. Repeated setup must not add another media
element, control bar, dialog or keyboard handler.

Dialogs and menus need focus return, Escape handling, readable labels and contained
hit targets. Shared comment and timestamp delegation remains available for appended
content. Deferred assets initialize only on a deliberate feature action and must
expose an explicit retry after failure.

## Maintenance checks

[Frontend verification](../tests/frontend/README.md) describes fixture generation,
browser commands, artifacts and limits. Use production templates for representative
visual checks; component fixtures may exercise synthetic pagination without
claiming that a production endpoint offers that continuation.

Inspect generated screenshots alongside behavior checks. The frontend asset
inventory reports current CSS/JS bytes and gzip sizes, with icons/fonts and vendor
player assets reported separately. When comparing revisions, measure representative
request counts as well and explain capability changes without inventing a fixed
byte threshold. See [asset reporting and limits](../tests/frontend/README.md#evidence-assets-and-limits).

## Older preferences

Old `theme`, `theme_random`, `theme_random_interval_hours`, and
`theme_random_next_at` fields are ignored when reading saved settings,
configuration and imports. New serialized preferences omit them, and subsequent
saves remove them. Sparse updates remove only these retired keys and preserve
other unrelated unknown fields. No database migration is needed for shared web
presentation.
