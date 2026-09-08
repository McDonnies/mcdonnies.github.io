# Daniil Maklakov — Portfolio

Static bilingual portfolio for GitHub Pages. `index.html` contains the page,
styles and language switch; `photo.jpg` is the portrait. No build is needed.

## Local preview

From this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173. French is the default; the language preference is
saved when browser storage is available. Without JavaScript, the French page
and project details remain usable. Colours follow the system's light/dark setting.

## Browser checks

Requires Node.js 20 or later:

```sh
npm ci
npx playwright install chromium
npm test
```

The checks start and stop their own local server. They cover language switching,
storage restrictions, keyboard navigation, mobile overflow, local assets and
use without JavaScript. Playwright is a development dependency only.

## Updating content

Keep both `data-page` sections in sync. If the role or introduction changes,
update the HTML metadata and the `pageMeta` translations as well.

Before publishing, check the alternance dates, availability, client dates and
contact details. The CV link downloads `Daniil_Maklakov_CV.pdf` (French). Replace that file when updating the CV.
