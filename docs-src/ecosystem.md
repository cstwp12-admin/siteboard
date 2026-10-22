---
title: Ecosystem and wider use
nav_order: 6
---
# Ecosystem and wider use

## The two apps
The **SDR app** is the capture tool: one person, one day, one PDF with photos, chainage, activity, BQ, structure, RFI and GPS. **SiteBoard** is the monitoring tool: it reads every SDR PDF and shows the whole team and the whole project. Everything SiteBoard shows starts as an SDR report.

| Function | Lives in | Why |
|---|---|---|
| Capture photos, GPS, activity, BQ, structure, chainage, RFI | SDR | it is the data-entry tool |
| One-person daily PDF | SDR | |
| Master lists (activities, structures, zones, centreline) | SDR `setup.json` | single source; SiteBoard imports it |
| Team matrices, compliance, observation follow-up | SiteBoard | needs all reports together |
| Weekly / monthly period reports | SiteBoard | combines many PDFs |
| Structure board, photo gallery, Today | SiteBoard | |

If the SDR v1.3 plan adds a dashboard, keep it to the user's own reports and leave multi-person analysis and period reports to SiteBoard.

Links both ways: SiteBoard has a link and QR code to the SDR app. To link back, add *Open SiteBoard* beside the other links in the SDR app's Setup area, and a button beside *Open the app* in the SDR documentation header.

## Can the contractor use it?
Yes, with the same code. It only needs a folder of SDR-format PDFs, so a contractor team that produces SDR reports can connect its own folder and get the same matrices, structure board, gallery and period reports. Points to settle first:
- **Keep the folders separate.** The consultant's supervision records and the contractor's own records are different documents with different purposes. Each organisation connects its own folder and keeps its own settings file.
- **Team filter.** If both teams' PDFs are in one folder, the Team filter (CST, WPC, SOR) separates them.
- **What it does not hold.** SDR reports do not carry manpower, plant, material deliveries or planned programme, so contractor monitoring against programme (planned vs actual) is not covered yet.

## Can it be the project reporting dashboard?
For a project-level audience (client, SO, JKR) the current design has two limits: each person reads a *local* folder, and a phone cannot connect a folder. Two sensible routes, smallest first:
1. **Snapshot page (recommended first step).** SiteBoard exports one self-contained HTML page with the period's numbers and charts (reporting compliance, works by category, progress by zone, structure status, rain days, RFIs) and optionally selected photos. Share it by email, WhatsApp or Drive; it opens on any phone and needs no hosting, and nothing is published publicly.
2. **Live shared dashboard.** Needs a shared data store that all viewers can read (for example a protected Google Sheet or the Apps Script service the SDR app already uses), with SiteBoard pushing summary figures to it. More set-up and a data-sharing decision with the project, so worth doing only after the snapshot has proved useful.

Either way, the public GitHub site stays code only.
