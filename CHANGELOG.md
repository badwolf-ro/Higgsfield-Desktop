# Changelog

## 2.2.1

### Fixed

- **Google sign-in "Permission denied" error.** After the browser window closed, the app deleted its temporary sign-in profile before the browser had released the folder, which failed with `EPERM` and aborted the sign-in. The login is now taken over first, and clearing that profile is best-effort, so a locked folder no longer stops you signing in.

## 2.2.0

### New

- **Continue with Google.** Google does not allow signing in inside apps, so Continue with Google now runs in a separate Chrome or Edge window, with a fresh profile of its own.
  - Once you have signed in there and closed the window, the app takes over the Higgsfield login and the separate profile is deleted.
  - Only Higgsfield's login cookies are copied. Nothing of Google's is.
  - This is a stand-in until Higgsfield offers an official sign-in for desktop apps.

## 2.1.0

### New

- **Section buttons.** Image, Video and Cinema Studio buttons sit at the left of the toolbar.
  - Clicking one goes to a tab already showing that section, or opens one.
  - Ctrl+click or middle-click always opens a new tab.
  - The **▾** next to them picks any of Higgsfield's ten sections.
  - When the toolbar runs out of room, the buttons show only their icons.
- **Download finished generations.** A new option in **Settings → Downloads**, off by default.
  - When on, each image or video you generate in the app is saved to its tab's folder as soon as it is ready.
  - Failed and cancelled generations are never saved.

### Changed

- **Save without asking.** This is the new name for "Save downloads automatically". It only decides whether Higgsfield's Download button shows a Save dialog.
- **Saving workspaces.** You now save a workspace only from the toolbar's **Workspace ▾** or the **Workspaces** menu. **Settings → Workspaces** lists them to load, rename or delete.
- **Narrow panels.** They always keep the desktop layout from 1024 px down. The minimum page width setting is gone.
- **Removed from Settings and menus:**
  - the second Save form in Settings
  - reordering workspaces
  - the "Load workspace 1–9" hotkeys
  - the list of open tabs in the Tabs menu

### Fixed

- Links to Higgsfield's image server (`images.higgs.ai`) opened the home page instead of the image.
- When you recorded a new show/hide shortcut, the app never checked whether another program already uses it.

### Under the hood

- **Fewer duplicates.** Higgsfield's addresses and the login session are defined once, and one helper reads and writes all the app's files.
- **Less wasted work:**
  - Your layout is not rewritten when nothing changed.
  - The menu bar is not rebuilt on every page change.
  - Back/Forward state is remembered per tab.
  - Zoom is only re-applied when it changes.
- **Cleanup.** Code left over from earlier designs is gone.

## 2.0.0

The first release of the desktop app:

- dockable tabs, with the desktop layout kept in narrow panels and zoom per tab
- saved workspaces and a layout lock
- Cinema Studio projects recognised automatically, with a download folder for each
- generation-finished alerts and a running count
- close to tray, and a show/hide shortcut that works from any app
- a hotkey editor
- Clear Cache, and Clear All Data and Sign Out
