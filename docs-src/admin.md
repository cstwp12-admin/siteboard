---
title: Administrator notes
nav_order: 5
---
# Administrator notes

## Publishing the site (GitHub Pages)
1. Create a **public** repository, for example `siteboard`. It holds code only – never reports, names or contractor details.
2. Upload everything in this folder to the repository root (keep the `.nojekyll` file).
3. Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
4. After a minute: the dashboard is at `https://cstwp12-admin.github.io/siteboard/` and these notes at `/docs/`.
5. Open `tools/build_docs.py`, replace `cstwp12-admin` in the two addresses at the top, and rebuild the notes (below). Commit.

## Editing these notes
The pages are written in Markdown in `docs-src/`. After editing, run `python3 tools/build_docs.py` (needs `pip install markdown`) to rebuild `docs/`, then commit both folders. The notes use the same design as the SDR app documentation.

## Adding people
Anyone with the link and the shared Drive folder can use it. Access to the *reports* is controlled by Google Drive sharing, not by SiteBoard. To give an assistant RE access, share the Drive folder with them.

## Another work package
Open the dashboard on that package's folder, set the project text in Settings, import that package's `setup.json`, and *Save settings to folder*. Nothing in the code needs to change.

## Categories and wording
The SDR setup (version 7: 52 structures, 193 activities) is built in, so the exact SDR activity names decide the category; anything not in the list falls back to the keyword rules in `js/config.js`. After the SDR setup changes, use Settings → Import SDR setup.json.

## If the dashboard shows wrong numbers
Check *Report files* for unreadable or duplicate PDFs, and that Google Drive uses **Mirror files**.
