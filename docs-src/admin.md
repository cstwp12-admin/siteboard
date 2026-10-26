---
title: Administrator notes
nav_order: 5
---
# Administrator notes

## Editing these notes
The pages are written in Markdown in `docs-src/`. After editing, run `pip install -r tools/requirements-docs.txt` and then `python3 tools/build_docs.py` to rebuild `docs/`; commit both folders. The pinned documentation dependency makes the build repeatable. The notes use the same design as the SDR app documentation.

## Adding people
Anyone with the link can open SiteBoard, but it only shows reports from a folder on that person's own computer. To let an ARE act as report admin, give him or her the PDFs (and a copy of `siteboard-settings.json`). A shared Google Drive folder is planned for later.

## Another work package
Create or switch to a workspace for that package, connect its reports folder, import that package's SDR `setup.json`, check the project details, and *Save settings to folder*. The import validates and applies the chainage limits, zones, sections, centreline, structures and activity mappings together. Nothing in the code needs to change. An incomplete or invalid setup is rejected and the current project remains active.

## Categories and wording
The WP12 SDR setup (version 7: 52 structures, 193 activities) is built in, so existing workspaces work without importing anything. Exact SDR activity names decide the category; anything not in the list falls back to the keyword rules in `js/config.js`. After a project's SDR setup changes, use Settings → Import SDR setup.json. Settings shows the active range and the number of zones, structures and centreline points.

## If the dashboard shows wrong numbers
Check *Report files* for unreadable or duplicate PDFs, and that the connected folder holds all the reports.
