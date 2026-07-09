# Regeneration Live Preview Template

This directory is the canonical offline template for the `/regeneration.html` live model generation page.

Use it when a 3D game regeneration task needs to show newly generated GLB assets as they complete:

- Copy `regeneration.html` to `public/regeneration.html`.
- Copy `regeneration-preview.js` to `src/regeneration-preview.js`.
- Create or update `public/regeneration-status.json` using the shape in `regeneration-status.sample.json`.
- Bundle `src/regeneration-preview.js` to `public/regeneration-preview.bundle.js`.

Do not scrape `http://127.0.0.1:4173/regeneration.html` at runtime. That URL is only the current served instance of this template; this folder is the source of truth.
