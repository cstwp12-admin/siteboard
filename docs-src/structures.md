---
title: Structures and photos
nav_order: 3
---
# Structures and photos

## Structure board
Lists the 4 bridges, 32 culverts, 13 junction culverts and 3 RS walls from the SDR `setup.json`, with state (*Active* in the last 7 days, *Recorded*, *No record*), last activity and status, number of records and photos.

### How a work item is matched to a structure
1. **Assigned by you** (see below).
2. **Structure code** written in the report (C12, JC3, B2, RSW1) – exact.
3. **Description and chainage** when no code is written. SiteBoard reads the type (box or pipe), size, side and river name from the text, then picks the nearest structure of that type. The chainage limit is wide because drawing chainages are indicative and culverts are moved or offset on site: about 150 m for culverts, 100 m for junction culverts, 120 m for RS walls and 250 m for bridges.

Matches by description are marked **(ch.)**. **(ch.?)** means another structure is almost as close – check it.

### Correcting the board
- Click a structure → **Actual chainage on site** and a note (for example "relocated 45 m to suit stream"). The *Site CH* column then shows where the works were recorded against the drawing chainage.
- Under the table, **Structure works not assigned** lists culvert, bridge or wall works that matched nothing. Choose the structure, or *Not a listed structure*.
- Both are saved in **Settings → Save settings to folder**, so the whole team sees them.

### Updating the list
The WP12 SDR setup (version 7) is built in. After it changes, or when starting another project, use Settings → **Import SDR setup.json**. The project range, zones, sections, centreline, structure list and SDR activity list are validated, replaced together and shared with the team. Existing reports and follow-up records are not deleted.

## Photo gallery
Filter by date, reporter, activity category, structure, zone, chainage range and text, or show only items with remarks. The large view shows the details, a link to the report, a GPS link (reports from SDR v1.2.6+) and a download button.
