# Changelog

## Unreleased

- Redesign both themes with neutral surfaces, violet actions and selection, consistent system typography, shared controls, visible Edit labels, and a bounded workspace. Date navigation remains available at narrow widths; row actions reflow beneath task text.
- Add collapsed Coming up below the checklist in smaller windows, using the same seven-day list as the wide-screen column. Its disclosure state stays in the current tab, and resizing keeps a focused date reachable.
- Make One time / Every week, weekdays, and routine effective dates visible in the main editor. Keep notes/time/reminders optional, add adjacent accessible errors, and keep invalid fields reachable. New routines no longer require expanding optional fields.
- Consolidate recovery copies under Manage. Use compact browser-only saving status; retain independent browser/file failures, expose paused recovery controls, and keep file conflict choices equally styled. Reminder navigation honors reduced motion and finds today's overdue tasks.
- Preserve task-file format 5, formats 1–5 import support, existing scheduling/history/order semantics, and the offline CSP. Enforce LF checkouts so Windows rebuilds produce the same CSP and download checksums as CI.
- Expand browser acceptance checks across 13 widths and both themes, short dialogs, long content, forced colors, unchanged task data, and read-only history. Add Firefox to browser CI and run checks on the redesign branch.

## 1.6.3 — 2026-11-10

- If **Create new task file** ends without a folder, because Chrome refused a top-level folder such as Documents, permission was declined, or the dialog was cancelled, the panel now says **No folder chosen** and suggests making a folder such as `Documents\Day by Day`. Before, nothing visible happened.

Saved-data format remains 5, so v1.4.x through v1.6.3 can read each other's tasks and backups.

## 1.6.2 — 2026-11-10

- **Create new task file** now asks for a folder and creates `Day-by-Day-tasks.json` there, instead of using a Save dialog. A manual test confirmed that Chrome empties a file chosen in a Save dialog before the app can read it. If the chosen folder already has a task file, including the older `Day-by-Day-data.json`, the app opens it and asks which tasks to keep when they differ, and never replaces it.
- Add a Content Security Policy to the built HTML. The browser now enforces that the app runs only its own code and can't connect anywhere. The README explains that other local HTML files share browser storage in Chrome and Edge.
- The release workflow runs the Chrome browser checks before publishing. Checks run once per pull request, Node 22 is the minimum for development, and checkouts no longer keep the GitHub token on disk.
- Tests: the simulated browser lives in `tests/helpers/runtime.cjs`, a hung async check now fails the run, and the real-browser tests open the built file by `file://`, checking that the page policy blocks outside code and connections.

Saved-data format remains 5, so v1.4.x through v1.6.2 can read each other's tasks and backups.

## 1.6.1 — 2026-11-10

- Reconnecting a task file no longer asks which copy to keep when only one side changed. If the file still matches the last synced copy, your newer tasks save. If only the file changed, it loads. The app asks only when both changed, and neither answer is highlighted.
- Rename **Set up autosave** to **Create new task file**, explain that existing files belong in **Open task file**, and suggest a dated file name so the save dialog never offers an existing task file by default. Saving over a file in that dialog can empty it before the app reads it.
- A rejected or cancelled **Change file** keeps the working file saving instead of pausing it.
- If the browser is slow to answer at startup, say the task file couldn't be checked instead of showing first-time setup, and try again on the next file action.
- If two tabs save at almost the same moment, the later one asks which copy to keep instead of erasing the earlier change.
- Saving a task that another tab deleted or changed while you were editing now asks first. A deleted task can be saved as a new one. The app no longer reports **Task updated.** when nothing was saved, and deleting an already-deleted task says so.
- Skipped routine days that the routine no longer runs on are no longer offered for **Restore occurrence**, which used to report success while restoring nothing.
- Deleting many tasks or ending many routines in a row saves one recovery copy per 5 minutes, from before the first one, so a cleanup can't push out older copies. Copies before restoring or choosing which copy to keep are always saved.
- While a recovery copy is being written, the panel says **Saving a recovery copy…** and closing the page warns first, since closing then could leave the copy empty.
- Recovery copy names now include a random part, so two app windows saving in the same millisecond keep both copies. Copies with older names still appear and restore.
- Keep the 10 MB limit in one place and remove an unreachable message.
- File tests now fail when a step hangs, instead of ending silently with success.

