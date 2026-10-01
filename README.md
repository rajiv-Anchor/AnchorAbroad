# Anchor Abroad Poster Generator

Deterministic 1080 × 1920 recruitment posters without AI-image or Codex credits.

## What it does

1. Select 1–4 approved rows in `Jobs Master`.
2. Apps Script validates the values and dispatches a GitHub Action.
3. Playwright renders the locked HTML template into PNG and stores it briefly as a GitHub artifact.
4. Apps Script downloads the PNG and saves it to `01_INBOX_JOB_POSTERS`.
5. Existing Make scenario `01 AA-JOBS-01 — Poster Intake & AI Extraction` adds it to the approval workflow.

Unknown fields are omitted. `#ERROR!`, missing salaries, missing logo, and missing hero imagery stop generation.

## GitHub setup

No Google service account or repository secret is required. GitHub artifacts are retained for one day; the permanent poster is stored in Google Drive.

Run once locally before committing:

```bash
npm install
npx playwright install chromium
npm test
node scripts/render.js examples/bakery.json output/bakery.png
```

Replace the sample hero URLs with public or directly retrievable approved assets. The official logo is already bundled.

## Apps Script setup

Paste `apps-script/Code.gs` into the Apps Script project attached to `AA-JOBS — JOB AUTOMATION MASTER`.

Add these Script Properties:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN` (fine-grained token with Contents write and Actions read access for this repository)
- `HERO_GENERAL`
- optional role mappings such as `HERO_MANUFACTURING`, `HERO_HEALTHCARE`, `HERO_BAKERY`

Reload the spreadsheet. Select one to four approved job rows and choose:

`Anchor Posters → Generate from selected rows`

## Accuracy rules

- The supplied official Anchor Abroad logo is bundled in `assets/anchor-abroad-logo.png`; no CSS recreation is used.
- Blank/unknown fields are not printed.
- INR is read from `Salary in INR`; it is never recalculated in the poster renderer.
- Any spreadsheet error token blocks rendering.
- Hero imagery comes only from the approved asset mapping.
- Multi-role posters support a maximum of four positions.

## Cost

The code has no paid AI dependency. It uses Google Apps Script, GitHub Actions, Google Drive and the existing Make workflow. Usage remains subject to the free quotas of those services.
