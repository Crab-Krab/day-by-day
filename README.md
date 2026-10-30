# Day by Day

A daily checklist with weekly routines, a calendar, and reminders—all in one HTML file. Open it locally in Chrome, Edge, Firefox, or another modern browser. No account, installation, server, or internet connection is needed to use the app.

**[Download Day-by-Day.html](https://github.com/Crab-Krab/day-by-day/releases/latest/download/Day-by-Day.html)** · [User guide](docs/USAGE.txt) · [Release notes](https://github.com/Crab-Krab/day-by-day/releases)

## Get started

1. Download the HTML file and save it in a folder you plan to keep using.
2. Double-click it to open it in your browser. You only need this file; source-code downloads are for development.
3. Select **+ Add task**, enter a task, and choose **One time** or **Every week**. Weekly tasks can repeat on multiple days, with **Mon–Fri** and **Every day** shortcuts.

The app opens to today. Select another day from the week strip or month calendar, and use the pencil beside a task to edit it.

## What it does

- **Plan your day:** All-day tasks or specific due times, with optional descriptions, notes, and clickable web links.
- **Repeat weekly:** Each scheduled date gets its own checkbox. Completing a routine today leaves future occurrences unchecked.
- **Arrange your list:** Due times sort earliest first, alphabetical ties follow, and all-day tasks come last. Arrows let you rearrange tasks. Custom order repeats on that weekday; other weekdays and the routine catalog remain independent.
- **Keep routine history:** Choose when edits take effect, end a routine without removing its history, or skip and restore one occurrence. Routine-edit Undo restores replaced future changes.
- **Choose your appearance:** Light/dark themes follow your system until you choose a preference. Subtle animations respect reduced-motion settings.
- **Save locally:** Automatic browser saving, JSON backup/restore, last-export status, and backup notices.

Calendar weeks start Monday. Dates and times use your computer's local timezone. Confirmations and Undo banners dismiss after 10 seconds, pausing while hovered, keyboard-focused, or the tab is hidden. The next data change also ends Undo.

## Overdue tasks

**Overdue** appears above today's checklist. Unfinished timed tasks—including routines—move there after their due time. Earlier unfinished one-time tasks also appear there; missed routine occurrences from earlier dates do not carry forward. Today's all-day tasks stay in the checklist.

Complete an earlier task on its original date, or choose **Move to today** to change its date. Lists refresh as time passes, and each task appears in one section at a time.

## Your data and updates

Your tasks and history stay in your browser; they are not uploaded to GitHub or synced between devices. Keep using the **same browser and file location**. Clearing browser data, changing browsers, or moving the file can make tasks unavailable. Avoid private/incognito windows for saved tasks.

Before updating:

1. Use **Back up tasks** in your current copy and check that the JSON file downloaded.
2. Download the latest HTML and replace your working file in the same location.
3. Open it in the same browser. Use **Restore backup** if needed; restoring replaces the current tasks and completion history.

**Compatibility:** The current app writes saved-data format 5 and accepts formats 1–5. Versions before v1.2.0 cannot read format 5. Previously removed history cannot be reconstructed.

If tasks fail to load, **Download original saved data** in the warning exports the untouched stored text for recovery. Backup avoids exporting an empty fallback session as a normal backup; unsaved session tasks export separately. See the [user guide](docs/USAGE.txt) for recovery details.

“Last backup exported” means a download was initiated, not that the file was saved successfully. Optional browser storage protection does not replace backups or prevent deliberate data clearing.

## Reminders

For timed tasks, select one or more reminders **5, 15, 30, or 60 minutes before due**. Leave them unchecked for no reminder.

Keep the file open and your computer awake. Reminders are **best effort**: background or suspended tabs can delay them, and a closed app cannot send alerts. On resuming, the app can catch up on reminders for tasks due within the last 24 hours. Newly entered past-due tasks do not immediately generate old alerts.

In-app reminders need no notification permission and have no action-confirmation timeout. Desktop alerts depend on browser support and workplace policies. Completing a task suppresses its reminders.

**Known Edge issue:** The checklist has intermittently stopped accepting clicks or focus. Resizing the window or opening **Add task** may restore it; a long-term resolution has not been confirmed.

## Development

Use **Node.js 20 or newer**. There are no packages to install.

| Path | Purpose |
| --- | --- |
| `src/` | Editable HTML, CSS, app logic, and theme handling |
| `scripts/build.mjs` | Builds the standalone HTML |
| `tests/` | Scheduling, history/migration, theme, and runtime checks |
| `docs/USAGE.txt` | Detailed user guide |
| `Day-by-Day.html` | Ready-to-use app generated from the source |

Run checks, then rebuild:

```sh
node tests/schedule.test.cjs
node tests/runtime.test.cjs
node tests/theme.test.cjs
node tests/history.test.cjs
node scripts/build.mjs
```

Edit `src/`, preserve existing saved data, and commit the rebuilt HTML alongside code changes. Automated checks do not replace testing the local file in real browsers.

For changes not yet released, download the [latest working HTML](https://github.com/Crab-Krab/day-by-day/raw/refs/heads/main/Day-by-Day.html).
