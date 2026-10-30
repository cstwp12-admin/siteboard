# SiteBoard

Site reporting dashboard for the WP12 Pan Borneo Sabah Fasa 1B supervision team. It reads the Site Daily Photo Report PDFs made by the SDR app from a folder on your computer and shows:

Today · Overview · Submission matrix · Activities · Chainage and zones · RFI and weather · Observation follow-up · Photos · Map (KMZ alignment, chainage coverage, map statistics, GPS checks and GIS export) · Structures · Report files · Weekly and monthly reports (PDF and Word) · Messages and internal memo (WhatsApp) · Issued register · Workspaces · Guide · Settings.

Report PDFs never leave your computer: the page reads them locally in the browser. This repository holds the program code only.

## Using SiteBoard
Open the dashboard in Chrome, Edge or Brave (Brave: enable `brave://flags/#file-system-access-api` first), press **Connect reports folder** and choose the folder that holds the SDR PDFs. The in-app **Guide** and the documentation site (`docs/`) explain the team routine.

## Documentation
Notes are written in Markdown in `docs-src/` and built to `docs/` with `python3 tools/build_docs.py`.

## Version, licence and credits
- Version v0.10.1. The version is set in `js/config.js` and `tools/build_docs.py`; see `docs-src/changelog.md` for changes.

Focused PDF/Word reports have no fixed photo-count limit. Progressive loading, cancellation and source-specific photo errors protect larger exports. Individual photo sharing offers explicit batches while preserving the complete selection and numbering. Test page: `tests/large-photos.html` (50/100/200 distinct synthetic photos); `tests/app-smoke.html?evidence=1&large=1` additionally exercises 200 photos from the real SDR corpus when available.

Mobile and resilience: larger phone controls, responsive map, full settings/register backup and separate-workspace restore. The installable offline shell caches application assets only. Keep the reports folder backed up separately. See `docs-src/resilience.md`.

Before packaging: run `python tools/build_docs.py`, then `python tools/build_shell.py`, `node tests/resilience.mjs` and the browser regression pages. Upload the complete package, including `sw.js`, `manifest.webmanifest` and `icons/`. Keep the same site address to retain browser workspaces.
- Licence: MIT, see `LICENSE`. Third-party components: `THIRD_PARTY_NOTICES.md`.
- Copyright © 2026 WPN.
