# Day by Day

A simple daily checklist that runs locally in your browser. Open **Day-by-Day.html** to use it. No account, installation, server, or internet connection is needed for the app itself.

## Download and use

1. Download [Day-by-Day.html from the latest release](https://github.com/Crab-Krab/day-by-day/releases/latest/download/Day-by-Day.html). For changes not yet released, use the [latest working HTML](https://github.com/Crab-Krab/day-by-day/raw/refs/heads/main/Day-by-Day.html).
2. Open **Day-by-Day.html** in Chrome, Edge, Firefox, or another modern browser.

Only the HTML file needs to be opened. The other files are for maintaining the app.

## Features

- Opens to today's checklist, with weekday navigation and a month calendar.
- Shows **Overdue** above today’s checklist: unfinished timed tasks (one-time or recurring) move there after their due time, alongside unfinished one-time tasks from earlier dates. Today’s all-day tasks stay in the checklist. Earlier tasks retain their original completion date, with an explicit Move to today action.
- One-time tasks or weekly routines on any combination of days, with Mon–Fri and Every day shortcuts.
- Optional task times, plus an All day option.
- Optional descriptions for details, multiline notes, and clickable web links, shown directly below each task. Longer descriptions have **Show more / Show less** controls; the arrows and checkbox stay anchored at the top of the task.
- Best-effort reminders 5, 15, 30, or 60 minutes before due; more than one interval can be selected. Newly entered tasks already past due do not immediately generate old alerts.
- A separate checkbox for each scheduled date, so completing a routine does not complete its future occurrences.
- Tasks default to due-time order, earliest first with all-day tasks last. Equal times and all-day tasks sort alphabetically. Custom orders are saved separately for each weekday and repeat in future weeks. **Sort by due time** resets only that weekday. The Weekly routines catalog has its own independent ordering.
- Routine edits have a **changes-from date**. Earlier days and completed occurrences retain their saved titles, notes, times, and schedules. **End routine** keeps historical occurrences; **Skip this occurrence** affects one date and can be restored.
- Light and dark themes with an animated sun/moon button.
- Subtle heading fades and a gentle task-window animation; reduced-motion settings are respected. The interactive checklist stays stationary to avoid a suspected Edge rendering issue.
- Automatic local saving and JSON backup/restore, last-export status, and gentle backup nudges after 25 changes or a week with unexported changes.
- Keyboard focus returns to the saved task. Action confirmations, including the Undo banner, dismiss automatically after 10 seconds. The timer pauses while hovered, keyboard-focused, or the tab is hidden. Undo also ends on the next data change, dismissal, or closing/reloading the tab. Task reminders have no automatic dismissal timer.
- Follows the system theme until you choose a light/dark preference. Weekday names follow the browser locale; weeks still start Monday.

## Your data

Tasks, completion history, settings, and reminder history stay in the browser you use. They are not uploaded to GitHub. This repository contains the application and its tests, not your saved work checklist.

Use the same browser and HTML file location to return to your data. File-based storage behavior can vary by browser. Use **Back up tasks** before clearing browser data, changing browsers, moving the file, or replacing your working copy. **Restore backup** transfers a saved copy to another browser or device.

“Last backup exported” records when a download was initiated, not whether you saved the file successfully. The optional **Request storage protection** control appears only where the browser supports it; permission can be refused and clearing browser data can still remove tasks. Backups remain necessary.

If saved tasks cannot be loaded, **Download original saved data** in the warning exports the unchanged stored text for recovery. The app does not overwrite it or discard individual records. With an empty fallback session, **Back up tasks** exports that recovery file instead of an empty backup. If you create tasks in the unsaved session, Backup exports a separately named session file; the original data remains available through the warning. Recovery/session exports do not reset normal backup status. Restoring a valid backup warns before replacing unreadable stored data.

## Ordering and routine history

Rearranging Monday affects future Mondays and leaves other weekdays alone. Changing the routine catalog order leaves every daily order alone. Old shared custom orders are copied into the seven weekday preferences during migration, preserving the starting order while allowing each weekday to diverge.

When editing a routine, choose **Apply changes / end routine from** (today or later). Saving replaces any changes scheduled from that date onward; earlier definitions and completed occurrences remain available on their calendar dates. **End routine** stops new occurrences on and after the chosen date and lists the routine under **Ended routines**, with a history link. Ended routines can be viewed read-only. Use **Skip this occurrence** on an incomplete current/future occurrence, and **Restore occurrence** in the skipped section to undo a skip.

From **Weekly routines**, edits default to today. From a future calendar day, they default to that day. Routine-edit **Undo** restores the entire previous definition, including later scheduled changes that saving replaced.

To convert a one-time task, edit it and select **Every week**, then choose its weekdays. The routine begins on the chosen starting date or today, whichever is later. Earlier or completed original occurrences keep their saved details; future repeats start unchecked. Undo restores the one-time task. To change a weekly routine into a one-time task, create a separate one-time task and end the routine to preserve its history.

History removed by older app versions cannot be reconstructed. Back up before updating: this build writes data/backup format 5 and accepts formats 1–5; older HTML versions cannot read format 5.

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
