# SiteBoard

Static web app (no server, no build) that reads the **Site Daily Photo Report PDFs** made by the WP12 SDR app from a folder on your computer and shows:

**Today** · Overview · Submission matrix · Activities register · Chainage/zone heat strip · RFI & weather · **Observation follow-up** · **Photos** gallery · **Structures** board · Report files (folder health, **Tidy folder**) · **Weekly / Monthly report generator** (A4, print to PDF with photos) · Team guide · Settings.
Extras: Excel export of the period, missing-report message (English / Bahasa Malaysia) for WhatsApp, search across all reports.

Report PDFs never leave your computer: the page reads them locally in the browser. Only the code is hosted. **Keep reports, names and contractor details out of this repository.**

## Deploy to GitHub Pages (free)
The repository holds the dashboard (`index.html`, `css`, `js`, `vendor` at the root) and a documentation site (`docs/`) in the same design as the SDR app documentation. The notes are written in Markdown in `docs-src/` and built to `docs/` by `python3 tools/build_docs.py`.
1. Create a GitHub repository (e.g. `siteboard`). Free Pages needs a **public** repo – fine, it holds code only.
2. Upload everything in this folder to the repo root (keep the `.nojekyll` file).
3. Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. After ~1 minute: dashboard at `https://<your-user>.github.io/siteboard/`, documentation at `.../siteboard/docs/`.
5. Replace `cstwp12-admin` at the top of `tools/build_docs.py`, run it, and commit.

## Team set-up
Read the in-app **Guide** tab (also `docs-src/team-guide.md`, and the documentation site). In short: the report admin saves PDFs into the shared Google Drive folder; each teammate installs Google Drive for desktop with **Mirror files**, opens SiteBoard in Chrome/Edge and connects the folder once.

## Shared settings
Project details, who must report daily, non-working days and observation follow-up are saved in the browser. Settings → **Save settings to folder** writes `siteboard-settings.json` into the report folder; teammates read it automatically (the newest version wins, their own edits are kept).

## Data sources
- Reports made by SDR v1.2.6 or later carry exact data inside the PDF (file properties). SiteBoard reads that first.
- Older reports are read from the page layout. The *Report files* tab shows how many of each, and flags anything unreadable.

## Tuning (`js/config.js`)
Activity categories (keyword rules), project text, rain keywords, working days, auto-refresh interval.

## Tests done
Parsed 43 real reports (0 errors), tidy/move on a test folder, shared-settings round-trip, Excel export, report print layout.

## Features added in Phases 3–5
- **Today**: the latest report day at a glance. **Photos**: gallery with filters, large view, GPS link, download, cached thumbnails. **Structures**: status board matched by code, then description + nearest chainage (culverts are moved on site); set actual chainages and assign unmatched works; both are shared through the settings file.
- **Settings**: import the SDR `setup.json` (structures and activity list), report cover logo, QR codes for the two apps.
- Left sidebar layout; phone-friendly for viewing.
- How SiteBoard and the SDR app divide the work, contractor use and a project dashboard: `docs-src/ecosystem.md`.