Saved-data format remains 5, so v1.4.x, v1.5.0, v1.6.0, and v1.6.1 can read each other's tasks and backups.

## 1.6.0 — 2026-11-07

- On screens 1360px wide and up, add a **Coming up** column beside the checklist with the 7 days after the selected day: each day's task count and up to six task names, and a click to open it. Remove the width cap so the checklist and Coming up use the whole screen beside the sidebar, and line the saving panels up with the content. The day title and week strip stay stacked above. Narrower screens and phones are unchanged.
- Collapse connected autosave to one status row; group file controls, browser saving, and backups under Manage. Expand setup and file errors automatically.
- Start one-time task entry with a name and date; reveal notes, repeats, time, and reminders through More options. Existing tasks and new routines open the full editor.
- Group secondary task actions and reminder details under More, explain weekday/catalog reordering scope before moving, and label the reset action clearly. The reorder arrows stay beside each task, and overdue tasks keep **Move to today** and **Move to tomorrow** visible, and a small bell beside the time shows which tasks have reminders. **More** appears only when a task has something in it.
- Add collapsible completed sections with stable per-date session state and visible keyboard focus when a newly completed task is hidden.
- Close the Add or Edit task window by clicking outside it. If anything was typed or changed, the app asks before discarding it. Selecting text and dragging past the window's edge keeps it open.
- Reduce heading, week-strip, and row spacing; enlarge checkbox hit targets to 44px while keeping the checkbox drawing compact.
- Wait for an open task editor before reconnecting a remembered file, then reread the file and ask which copy to keep when needed. This prevents stale edits from overwriting newer file details or disappearing after a task was deleted from the file.
- Release the task dialog immediately on close and keep startup reconnection from blocking the checklist. Add regression checks for stalled animations and edits during slow reconnection; the intermittent Edge issue still needs long-session verification.
- Reveal collapsed task options when browser validation finds an invalid field, so Save can focus the field and explain what needs correcting.
- Add browser regression checks for desktop/mobile layouts, normal/reduced motion, repeated edits, file-save errors, and pointer targets. GitHub runs them in Chrome and Edge on every pull request and on main. Their guide is now part of `docs/TESTING.md`.

Saved-data format remains 5, so v1.4.x, v1.5.0, and v1.6.0 can read each other's tasks and backups.

## 1.5.0 — 2026-11-06

- Add optional **Recovery copies** in desktop Chrome/Edge: up to 20 earlier versions of your tasks in a folder you choose. A copy is saved at most once an hour while you work, and right before deleting a task, ending a routine, restoring, or choosing which copy to keep. **Show copies** lists them in local time, and **Restore** asks first and saves the current tasks before replacing them. Copies never block saving: if the folder can't be used, copies pause and tasks keep saving. Only the app's own copy files are ever removed.
- Add **Retry saving** to the browser-storage warning, and **Retry file save** to the task-file panel after a failed write. Both try again right away without another edit. File retry resumes only when nothing else changed the file, otherwise Reconnect still asks which copy to keep. No retry is offered over saved data that could not be loaded.
- Move between days on the month calendar with the arrow keys, including across months and years. Tab reaches exactly one day: the selected day or today when shown, otherwise the 1st, so the calendar stays reachable after changing month. Add **Go to date** below the calendar to open any date directly.
- Make **Moved from** on a task carried over by Move to tomorrow a link to its original day, and show a matching **Moved to** link on that day's skipped list. Each link opens the other day and moves keyboard focus there.
- Add real-browser checks (`tests/browser.html`, run with `npm run preview`) that use the built app for adding, editing, reloading, the calendar keyboard, Retry saving, two tabs, and Move to tomorrow links. Add `docs/TESTING.md` with a manual checklist for file permissions and other behavior that can't be automated. No app changes.
- Move the scheduling, history, reminder, and validation logic from `app.js` into `src/schedule.js`. Tests now load that file directly instead of cutting code out of `app.js` by searching for marker text, so reorganizing the app can't silently break them. App behavior is unchanged.

