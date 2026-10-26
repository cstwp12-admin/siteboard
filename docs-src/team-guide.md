---
title: Team guide
nav_order: 2
---
# Team guide

One page for everyone who uses the dashboard.

## 1. Who does what

- **IOWs** make the Site Daily Photo Report in the SDR app every working day and send the PDF to the report admin.
- **REs and AREs** report as required.
- **Report admin** (the RE or an ARE assigned to the task) receives the PDFs and saves each one into the reports folder on his or her own computer. Nobody changes the files once saved.
- Each person who wants to use SiteBoard needs the report PDFs in a folder on his or her own computer. A shared Google Drive folder is planned for later; until then reports are passed on by the report admin.

## 2. Filing rules

- Keep the file name exactly as the SDR app creates it, e.g. `WP12-CST-MAT-20261016-1_SDR.pdf`. Never rename or edit the PDF.
- Save into the current month folder, e.g. `2026-10`. If unsure, drop the file anywhere in your reports folder and press **Tidy folder** in *Report files*.
- A corrected report is generated again in the app, with the next number (`-2`). The old file stays.
- Folders starting with `_` or `.` are ignored by the dashboard.

## 3. Opening the dashboard (every team member)

- Use **Chrome, Edge or Brave on a computer**. Phones can view but cannot connect a folder. In **Brave**, first open `brave://flags/#file-system-access-api`, set it to *Enabled* and relaunch (Brave turns folder access off by default).
- Keep the SDR PDFs in one folder on your computer (month sub-folders are fine).
- Open the SiteBoard link and press **Connect reports folder**. Choose that folder and press **Allow**.
- Keep the tab open: it checks the folder every 20 seconds. Next time, press **Reconnect folder** once.

## 4. Daily routine for the report admin (RE or ARE)

- Check **Overview** and **Submissions** for days with no report. If no report was needed (office work, leave, off site), click the red ✕ and mark it *no report needed*; it is then left out of the compliance count.
- Use **Reminder message** (Submissions) to remind IOWs on WhatsApp, or **Share / save matrix…** to send the matrix picture with a description.
- Review **Observations**: set each to Open, Monitoring or Closed and add a note.
- At week end and month end use **Generate report**.

## 5. Sharing settings with the team
Project details, who must report daily, non-working days and observation follow-up are stored in your browser. In *Settings* press **Save settings to folder**; the file `siteboard-settings.json` is written into your reports folder. Give a copy of that file to a teammate (put it in the root of his or her reports folder) and it is read automatically.

## 6. If something looks wrong

- Open *Report files*: it lists files that could not be read, mismatches and duplicates.
- A report shows “not received” but was sent? Check that the PDF is in your reports folder and press **Rescan**.
- Reports made by SDR v1.2.6 or later carry exact data inside the PDF; older ones are read from the page layout and may need a check.

## 7. Photos and structures
- **Photos** shows every photo. Filter by date, reporter, activity, structure, zone, chainage or text. Click a photo to enlarge it; use the arrow keys to move on. *Prepare all thumbnails* makes the gallery load instantly next time.
- **Structures** lists the bridges, culverts, junction culverts and RS walls with the last record, status and photos. See [Structures and photos](structures).

## 8. Map and map statistics
- Load the project KMZ/KML once in **Map**. It is kept in this browser for the current workspace.
- Choose the reporting period at the top. Type a from/to chainage or press **Drag range on map** and drag along the alignment.
- Turn on **100 m coverage** to see which sections have photographed items. Red rings identify GPS points more than 250 m from the chainage written in the report.
- Use **Map statistics…** for a shareable PNG/PDF card, or export the filtered pins to KML/GeoJSON for Google Earth or QGIS.
- **Share matrix + map…** combines the current submission matrix and map in one image.

## 9. Today view
Open *Today* first thing: who has reported, what was done, which structures were worked and the day's photos. It shows the latest report day if nothing has come in yet today.

## 10. Reports, comments and memos
- **Generate report** builds the PDF; download it as PDF or Word, or send it by WhatsApp.
- In **Report files**, open a report and press **Open PDF** to read the original, or **Comment / send via WhatsApp**.
- **Messages & memo**: send Monitoring, Observation, Action needed or Follow-up messages, design an internal memo (PDF plus WhatsApp announcement) and see what was sent.
