# Day by Day redesign: verification and review

November 10, 2026 · Unreleased preview

Implemented on [codex/neutral-violet-redesign](https://github.com/Crab-Krab/day-by-day/tree/codex/neutral-violet-redesign), starting from main at `bf8e3b10a0fa2b6e4996fd32246aac67a8e181da`. The tested implementation commit is [761dfef](https://github.com/Crab-Krab/day-by-day/commit/761dfef927258ba165397095a755ec99ba7177d9). Subsequent verification-document changes do not change the tested app or test runners.

## Delivered behavior

- Neutral light/dark surfaces, violet actions/selection, shared system typography and controls, a 248px rail, and a bounded 1440px workspace.
- Responsive date navigation and task actions, full wrapping titles/notes, visible Edit, accurate overdue/completed/empty states, and independent weekday/catalog ordering.
- Coming up uses one seven-day list: a column at wide widths and a collapsed disclosure below the checklist in smaller windows. Resizing preserves focused dates and calendar controls.
- Recurrence, weekdays, effective dates, and history consequences are core editor fields. Notes/time/reminders stay optional. Field errors are adjacent and associated with the affected controls.
- Saving, manual backups, and recovery copies are grouped under Manage. Paused copies remain reachable; file and browser-copy failures remain independent. File conflict candidates have equal emphasis and a separate Cancel row.
- Reminder navigation honors reduced motion and reaches overdue tasks. Native dialogs close immediately; checklist rows/ancestors are not animated.

The task format remains 5; formats 1–5 are accepted. Scheduling/history calculations in `src/schedule.js` are unchanged. File write ordering, permissions, conflict decisions, recovery cadence, and Undo/reminder timing retain existing behavior. The build remains one offline HTML file with an embedded license and restrictive CSP, without remote assets or runtime dependencies. Package version remains 1.6.3 until a release version is selected.

## Completed checks

| Area | Evidence |
| --- | --- |
| Six automated suites | Local Node 24.22.1; [CI Node 22 and 24](https://github.com/Crab-Krab/day-by-day/actions/runs/42795001255) passed schedule, runtime, theme, history, file-storage, and UI suites. |
| Real browsers | [Final browser CI](https://github.com/Crab-Krab/day-by-day/actions/runs/42795001274) passed Chrome, Edge, and Firefox on Linux. Windows Chrome also passed locally. |
| Existing interactions | Per browser: 59 interface checks for each motion preference, trusted mouse/keyboard input at 1366/390px, and 18 legacy browser checks for each motion preference. |
| Responsive matrix | 320, 375, 599, 600, 768, 959, 960, 1024, 1359, 1360, 1366, 1920, and 2560px in both themes, in all three CI browsers. |
| Content and semantics | 200-character title, 5,000-character note, long URL, many completed tasks, routine revisions/snapshots, moved/skipped occurrences, ended history, separate orders, and accurate section counts. |
| Focus and validation | Core recurrence/effective-date visibility, first invalid focus, adjacent errors, all-day reset, canceled drafts, short-height footer hit targets, calendar resize focus, and Coming up focus/collapse across layout changes. |
| File/recovery presentation | Simulated file conflicts in both themes at 320px; equal candidates and separate Cancel; both copies unchanged on cancel; long filename reflow; browser quota failure with a successfully saved file; retry; paused recovery controls. Existing file/history/recovery regression coverage also passed. |
| Accessibility checks | Keyboard/calendar regressions, action targets, unique IDs, native disclosure states, reduced motion, forced colors, and text/action/selection/completed/warning/error/control/focus token contrast. These are targeted checks, not a complete accessibility audit. |
| Offline delivery | Built file opened by `file://`, add/reload persistence, no runtime errors or unexpected external requests, and actual rejection of unshipped scripts and outside connections. |
| Packaging | Rebuild produced no artifact drift. Repository and preview-package SHA-256 checksums verified. LF checkout rules prevent Windows line endings changing CSP/download hashes. |
| Visual review | Inspected desktop light/dark, 320/375px task lists, routine editor, saving details, and responsive Coming up using disposable data. |

CI browser versions: Chrome 156.0.8078.79, Edge 156.0.4314.58, and Firefox 153.0. Local Windows Chrome: 157.0.8103.51. Versions are recorded in the linked job logs.

All test data used isolated test contexts and simulated files. Normal browser profiles and everyday task files were not used.

## Remaining hands-on acceptance work

These checks are **not completed** and remain required before treating a release as fully validated:

1. Native Windows folder/file permission prompts: create/open a test task file, close/reopen, revoke/reconnect permission, external edits and conflict choices, failed-write retry, and recovery-folder permission/restore.
2. The known intermittent Windows Edge issue: switch dates/views, edit/cancel/complete/reorder, resize, then sleep/wake and repeat. Passing automated Edge checks does not prove that issue fixed.
3. Actual 200% browser zoom, a physical phone/software keyboard, and screen-reader review of completion, counts, validation, saving failures, reminders, and restore/conflict choices. Automated 320px reflow and short windows do not replace these checks.

Local Edge and Firefox automation failed before loading the app in the Windows sandbox. Native computer-use inspection then stopped because browser URL-policy enforcement is unsupported for the current Windows browser. Linux CI supplied cross-browser coverage; it does not substitute for those native Windows checks.

## Reviewing the preview

Open the supplied `Day-by-Day-redesign.html`, or extract the preview ZIP and open `Day-by-Day.html`. Screenshots use disposable example tasks; the actual HTML contains no seeded task data.

Use a disposable task JSON/folder for file-saving checks. The included user guide and file-autosave guide explain Manage and reconnection. No PR, merge, release tag, or published release was created, and main was not changed.

