---
title: Administrator notes
nav_order: 5
---
# Administrator notes

## Editing these notes
The pages are written in Markdown in `docs-src/`. After editing, run `python3 tools/build_docs.py` (needs `pip install markdown`) to rebuild `docs/`, then commit both folders. The notes use the same design as the SDR app documentation.

## Adding people
Anyone with the link can open SiteBoard, but it only shows reports from a folder on that person's own computer. To let an ARE act as report admin, give him or her the PDFs (and a copy of `siteboard-settings.json`). A shared Google Drive folder is planned for later.

## Another work package
Connect that package's folder, set the project text in Settings, import that package's `setup.json`, and *Save settings to folder*. Nothing in the code needs to change.

## Categories and wording
The SDR setup (version 7: 52 structures, 193 activities) is built in, so the exact SDR activity names decide the category; anything not in the list falls back to the keyword rules in `js/config.js`. After the SDR setup changes, use Settings → Import SDR setup.json.

## If the dashboard shows wrong numbers
Check *Report files* for unreadable or duplicate PDFs, and that the connected folder holds all the reports.
