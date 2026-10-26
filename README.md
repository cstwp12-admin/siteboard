# SiteBoard

Site reporting dashboard for the WP12 Pan Borneo Sabah Fasa 1B supervision team. It reads the Site Daily Photo Report PDFs made by the SDR app from a folder on your computer and shows:

Today · Overview · Submission matrix · Activities · Chainage and zones · RFI and weather · Observation follow-up · Photos · Map (KMZ alignment, snap to WhatsApp or memo) · Structures · Report files · Weekly and monthly reports (PDF and Word) · Messages and internal memo (WhatsApp) · Issued register · Workspaces · Guide · Settings.

Report PDFs never leave your computer: the page reads them locally in the browser. This repository holds the program code only.

## Using SiteBoard
Open the dashboard in Chrome, Edge or Brave (Brave: enable `brave://flags/#file-system-access-api` first), press **Connect reports folder** and choose the folder that holds the SDR PDFs. The in-app **Guide** and the documentation site (`docs/`) explain the team routine.

## Documentation
Notes are written in Markdown in `docs-src/` and built to `docs/` with `python3 tools/build_docs.py`.

## Version, licence and credits
- Version v0.6.1. The version is set in `js/config.js` and `tools/build_docs.py`; see `docs-src/changelog.md` for changes.
- Licence: MIT, see `LICENSE`. Third-party components: `THIRD_PARTY_NOTICES.md`.
- Copyright © 2026 WPN.
