# Day by Day

A daily checklist with weekly routines, a calendar, and reminders, all in one HTML file. Open it locally in Chrome, Edge, Firefox, or another modern browser. No account, installation, server, or internet connection is needed to use the app.

**[Download Day-by-Day.html](https://github.com/Crab-Krab/day-by-day/releases/latest/download/Day-by-Day.html)** · [User guide](docs/USAGE.txt) · [File autosave setup](docs/FILE-AUTOSAVE.md) · [Release notes](https://github.com/Crab-Krab/day-by-day/releases)

## Get started

1. Download the HTML file and save it in a folder you plan to keep using.
2. Double-click it to open it in your browser. You only need this file; source-code downloads are for development.
3. Select **+ Add task**, enter a task, and choose **One time** or **Every week**. Choose **More options** for notes, a due time, or reminders. Weekly tasks can repeat on multiple days, with **Mon–Fri** and **Every day** shortcuts.

The app opens to today. Select another day from the week strip, the month calendar (arrow keys work there too), or **Go to date**, and use the pencil beside a task to edit it.

## What it does

- **Plan your day:** All-day tasks or specific due times, with optional descriptions, notes, and clickable web links.
- **Repeat weekly:** Each scheduled date gets its own checkbox. Completing a routine today leaves future occurrences unchecked.
- **Arrange your list:** Due times sort earliest first, alphabetical ties follow, and all-day tasks come last. Arrows beside each task rearrange it, and **More** holds Skip and reminder details when a task has them. Custom order repeats on that weekday; other weekdays and the routine catalog remain independent.
- **Keep routine history:** Choose when edits take effect, end a routine without removing its history, or skip and restore one occurrence. Routine-edit Undo restores replaced future changes.
- **Keep the list focused:** Collapse **Completed** to hide finished tasks; its count and your progress remain visible.
- **Choose your appearance:** Light/dark themes follow your system until you choose a preference. Subtle animations respect reduced-motion settings.
- **Recovery copies:** Optional in desktop Chrome/Edge. Up to 20 earlier versions of your tasks in a folder you choose, saved hourly and before risky changes, with one-click restore.
- **Save locally:** Automatic saving to a selected JSON file in desktop Chrome/Edge, remembered-file reopening, browser saving, and separate JSON backups.

Calendar weeks start Monday. Dates and times use your computer's local timezone. Confirmations and Undo banners dismiss after 10 seconds, pausing while hovered, keyboard-focused, or the tab is hidden. The next data change also ends Undo.

## Overdue tasks

**Overdue** appears above today's checklist. Unfinished timed tasks—including routines—move there after their due time. Earlier unfinished one-time tasks also appear there; missed routine occurrences from earlier dates do not carry forward. Today's all-day tasks stay in the checklist.

Complete an earlier task on its original date, or choose **Move to today** to change its date. Lists refresh as time passes, and each task appears in one section at a time.

An unfinished timed task that becomes overdue **today** offers **Move to tomorrow**. It keeps its due time, notes, and reminder settings, disappears from today's list, and appears unchecked tomorrow. You stay on today's page and can Undo the move. For weekly routines, only today's occurrence moves as a separate one-time task; future repeats keep their schedule. If the routine already repeats tomorrow, both occurrences remain independently checkable. The moved task shows a **Moved from** link to its original date, and the original date shows a **Moved to** link instead of a Restore that would put it on both days.

## Your data

Your tasks and history stay on your computer. They are not uploaded anywhere or synced between devices. In desktop **Chrome or Edge**, choose **Manage**, then **Create new task file**, and choose a folder, such as a **Day by Day** folder inside Documents. Chrome and Edge won't accept Documents, Desktop or Downloads themselves, so make a folder inside one. The app saves your tasks there as `Day-by-Day-tasks.json`, and changes save automatically. Wait for **Saved to [filename]** before closing. If that folder already has a task file, the app opens it instead of replacing it. To use a task file kept elsewhere, choose **Open task file**.

Saving shows as one compact status row. Choose **Manage** to see the task file, browser copy and backups, and recovery copies together. Setup and saving errors expand the details automatically.

The app automatically reopens its remembered file when the browser keeps access. Otherwise, click **Reconnect task file**. If daily browser cleanup erases the connection, click **Open task file** and select the same JSON again; the JSON itself stays on disk. A plain HTML file cannot silently rediscover files after access is forgotten. See [file autosave setup and recovery](docs/FILE-AUTOSAVE.md).

Without file autosave, tasks stay only in browser storage. Keep using the **same browser and file location**. Clearing browser data, changing browsers, or moving the HTML can make that copy unavailable. Avoid private/incognito windows. If the browser cannot save a change, choose **Retry saving**, or the app retries with each later change. It asks before you close the tab with unsaved changes. If another tab saves different tasks meanwhile, the app asks which copy to keep.

If saved tasks can't be loaded, the warning offers **Download original saved data**, which exports the stored data unchanged so nothing is lost. See the [user guide](docs/USAGE.txt) for recovery details.

“Last backup exported” means a download was initiated, not that the file was saved successfully. Optional browser storage protection does not replace backups or prevent deliberate data clearing.

## Privacy and safety

The app never connects to the internet, and the HTML includes a Content Security Policy, a browser rule that enforces this: the page can run only its own built-in code and can't load or send anything. One limit comes from how browsers treat local files. In Chrome and Edge, every HTML file you open from your own computer shares the same browser storage, so another local HTML file could read the tasks saved in this browser. Only open local HTML files you trust. A connected task file is not affected, since it needs your permission.

## Updating to a new version

1. Use **Back up tasks** in your current copy and check that the JSON file downloaded.
2. Download the latest HTML and replace your working file in the same location.
3. Open it in the same browser. Use **Open task file** to reconnect your autosave JSON if needed. **Restore backup** replaces current tasks and completion history, including the connected autosave file.

**Compatibility:** The current app writes saved-data format 5 and accepts formats 1–5. Versions before v1.2.0 cannot read format 5. Previously removed history cannot be reconstructed.

## Reminders

For timed tasks, select one or more reminders **5, 15, 30, or 60 minutes before due**. Leave them unchecked for no reminder.

Keep the file open and your computer awake. Reminders are **best effort**: background or suspended tabs can delay them, and a closed app cannot send alerts. On resuming, the app can catch up on reminders for tasks due within the last 24 hours. Newly entered past-due tasks do not immediately generate old alerts.

In-app reminders need no notification permission and have no action-confirmation timeout. Desktop alerts depend on browser support and workplace policies. Completing a task suppresses its reminders.

**Known Edge issue:** In Edge, the checklist has occasionally stopped responding to clicks. Recent versions fix likely causes, but this isn't confirmed. If it happens, resizing the window or opening **Add task** may restore it. Please [report it](https://github.com/Crab-Krab/day-by-day/issues) with your Edge version and what you were doing.

## Development

Use **Node.js 22 or newer**. There are no packages to install.

| Path | Purpose |
| --- | --- |
| `src/` | Editable HTML, CSS, app logic, and theme handling. `schedule.js` holds the scheduling, history, reminder, and validation logic that the tests load directly |
| `scripts/build.mjs` | Builds the standalone HTML and its checksums |
| `scripts/release-files.mjs` | Prepares the files attached to a GitHub release |
| `scripts/preview.mjs` | Serves the app and browser checks on this computer |
| `scripts/screenshots.mjs` | Takes review screenshots of the built app with sample tasks, at seven widths in light and dark |
| `docs/TESTING.md` | Browser checks and the manual checklist before a release |
| `tests/` | Scheduling, history/migration, theme, runtime, interface, and file-storage checks. `helpers/runtime.cjs` is the shared simulated browser, `fixtures/sample-tasks.json` is a sample task file using every saved feature, and `browser.html` and `ui-browser.html` run in real browsers |
| `.github/workflows/` | Automated checks on every pull request and on `main`, real-browser checks in Chrome and Edge, and the release publisher |
| `docs/USAGE.txt` | Detailed user guide |
| `Day-by-Day.html` | Ready-to-use app generated from the source |

Run checks, then rebuild:

```sh
npm test
npm run build
```

The build writes `Day-by-Day.html` and refreshes `SHA256SUMS.txt`. It stops with an error if `src/index.html` no longer contains a tag it needs to inline. Edit `src/`, preserve existing saved data, and commit the rebuilt HTML and checksums alongside code changes.

For checks in a real browser, run `npm run preview` and follow [docs/TESTING.md](docs/TESTING.md), which also has the manual checklist to use before a release. GitHub Actions runs the tests on every pull request and on `main`, rebuilds, and fails if the committed HTML or checksums differ from the source. Automated checks do not replace testing the local file in real browsers. The same guide explains the optional interface browser tests, which GitHub runs in Chrome and Edge.

To publish a release, set the version in `package.json`, add its `CHANGELOG.md` section and `docs/releases/vX.Y.Z.md` notes, and merge to `main`. Then open **Actions**, choose **Release**, and select **Run workflow** with the version. Leave **Dry run** on the first time to check everything without publishing. The workflow repeats the checks, runs the browser checks in Chrome, creates the tag, and attaches the HTML, guides, license, and checksums.

The main download link always serves the latest release. To try changes that are not released yet, download the [unreleased working HTML](https://github.com/Crab-Krab/day-by-day/raw/refs/heads/main/Day-by-Day.html) from `main`.

## License

Day by Day is licensed under the [MIT License](LICENSE). Copyright (c) 2026 Crab-Krab. The full license is also embedded in the standalone HTML so it stays with downloaded copies. Preserve the copyright and license notice when redistributing the app.