Saved-data format remains 5, so v1.4.x and v1.5.0 can read each other's tasks and backups.

## 1.4.1 — 2026-11-05

- Retry browser saving with every change after a storage error, clear the warning once a save succeeds, and ask before closing a tab whose changes reached neither browser storage nor a connected task file.
- When another tab saves while this tab has changes the browser could not save, ask which copy to keep instead of silently replacing this tab's changes.
- Fix Skip this occurrence for an unchecked routine occurrence that kept saved details from an earlier edit. Skipping now always hides that date, and Restore brings the saved details back. Days that older versions recorded as both done and skipped load as done, as they appeared before.
- Label tasks created by Move to tomorrow with "Moved from" and their original date. The original date shows where the occurrence went instead of offering Restore occurrence, which would have put the task on both days.
- Reset reminder timing when reminder choices change, so adding a reminder to a task that is already overdue sends no old alert. Routine edits compare with the version in effect on the edited date, not a later scheduled change.
- Let Disconnect release the task file even when the browser cannot forget the stored connection, and explain that the file may reopen next time.
- Check the whole task list before keeping any change, including the 10 MB limit for task files and backups. A change that fails is undone with an explanation. Changes that shrink oversized data, such as deletions, are always allowed. A rejected backup restore leaves current tasks and any unreadable original untouched.
- Point the main README download to the latest release. The build now stops if a source tag it inlines is missing and refreshes SHA256SUMS.txt. GitHub Actions runs the tests and checks the committed HTML and checksums.
- Remove the unused swap-based reorder helper, ignore live task files and recovery exports in git, fix README wording, and add the missing v1.0.0, v1.1.0, and v1.3.0 release notes.
- Saved-data format remains 5. Moved tasks gain an optional movedFrom field that older versions ignore.

## 1.4.0 — 2026-11-04

- Add Move to tomorrow to unfinished timed tasks in today's Overdue list. Preserve due time, descriptions, and reminders, keep today's view open, and support Undo.
- Defer only the current occurrence of weekly routines as a one-time task while preserving future routine schedules and completion history. Tomorrow's regular occurrence stays independent when present.
- Recheck stale controls after completion, another move, or midnight; use calendar-date arithmetic across month/year, leap-day, and daylight-saving boundaries.
- Add runtime and JSON autosave coverage for deferral, Undo, reload, recurring snapshots, independent occurrences, accessible controls, and date boundaries. Saved-data format remains 5.

## 1.3.1 — 2026-11-04

- License Day by Day under MIT, with a repository LICENSE file, package metadata, and documentation.
- Embed the full license and copyright notice in each standalone HTML build and include LICENSE.txt with release downloads.
- Licensing and packaging update only; task behavior and saved-data format are unchanged.

## 1.3.0 — 2026-11-01

- Add automatic saving to a selected local JSON file in desktop Chrome/Edge. Remember the file in IndexedDB and reopen it automatically when permission survives; provide reconnect/open actions after permission expiry or browser cleanup.
- Serialize writes, show saving/saved/error status, warn before closing with pending changes, and retain existing JSON on failed writes. Validate files and detect external changes before committing writes.
- Ask before replacing differing browser/file copies, including pending edits recovered after reopening. Preserve browser-only operation and manual backups in unsupported browsers.
- Add file-persistence and integration tests for cleanup, blocked storage, permissions, save failures, concurrent edits, corruption, reopening, and the real task form/completion paths. No task schema change.

## 1.2.1 — 2026-10-30

- Fix routine edits from Weekly routines defaulting to the last browsed future date; use today there while keeping the selected date for calendar edits. Routine-edit Undo restores replaced future revisions and original details.
- Preserve and export unreadable original saved data from the load warning; prevent empty fallback sessions from being exported as normal backups. Keep unsaved-session exports distinct, retain original data if restore cannot save, and warn before replacing unreadable data.
- Include occurrence dates in stable completion-toggle labels, re-announce repeated status messages, and restore visible focus by opening today after Move to today. Avoid hidden checklist controls when restoring focus from the routine catalog.
- Add regression coverage for failed-load recovery and restore failures, routine-edit dates/Undo, repeated announcements, dated labels, and Move to today focus.

