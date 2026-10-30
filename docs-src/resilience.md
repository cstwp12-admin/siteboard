---
title: Backup, mobile & offline
nav_order: 8
---
# Backup, mobile & offline

## Back up before changing browsers or devices

In **Settings → Backup & restore**, choose **Download backup**. The JSON contains all browser workspaces, their complete issued registers, memo counters, project setup, reporting rules, observations, preferences and your profile. Store it somewhere safe. It may include personnel names and memo text.

Separately copy the reports folder, including `_SiteBoard/Issued`, and any imported KMZ/KML. The JSON contains no PDFs, photo cache, folder permissions or imported KMZ file. Browser storage can be cleared by the browser; installation does not replace a backup.

## Restore without replacing current work

Choose a SiteBoard backup JSON. Review workspace names and register counts, then choose **Restore as separate workspaces**. Your profile stays as it is unless you tick the profile option. SiteBoard downloads a recovery backup before saving, preserves existing workspaces, and rolls back a failed save. Reload, select a restored workspace, and reconnect its reports folder. Restore the separate issued-files folder as needed.

Memo counters are preserved exactly. A restored workspace is a historical copy: keep one authoritative workspace for issuing new memo numbers to avoid duplicate numbers from parallel copies. Shared-folder settings can merge when you reconnect; review project settings and numbering before issuing.

## Install SiteBoard

Open the HTTPS site online and let the app shell finish downloading. If supported, choose **Install SiteBoard** in the status bar or your browser's install menu. On iPhone/iPad use Safari's Share → Add to Home Screen. Installation availability depends on the browser. Desktop remains recommended for folder management and report preparation; on phones, select files using the file picker when direct folder access is unavailable.

## What works offline

The cached shell includes code, styles, export libraries, icons and documentation. Previously parsed reports and thumbnails may remain in this browser. Full photos, original PDFs and issued files need access to their source files. Online map tiles and external fonts are separate; system fonts remain available. Initial installation and updates need a connection.

When a new version has downloaded, choose **Update & reload** after finishing or saving current work. Existing settings retain their storage names. New workers wait for your choice before replacing an already controlled session. If installation/cache storage is unavailable, normal online use continues.

## Release uploads

Upload one complete tested release at a time. You can skip intermediate local releases and upload the latest complete package. Keep the previous ZIP and take a settings backup first. Avoid mixing versions. The new worker installs only if all listed assets can be fetched; a partial upload may delay the update. After deployment, open the site online, wait for the update prompt if present, reload, check the displayed version and verify a known report and export.
