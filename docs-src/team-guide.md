---
title: Team guide
nav_order: 2
---
# Team guide

One page for everyone who uses the dashboard.

## 1. Who does what

- **IOWs** make the Site Daily Photo Report in the SDR app every working day and send the PDF to the report admin.
- **REs and AREs** report as required.
- **Report admin** (Resident Engineer) saves each PDF into the shared Google Drive folder. Nobody else changes files in that folder.

## 2. Filing rules

- Keep the file name exactly as the SDR app creates it, e.g. `WP12-CST-MAT-20261016-1_SDR.pdf`. Never rename or edit the PDF.
- Save into the current month folder, e.g. `2026-10`. If unsure, drop the file anywhere in the folder and press **Tidy folder** in *Report files*.
- A corrected report is generated again in the app, with the next number (`-2`). The old file stays.
- Folders starting with `_` or `.` are ignored by the dashboard.

## 3. Opening the dashboard (every team member)

- Use **Chrome, Edge or Brave on a computer**. Phones can view but cannot connect a folder. In **Brave**, first open `brave://flags/#file-system-access-api`, set it to *Enabled* and relaunch (Brave turns folder access off by default).
- Install **Google Drive for desktop**, open its preferences and choose **Mirror files** so the folder is fully on your PC. Right-click the shared folder and make sure it is available offline.
- Open the SiteBoard link and press **Connect reports folder**. Choose the shared Drive folder (for example `G:\My Drive\WP12\CST_Daily_Reports`). Press **Allow**.
- Keep the tab open: it checks the folder every 20 seconds. Next time, press **Reconnect folder** once.

## 4. Daily routine for the report admin

- Check **Overview** and **Submissions** for missing reports.
- Use **Missing-report message** (Submissions) to remind IOWs on WhatsApp.
- Review **Observations**: set each to Open, Monitoring or Closed and add a note.
- At week end and month end use **Generate report**.

## 5. Sharing settings with the team
Project details, who must report daily, non-working days and observation follow-up are stored in your browser. In *Settings* press **Save settings to folder**; the file `siteboard-settings.json` then reaches every teammate through Google Drive and is read automatically.

## 6. If something looks wrong

- Open *Report files*: it lists files that could not be read, mismatches and duplicates.
- A report shows “not received” but was sent? Check it is in the folder and that Google Drive has finished syncing.
- Reports made by SDR v1.2.6 or later carry exact data inside the PDF; older ones are read from the page layout and may need a check.

## 7. Photos and structures
- **Photos** shows every photo. Filter by date, reporter, activity, structure, zone, chainage or text. Click a photo to enlarge it; use the arrow keys to move on. *Prepare all thumbnails* makes the gallery load instantly next time.
- **Structures** lists the bridges, culverts, junction culverts and RS walls with the last record, status and photos. See [Structures and photos](structures).

## 8. Today view
Open *Today* first thing: who has reported, what was done, which structures were worked and the day's photos. It shows the latest report day if nothing has come in yet today.

## 8. Reports, comments and memos
- **Generate report** builds the PDF; download it as PDF or Word, or send it by WhatsApp.
- In **Report files**, open a report and press **Open PDF** to read the original, or **Comment / send via WhatsApp**.
- **Messages & memo**: send Monitoring, Observation, Action needed or Follow-up messages, design an internal memo (PDF plus WhatsApp announcement) and see what was sent.
