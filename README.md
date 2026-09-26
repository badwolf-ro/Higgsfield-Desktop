# Higgsfield Desktop

A Windows desktop app for [higgsfield.ai](https://higgsfield.ai). It runs the real Higgsfield website in its own window, with a few desktop features on top:

- toolbar buttons for the sections you use most (Image, Video, Cinema Studio, …)
- tabs you can dock side by side
- saved workspaces
- Cinema Studio project folders for your downloads
- alerts when a generation finishes, and an optional auto-download of finished generations
- a tray icon
- configurable hotkeys

The site itself is untouched: you use Higgsfield exactly as in a browser.

> This is an unofficial wrapper. It is not made by or affiliated with Higgsfield. Your account, credits, projects and generations stay on higgsfield.ai; the app only displays the site.

## Install

There are two builds of the app:

| File | What it does |
|---|---|
| `Higgsfield Setup <version>.exe` | Installs for your Windows user and adds Desktop and Start Menu shortcuts. No admin rights needed. |
| `Higgsfield-Portable-<version>.exe` | Runs without installing. |

Download one from the repository's **Releases** page when a release is published, or build both yourself with `npm run dist` (see [Development](#development)). A build puts them in `dist\`.

The app is not code-signed, so the first time you run it Windows SmartScreen shows "Windows protected your PC". Click **More info → Run anyway**.

Your login is kept between launches. What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## The window

- **Toolbar.** One thin toolbar, left to right:
  - buttons for your main sections (Image, Video and Cinema Studio to start with)
  - the Cinema Studio project you are in, if any
  - how many generations are running
  - the last file you saved
  - **Workspace ▾**
  - a padlock that locks the layout
- **Tab bar.** Below the toolbar. Each group of tabs has its own Back, Forward and Reload buttons.
- **The site.** Everything else is Higgsfield.
- **Menus.** The menu bar has five menus: File, Edit, View, Tabs and Workspaces.

## Features

### Section buttons

The buttons at the left of the toolbar take you to the parts of Higgsfield you use most.

- **Click** a button to go to a tab that is already showing that section, or to open one.
- **Ctrl+click** or middle-click it to always open a new tab.
- **Choose which buttons appear** with the **▾** next to them. Tick any of Higgsfield's sections: Explore, Image, Video, Audio, Cinema Studio, Canvas, Supercomputer, Effects, Marketing Studio and Community. They keep the site's order.
- **Narrow window.** When the toolbar runs out of room, the buttons show only their icons. Hover over one to see its name.

### Tabs and docking

- **Open a tab.** Use **Ctrl+T** or **+** for a new tab. The **▾** next to **+**, or **Tabs → Open in New Tab**, opens a section directly (Image, Video, Cinema Studio, Canvas, …).
- **Dock a tab.** Drag a tab by its title:
  - Drop it on the edge of a panel to split the view, for example Image on the left and Video on the right.
  - Drop it on another tab bar to join that group.

  Pages never reload when you move them, so work in progress is safe.
- **Split with a shortcut.** **Ctrl+Alt+→** moves the current tab to a new split on the right; **Ctrl+Alt+↓** moves it below.
- **Right-click a tab** for Duplicate, Split, Close Others and Close to the Right.
- **Closing and reopening.** Middle-click a tab to close it; **Ctrl+Shift+T** brings it back.
- **Links.** Higgsfield links that would open a new window open as a new tab instead.
- **Layout is remembered.** Your tabs and splits are restored the next time you start the app.

### The desktop layout in every panel

When you split the window, each panel gets narrower, and Higgsfield would normally switch to its cramped small-screen layout. The app prevents that: a panel narrower than 1024 px shows the full desktop page, scaled down to fit. The scale shows as a small percentage chip in the panel's tab bar.

- **Zoom one tab.** **Ctrl+=**, **Ctrl+-**, **Ctrl+0** or Ctrl+mouse wheel. It never affects other tabs.
- **Settings.** Turn this off in **Settings → General**.

### Workspaces

A workspace is a named snapshot of your tabs and splits, like Layouts in Unity or layout presets in DaVinci Resolve.

- **Save.** **Workspaces → Save Workspace…** (or **Workspace ▾ → Save Workspace…** in the toolbar), then give it a name.
- **Load.** Pick a workspace from the same menu. It replaces your current tabs with the saved ones.
- **Manage.** Rename or delete workspaces in **Settings → Workspaces**.
- **Lock Layout.** The padlock stops tabs being dragged by accident.
- **Reset Layout.** Starts over with one tab.

### Cinema Studio projects and downloads

- **The Download button.** When you press Download on Higgsfield, the file is saved straight to `Downloads\Higgsfield`, with no Save dialog. A file never replaces an older one: a second `image.png` becomes `image (1).png`. The app never downloads anything on its own unless you turn on **Download finished generations** (below).
- **Project folders.** When a tab is inside a **Cinema Studio project**, files you download from that tab go into a folder named after the project, for example `Downloads\Higgsfield\Nike spot\`. The app recognises the project on its own; there is nothing to set up.
- **Project chip.** When the current tab is in a project, the toolbar shows the project's name. Click it to:
  - open the project's folder
  - rename the folder
  - jump to a recent project
- **Settings → Downloads.** Here you can:
  - change the main download folder, or have the Download button ask where to save each file
  - turn on **Download finished generations**. It is off by default because it saves every result, including the ones you would throw away. When on, each image or video you generate in the app is saved to its tab's folder as soon as it is ready. Failed generations are never saved.
  - see every Cinema Studio project the app has picked up
  - give a project a different folder, rename it, or forget it

  Forgetting a project never deletes anything on Higgsfield or on your disk.
- **Saved notice.** A small notice appears when a file is saved. Its **Show in folder** button opens the file's location.
- **Right-click an image or video.**
  - **Save Image** saves it to the right folder.
  - **Save Image As…** lets you choose where to save it.

### Generation alerts

When an image or video generation finishes, you get a Windows notification and the taskbar button flashes. This happens if the app is in the background, minimised, in the tray, or showing a different tab.

- **Click to return.** Clicking the notification brings you back to the tab that started it.
- **Failures.** Failed or blocked generations are reported too. Generations you cancel are not.
- **Running count.** The toolbar shows how many generations are running.
- **Settings.** Both alerts can be turned off in **Settings → General**.

Higgsfield itself does not raise notifications for image or video jobs. The app watches the same live job-status updates the site receives. It only reads that traffic, on your machine, and never sends anything anywhere.

### Tray

- **Closing keeps it running.** Closing the window keeps Higgsfield running in the system tray, so long renders finish and alerts still arrive.
- **Tray icon.** Click it to show or hide the window. Right-click it for **Quit Higgsfield**.
- **Turn it off.** Change this in **Settings → General**.

### Hotkeys

**File → Hotkeys…** lists every shortcut.

- **Change a shortcut.** Click **Change** and press the new combination.
  - **Esc** cancels.
  - **Backspace** removes the shortcut.
- **Mistakes are caught.** The app warns you if a shortcut is already used, would interfere with typing, or is taken by another program.

| Action | Default |
|---|---|
| New tab / close tab / reopen closed tab | Ctrl+T / Ctrl+W / Ctrl+Shift+T |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Split right / split down | Ctrl+Alt+→ / Ctrl+Alt+↓ |
| Back / forward | Alt+← / Alt+→ (or the mouse side buttons) |
| Reload / reload without cache | F5 / Ctrl+F5 |
| Home | Alt+Home |
| Zoom in / out / reset (this tab) | Ctrl+= / Ctrl+- / Ctrl+0 |
| Full screen | F11 |
| Developer tools for this tab | Ctrl+Shift+I |
| Open downloads folder | Ctrl+J |
| Settings | Ctrl+, |
| Clear cache | Ctrl+Shift+Delete |
| **Show or hide Higgsfield (from any app)** | **Ctrl+Alt+H** |

Opening a section in a new tab, saving a workspace, locking the layout and opening the Hotkeys page have no shortcut by default. You can add one for each.

### Clearing the cache

- **File → Clear Cache** removes cached files and reloads every tab. You stay signed in. Use this when the site looks broken or out of date.
- **File → Clear All Data and Sign Out…** removes everything the app stores for the site, including your login, after asking you to confirm.

### Signing in, links and payments

- **Inside the app.** Signing in (Google, Apple, Microsoft, Discord, email) and checkout pages open inside the app, so the session comes back to Higgsfield.
- **In your browser.** Links to other sites, such as Instagram, X or a Discord invite, open in your normal browser.
- **Google sign-in.** The app identifies itself as regular Chrome, because Google blocks sign-in from embedded browsers that identify themselves as Electron. If Google still refuses, sign in with email instead.

## Where your data lives

Everything is in `%APPDATA%\Higgsfield`:

| File | Contents |
|---|---|
| `settings.json` | Settings and hotkeys |
| `layout.json` | Your current tabs and splits |
| `workspaces.json` | Saved workspaces |
| `projects.json` | Cinema Studio projects the app has seen, and their folders |
| `window-state.json` | Window size and position |
| `Partitions\higgsfield\` | The site's cookies, login and cache |

Deleting the folder resets the app completely.

## Development

Requires Node.js 20+ on Windows.

```bat
npm install
npx install-electron   :: Electron 44 downloads its binary on first use; this fetches it now
npm start              :: run from source
npm run dist           :: build the installer and portable exe into dist\
```

To run with a separate, clean profile (for example next to your everyday app), set `HIGGSFIELD_PROFILE` to a folder first:

```bat
set HIGGSFIELD_PROFILE=%TEMP%\hf-test
npm start
```

### How it is put together

```
main.js                     Entry point: windows, IPC, link rules, context menu, wiring
src/main/settings.js        Settings store (settings.json)
src/main/store.js           Reading and writing the JSON files in the profile folder
src/main/hotkeys.js         App shortcuts (before-input-event on every tab) and the global shortcut
src/main/downloads.js       Where each download goes, Save without asking, unique file names, taskbar progress
src/main/projects.js        Cinema Studio project detection and project folders
src/main/workspaces.js      Saved workspaces
src/main/viewport.js        Per-tab desktop-width layout and zoom (CDP device-metrics emulation)
src/main/notify.js          Generation-finished detection, Windows notifications, finished files for auto-download
src/main/cdp.js             One DevTools Protocol session per tab, shared by the two above
src/main/tray.js            Tray icon and close-to-tray
src/main/menu.js            Menu bar
src/shared/actions.js       Which addresses are Higgsfield, its sections, every action and its default shortcut
src/shared/keys.js          Shortcut parsing, display and validation (main + pages)
src/renderer/shell/         Toolbar (section buttons, project chip, workspaces), tabs and docking (dockview-core, one <webview> per tab)
src/renderer/settings/      Settings window
src/preload/                Bridges between those pages and the main process
build/icon.png              App icon
```

- **Tabs.** Each tab is a `<webview>`. All tabs share the `persist:higgsfield` session, so they share one login.
- **Docking.** Tabs use dockview's `renderer: 'always'` mode, which repositions a webview instead of moving it in the page, so dragging a tab never reloads it.
- **Zoom.** Chromium zoom is shared by every tab on the same site, so per-tab zoom and the desktop layout in narrow panels use `Emulation.setDeviceMetricsOverride` on each tab instead. Clicks and scrolling map through it correctly.
- **Generation alerts.** They come from Higgsfield's job-status event stream (`fnf-notification/notifications/stream`, event `job:status_changed`) and its `jobs/status-batch` poll. The app applies the site's own rule for "finished": `completed` once the IP check is done; `failed`, `nsfw`, `ip_detected`.
- **Download finished generations.** When a job the app saw start finishes as `completed`, the app saves its full-size file (`results.raw.url`, the same file the site's Download button fetches) through the tab that started it, so it lands in that tab's folder.
- **Download button.** The site fetches the file and saves it as a normal browser download. The app decides where it goes from the tab it came from.
- **Cinema Studio projects.** They are recognised from the tab's address: `/generate?projectId=<id>` or `/generate/@user/<project>`.

## License

[MIT](LICENSE). "Higgsfield" and the Higgsfield logo belong to Higgsfield; this project is an independent wrapper and is not affiliated with or endorsed by them.
