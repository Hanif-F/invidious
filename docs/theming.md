# Theming

A theme controls the visual styling of the shared Invidious pages: colors,
typography, spacing and CSS layout. Modern Neon (`modern-neon`) is the initial
and fallback theme. Choose it under **Preferences → Appearance → Theme** and
save. **Diary** (`diary`) offers a paper scrapbook alternative with ink accents,
taped photo cards and pen doodles; it includes light and charcoal-paper dark modes.
Light/dark/system mode, density, thin mode and player style remain separate
preferences. Selection takes effect on the next page load, without JavaScript.

## Organization and registration

Each theme has its own folder:

```text
assets/themes/modern-neon/
  theme.css
  preview.webp
```

`src/invidious/themes.cr` is the authoritative registry. Every entry has a stable
ID, display name, stylesheet URL and preview URL. IDs must be unique lowercase
slugs (letters, digits and hyphens), and asset URLs must be local absolute paths.
These are trusted source-code values, not user input. Keep `modern-neon` registered:
it is the fallback for unknown or removed IDs. Never derive asset URLs directly
from a submitted preference or load a stylesheet from another theme.

To add a theme, create its folder and add an entry to `AVAILABLE`, for example:

```crystal
Theme.new("paper", "Paper", "/themes/paper/theme.css", "/themes/paper/preview.png"),
```

The registry drives both the picker and stylesheet selection. No template changes
are needed to register a theme. Rebuild and restart the application after registry
changes. Deploy assets with that build. Stylesheets and previews use the existing
`ASSET_COMMIT` query parameter for cache invalidation; commit asset changes before
building a release. Restart after replacing assets because the server may cache
them. The example entry above is not shipped as a selectable theme.

Diary ships a WebP screenshot preview rendered from the frontend browse fixture
with synthetic landscape thumbnails. Its original pen doodles live in `doodles.svg`;
all decorations are local and non-interactive. Headings use a system handwriting
font stack, so their appearance varies with installed fonts.

Modern Neon also ships a 640×360 browse screenshot, captured in dark mode with
the same framing and synthetic thumbnails as Diary. Replace `preview.webp` with
your own 16:9 screenshot. To use another format, change the preview URL in the
registry. One preview represents the theme; it does not switch
with light/dark mode. Images have empty alt text because the adjacent theme name
labels the radio control. Keep previews local, lightweight and free of private data.

## Shared foundation and theme contract

The main template loads page-specific shared styles, Pure/grid styles, icons,
`default.css`, `carousel.css`, and `theme-picker.css`, followed by exactly one
registered theme stylesheet. The legacy shared CSS contains visual defaults as
well as component rules; override those in your theme when necessary. Modern Neon
is the former `modern.css`, moved without changing its rules. A new theme can use
it as a reference or copy it as a starting point, but owns its resulting CSS and
must not import Modern Neon at runtime.

Page templates, semantic markup, scripts, routes, player controls and embedded
player styles remain shared. Themes do not supply templates or JavaScript. Do not
rename IDs/classes used by scripts or alter behavior to implement a visual design.
If a design needs new markup, add a compatible shared hook and verify all themes.

The body exposes these independent hooks:

| Hook | Values / meaning |
| --- | --- |
| `data-theme` | Registered theme ID |
| `.light-theme` | Explicit light mode |
| `.dark-theme` | Explicit dark mode |
| `.no-theme` | System mode; use `prefers-color-scheme` |
| `data-density` | `balanced` or `compact` |
| `data-thin` | `true` or `false` |
| `data-page` | `watch`, `search`, `playlist`, or `browse` |
| HTML `dir` | `ltr` or `rtl` |

Define the existing design tokens for shared components and consistent styling:

- Colors: `--page`, `--surface`, `--surface-raised`, `--text`, `--muted`, `--line`,
  `--accent`, `--accent-ink`, `--focus`, `--selected`, `--gradient`.
- Geometry: `--radius`, `--gap`, `--card-gap`, `--header-height`.

Start with light tokens on `:root`, override dark tokens on `.dark-theme`, and
repeat those overrides for `.no-theme` inside
`@media (prefers-color-scheme: dark)`. Set the matching `color-scheme`. The existing
navigation toggle changes only mode classes; it preserves `data-theme` and other
body attributes. Explicit light mode must stay light even on a dark system.

Keep semantic content and controls usable at 320px through desktop sizes, with
keyboard focus, enlarged text, reduced motion and RTL. Use logical properties for
directional spacing. Support both densities and pages without thumbnails in thin
mode. Do not rely solely on color to show selection or hide core functionality.

## Storage and compatibility

`theme` is a string in the existing preferences JSON/YAML, anonymous `PREFS` cookie,
account preferences, authenticated preferences API and Invidious import/export.
There is no database migration or new endpoint. Configure an instance default with:

```yaml
default_user_preferences:
  theme: modern-neon
```

Missing values use the configured default. Unknown or removed IDs fall back to
Modern Neon. Form submissions without `theme` preserve the current selection for
compatibility with older forms. API replacement semantics remain unchanged:
omitted fields use defaults. Asset lookup also validates IDs, including values
assigned internally. New picker text uses English translation fallback; theme
names are display names from the registry.

## Contributor checklist

1. Create an independent folder and register a unique ID and local asset URLs.
2. Supply all tokens, light/dark/system modes, and a lightweight preview.
3. Check preferences, browse/search, channels, watch/queues, playlists, history,
   login and error pages; exercise density, thin mode, RTL and responsive layouts.
4. Verify keyboard radio selection, selected indicator, preview loading, saving
   without JavaScript, account and anonymous persistence, and the mode toggle.
5. Run the frontend fixture generator and browser suite described in
   [frontend verification](../tests/frontend/README.md). Extend the asset budget
   for new shipped assets. Test alternatives must stay in test fixtures.
6. Inspect screenshots before release. Rebuild/restart with committed assets and
   verify only the selected theme stylesheet loads. Removing a theme must leave
   existing users with the Modern Neon fallback.
