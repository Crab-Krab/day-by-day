# Day by Day

A simple daily checklist that runs locally in your browser. Open **Day-by-Day.html** to use it. No account, installation, server, or internet connection is needed for the app itself.

## Download and use

1. Download [Day-by-Day.html from the latest release](https://github.com/Crab-Krab/day-by-day/releases/latest/download/Day-by-Day.html). For changes not yet released, use the [latest working HTML](https://github.com/Crab-Krab/day-by-day/raw/refs/heads/main/Day-by-Day.html).
2. Open **Day-by-Day.html** in Chrome, Edge, Firefox, or another modern browser.

Only the HTML file needs to be opened. The other files are for maintaining the app.

## Features

- Opens to today's checklist, with weekday navigation and a month calendar.
- Shows earlier unfinished one-time tasks on today’s page, with completion against the original date or an explicit Move to today action.
- One-time tasks or weekly routines on any combination of days, with Mon–Fri and Every day shortcuts.
- Optional task times, plus an All day option.
- Optional descriptions for details, multiline notes, and clickable web links, shown directly below each task. Longer descriptions have **Show more / Show less** controls; the arrows and checkbox stay anchored at the top of the task.
- Best-effort reminders 5, 15, 30, or 60 minutes before due; more than one interval can be selected. Newly entered tasks already past due do not immediately generate old alerts.
- A separate checkbox for each scheduled date, so completing a routine does not complete its future occurrences.
- Tasks default to due-time order, earliest first with all-day tasks last. Tasks sharing a due time sort alphabetically by name, ignoring capitalization; all-day tasks also sort alphabetically. Use the up/down arrows to move any task into a saved custom order. **Sort by due time** restores automatic sorting.
- Light and dark themes with an animated sun/moon button.
- Subtle heading fades and a gentle task-window animation; reduced-motion settings are respected. The interactive checklist stays stationary to avoid a suspected Edge rendering issue.
- Automatic local saving and JSON backup/restore, last-export status, and gentle backup nudges after 25 changes or a week with unexported changes.
- Keyboard focus returns to the saved task. Undo remains available above the checklist until the next data change, dismissal, or closing/reloading the tab; it has no short countdown.
- Follows the system theme until you choose a light/dark preference. Weekday names follow the browser locale; weeks still start Monday.

## Your data

Tasks, completion history, settings, and reminder history stay in the browser you use. They are not uploaded to GitHub. This repository contains the application and its tests, not your saved work checklist.

Use the same browser and HTML file location to return to your data. File-based storage behavior can vary by browser. Use **Back up tasks** before clearing browser data, changing browsers, moving the file, or replacing your working copy. **Restore backup** transfers a saved copy to another browser or device.

“Last backup exported” records when a download was initiated, not whether you saved the file successfully. The optional **Request storage protection** control appears only where the browser supports it; permission can be refused and clearing browser data can still remove tasks. Backups remain necessary.

## Current ordering and history behavior

Custom task order and the choice between custom/automatic sorting are shared across dates and Weekly routines. Changing a routine edits its definition for every scheduled date, including past dates. Deleting it removes the routine from all dates, and its completion history is not retained as an independent archive after reloading. Export a backup before changes when you need a historical copy. Independent ordering and historical routine versions require separate product decisions.

## Reminders

Keep the HTML file open and the computer awake. A closed file cannot send reminders, and sleeping or suspended browser tabs can delay them. The app catches up on missed reminders for tasks due within the previous 24 hours when it resumes. Completing a task suppresses its reminders.

In-app reminders work without notification permission. Desktop alerts are optional and depend on browser support, permission, and workplace policies; some browsers refuse them for local files. All times use the computer's local timezone.

Supported tabs cooperate through Web Locks to avoid both delivering the same reminder. Where browser/origin restrictions prevent this, delivery falls back to the existing best-effort model. A closed or sleeping app still cannot act as a guaranteed alarm.

## Making changes

The ready-to-use app is **Day-by-Day.html**. The editable source is in **src/**:

| File | Purpose |
| --- | --- |
| `src/index.html` | Page structure and forms |
| `src/styles.css` | Layout, colors, and responsive styling |
| `src/app.js` | Tasks, schedules, local saving, ordering, and reminders |
| `src/theme.js` | Saved light/dark preference |
| `scripts/build.mjs` | Combines the source into the standalone HTML |
| `tests/` | Schedule, migration, reminder, persistence, and runtime checks |
| `docs/USAGE.txt` | Detailed user guide |

Developers need Node.js 20 or newer to rebuild or run checks. There are no packages to install.

```sh
npm test
npm run build
```

Edit the source files, run the checks, rebuild, and include the updated **Day-by-Day.html** in the same commit. Preserve existing browser data when changing the stored task format, and keep the app usable offline without a server.

## A quick Git/GitHub guide

**Git** keeps a history of changes to files. A **repository** is the project folder and that history. A **commit** is a named checkpoint. **GitHub** stores the repository online so you can return to earlier versions and continue developing the app.

The repository and its downloads are public, so downloading the app does not require signing in. Your saved tasks and descriptions stay in your browser; they are not part of this repository. Downloading the app does not publish a website or sync your tasks.
