# Oswald

Source: https://github.com/google/fonts/tree/main/ofl/oswald
Downloaded from the Google Fonts distribution on 2026-09-10.
Designers: Vernon Adams, Kalapi Gajjar, Cyreal.

The original `Oswald[wght].ttf` was converted to WOFF2 using fontTools, with no
subsetting or glyph changes. Variable weights 200–700 and all source characters
are retained. Cinematic uses weights 500–700. Attribution and license: `OFL.txt`.

```python
from fontTools.ttLib import TTFont
font = TTFont("Oswald[wght].ttf")
font.flavor = "woff2"
font.save("Oswald.woff2")
```
