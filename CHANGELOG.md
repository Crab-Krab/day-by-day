# Changelog

## Unreleased

- Fix routine edits from Weekly routines defaulting to the last browsed future date; use today there while keeping the selected date for calendar edits. Routine-edit Undo restores replaced future revisions and original details.
- Preserve and export unreadable original saved data from the load warning; prevent empty fallback sessions from being exported as normal backups. Keep unsaved-session exports distinct, retain original data if restore cannot save, and warn before replacing unreadable data.
- Include occurrence dates in stable completion-toggle labels, re-announce repeated status messages, and restore visible focus by opening today after Move to today. Avoid hidden checklist controls when restoring focus from the routine catalog.
- Add regression coverage for failed-load recovery and restore failures, routine-edit dates/Undo, repeated announcements, dated labels, and Move to today focus.

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
