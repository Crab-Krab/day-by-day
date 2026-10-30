# Changelog

## Unreleased

- Add Earlier, unfinished for overdue one-time tasks, with original-date completion and Move to today.
- Add last-backup-export status, backup notices, and optional browser storage protection where supported.
- Restore focus after task dialogs; keep Undo available near the checklist until the next change without a timed deadline; announce status updates through an always-present live region.
- Use stable completion-toggle labels, remove the single-letter N shortcut, improve light-theme calendar contrast, and use system fonts.
- Simplify one-time scheduling to a single Date field, follow the system theme until explicitly overridden, and localize weekday names consistently with dates.
- Clarify best-effort reminders, suppress newly entered past-due alerts, and coordinate reminder delivery with Web Locks where supported.
- Count calendar tasks without sorting and cache counts during rendering.
- Document the current shared ordering and routine-history limitations pending product decisions.
- Include sidebar/calendar alignment fixes, the checklist-header Add action, and the filled Back to today button committed after v1.1.0.

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