Saved data remains format 5, compatible with v1.2.0. Automated scheduling, runtime, history/migration, theme, and standalone packaging checks passed. Actual local-file visual behavior across browsers is not verified by these checks.

## 1.2.0 — 2026-10-30

- Fix disabled Every week controls when editing one-time tasks. Allow conversion with multiple weekdays, preserve original earlier/completed occurrences and details, start future repeats unchecked, and offer Undo.
- Add Overdue above the checklist for earlier unfinished one-time tasks and today's unfinished tasks after their due time, including routines. Refresh automatically as time passes, keep each task in one section, retain weekday ordering and completion progress, and preserve original-date completion and Move to today for earlier tasks.
- Add last-backup-export status, backup notices, and optional browser storage protection where supported.
- Restore focus after task dialogs; show Undo near the checklist; announce status updates through an always-present live region.
- Dismiss action confirmations and Undo banners after 10 seconds, pausing while hovered, keyboard-focused, or the tab is hidden. Keep task reminders persistent, add Dismiss to plain confirmations, and show each confirmation once.
- Use stable completion-toggle labels, remove the single-letter N shortcut, improve light-theme calendar contrast, and use system fonts.
- Simplify one-time scheduling to a single Date field, follow the system theme until explicitly overridden, and localize weekday names consistently with dates.
- Clarify best-effort reminders, suppress newly entered past-due alerts, and coordinate reminder delivery with Web Locks where supported.
- Count calendar tasks without sorting and cache counts during rendering.
- Save custom ordering independently per weekday, reuse it in future weeks, and keep the routine catalog independent. Migrate older shared preferences without losing their starting order.
- Preserve routine definitions with effective-date revisions and completed-occurrence snapshots. Add End routine, an ended-routine history view, and skip/restore for a single current or future occurrence.
- Migrate saved data/backups to format 5 while accepting formats 1–5. Older HTML versions cannot read the new format; previously removed history cannot be reconstructed.
- Include sidebar/calendar alignment fixes, the checklist-header Add action, and the filled Back to today button committed after v1.1.0.

Update note: Back up before replacing your working HTML. This release reads formats 1–5 and writes format 5; older HTML versions cannot read format 5. Use the same browser and file location when updating, and restore your exported backup if needed. History already removed by earlier versions cannot be reconstructed.

Validation: JavaScript syntax, standalone packaging, and automated scheduling/reminders, migration/history, ordering, theme, notification timing, and application runtime checks. Actual local-file visual behavior in Edge, Chrome, and Firefox was not verified in this environment.

## 1.1.0 — 2026-10-29

- Add optional task descriptions for details, multiline notes, and clickable HTTP/HTTPS links. Descriptions save locally and are included in backups.
- Show descriptions directly below each task, with Show more / Show less for longer notes.
- Keep task arrows, checkboxes, and Edit anchored at the top when descriptions expand.
- Add an embedded browser-tab icon matching the app's checkmark branding.
- Default to earliest due time first, with alphabetical sorting for equal times and all-day tasks last.
- Allow unrestricted custom ordering with the arrows, save that preference in backups, and add Sort by due time to restore automatic sorting.
- Limit navigation animation to headings, clean up completed animation effects, simplify dialog fades, and remove clipping around the interactive checklist as a workaround for an intermittent Edge click/focus lockup. The original cause and long-term resolution remain unconfirmed.

Existing tasks, descriptions, schedules, completion history, and supported older backups remain compatible. Back up tasks before replacing the HTML file, and use the same browser and file location when updating.

Validation: JavaScript syntax, scheduling, reminders, migration, descriptions and links, previews, automatic/custom ordering, persistence, and animation runtime checks. Local-file visual testing is not verified by these checks.

## 1.0.0 — 2026-10-29

First release: standalone HTML checklist with a calendar, one-time and multi-day weekly tasks, completion history, task ordering, light/dark themes, optional local due times and reminders, and browser-local backup/restore.
