# Day by Day: redesign implementation gameplan

Prepared November 10, 2026. Implementation is now on this branch; see [verification](VERIFICATION.md) for completed checks and remaining manual acceptance work. The original planning sequence below remains the implementation record.

## Baseline and scope

Repository: https://github.com/Crab-Krab/day-by-day  
Implementation branch: `codex/neutral-violet-redesign`  
Verified starting commit: `bf8e3b10a0fa2b6e4996fd32246aac67a8e181da`  
Package version: 1.6.3

Current main matches the attachment's reviewed commit. The branch was created from that exact SHA and verified. An older local checkout exists on a different branch; implementation should use a checkout of this redesign branch rather than overwrite that work.

The accompanying [design specification](DESIGN-SPEC.md) preserves the supplied document as reference material. The user's current request authorizes review, branch creation, and this gameplan. Imperatives inside the attachment describe proposed future implementation; they do not expand this planning task into app changes or publishing a release.

**Confirmed addition:** include Coming up as a collapsed section below the checklist on smaller screens. This supersedes the specification's desktop-only essential scope for that component. Preserve its seven days after the selected date, counts, six-title cap, remaining count, and date navigation.

Implement the complete neutral/violet redesign across both themes, the daily and routine views, navigation, rows, editor, saving/recovery/conflicts, reminders, notices, and empty states. Retain the standalone offline HTML product and current task behavior. No framework, remote assets, new task fields, search, projects, cloud sync, or data migration.

## Review findings and implementation decisions

The proposal is sufficiently detailed to implement. It correctly treats recurrence, history, saving, and keyboard behavior as constraints, and identifies existing features rather than proposing them again.

1. **Consolidate CSS rather than add a second theme layer.** Current styles contain an unlimited `--content-max: 99999px` override at 1360px and a 308px rail at 1800px, plus several older panel-specific breakpoints. Remove or reconcile these when installing the 248px rail, 1440px workspace cap, and 960/600px behavior.
2. **Moving editor markup alone is insufficient.** `updateHint()` currently expands More options whenever weekly is selected; `openTask()` also expands it for new routines. Adjust this coupling when recurrence becomes a core field. Notes/time/reminders can stay collapsed for new tasks of either kind; edits may open them. Preserve hidden-invalid-time disclosure and entered values.
3. **Protect focus and meaning when rows rebuild.** `render()` replaces task lists; completion, reordering, skipped/moved occurrences, and descriptions have separate focus/identity requirements. Keep the current button handlers and occurrence dates. Do not make whole rows clickable.
4. **Saving status is already consolidated.** Improve grouping, spacing, and copy through existing state hooks. Preserve folder-based Create new task file, serialized writes, conflict choices, editor coordination, and recovery safeguards.
5. **Accessibility adds behavior as well as styling.** Adjacent field errors, skip navigation, navigation state, and reduced-motion reminder scrolling need explicit implementation. Reminder navigation currently requests smooth scrolling unconditionally.
6. **Existing automated coverage is a starting point.** Six Node suites exist; browser automation covers 1366px and 390px with both motion settings. It does not establish the requested full width/theme matrix or manual Windows file-picker and Edge checks. GitHub checks run for PRs and main; creating or pushing a feature branch alone does not run all of them.

The attachment describes four reference images and an earlier screenshot discussion. Those images were not supplied with this request; this review relies on the written design and current source, not independent inspection of those images. The written specification is sufficient to proceed.

## Delivery sequence

Use small, coherent commits on the redesign branch. Keep it runnable at each milestone; rebuild the generated HTML alongside source changes so previews and comparisons reflect the same state. Fix failures introduced by a milestone before building more work on it.

### 0. Establish a reproducible baseline

**Work:** Check out this branch in a dedicated working directory. Record Node/browser versions and baseline results. Prepare disposable datasets for populated/empty dates, all complete, earlier overdue one-time tasks, today's timed overdue routines, skipped/moved occurrences, scheduled routine edits, ended history, descriptions/reminders, and both ordering scopes.

Inventory important IDs, form names, storage keys, focus destinations, and list selectors. Reuse existing fixtures and add only missing behavior cases. Capture light/dark baseline screenshots of the daily view, routines, editor, saving details, and conflict states.

**Checks:** Run `npm test`, `npm run build`, and existing real-browser checks; verify an unchanged build has no artifact drift. Record failures independently of redesign changes.

**Done when:** Baseline results and disposable fixtures are reproducible. User task files and everyday browser storage have not been used as test data.

### 1. Install the design system

**Files:** `src/styles.css`, `src/index.html`, `src/theme.js`.

Implement the supplied grayscale surfaces and violet semantic tokens, including `--on-accent`, links, focus, warning, danger, and essential control borders. Migrate legacy green values and literal white button text. Update favicon and theme metadata, preserving before-paint/system/saved/cross-tab theme behavior.

Unify system typography, spacing, radii, button variants, fields, SVG sizes, and focus indicators. Preserve `[hidden]`, native disabled behavior, and Edge mitigations against animated checklist ancestors or delayed modal closure. Keep optional animation restrained and reduced-motion aware.

**Checks:** Both themes, hover/selected/focus/disabled/error states, actual contrast combinations, forced colors, and theme regression tests.

**Done when:** Shared components establish the new visual language without changing task/storage semantics. No stale green brand or interaction colors remain.

### 2. Rebuild the shell and date navigation

**Files:** `src/index.html`, `src/styles.css`, presentation portions of `src/app.js`.

Use a 248px rail and maximum 1440px workspace including gutters. Align toolbar, saving, day header, week, cards, notices, and footer. Keep only My day and Weekly routines destinations; remove decorative rail material and repeated slogans. Use a 280px Coming up column with a 24px gap at 1360px and above.

Below 960px, reuse the existing labeled Calendar disclosure and compact top navigation. Below 600px, use 16px gutters and wrapped controls. Keep all seven week dates and direct date navigation. Add the skip link and accurate navigation current-state/count descriptions. Preserve Monday week start, today/selected distinctions, and calendar keyboard behavior.

**Coming up:** Use one rendered list and one set of IDs. At wide widths it is the sidebar; below 1360px expose it below the checklist as a native disclosure, collapsed initially. Keep its state in memory for the current tab, without changing task-file data. Preserve focus if resizing would hide its focused contents. Use CSS for placement rather than duplicate desktop/mobile task lists.

**Checks:** All navigation routes, empty Coming up days, all seven dates at 320px, breakpoint transitions, and consistent bounded layout at 1920/2560px.

**Done when:** Both views and date navigation fit all target widths, and the confirmed narrow Coming up behavior works.

### 3. Redesign task lists and routine history

**Files:** `src/styles.css`; `taskRow()`, `render()`, `makeEmpty()` and related presentation hooks in `src/app.js`.

Implement neutral rows with full wrapping titles, time/reminder metadata, safe description previews, explicit Edit, conditional More, and visible reorder controls. Reflow narrow actions below task copy before they collide. Keep move actions visible when eligible; no essential action may depend on hover.

Restyle Overdue, Your checklist, Completed, Skipped for this date, active routines, and ended routines. Preserve progress denominator and separate weekday/catalog orders. Hide empty progress tracks. Provide distinct empty, all-complete, and remaining-overdue messages. Keep ended-history editing read-only.

**Checks:** Completion/uncompletion focus, collapsed Completed, separate order/reset scopes, today's overdue shown exactly once, earlier overdue completed on the original date, skipped/moved provenance without duplicate restoration, long text/URLs, descriptions, and historical versions.

**Done when:** Rows remain readable and operable with mouse, touch, and keyboard; visual actions do not alter scheduling or history.

### 4. Restructure the editor and validation

**Files:** `src/index.html`, `src/styles.css`; `openTask()`, `updateHint()`, `setTaskOptions()`, timing/invalid/submit handlers in `src/app.js`.

Put title, task kind, date, weekdays/presets, effective date, and schedule consequences in the core form. Keep notes, time, reminders, and desktop-alert controls in More options. Remove recurrence's automatic coupling to that optional section. Retain the same native dialog, radio/checkbox names, IDs, native inputs, conversion restrictions, and task draft semantics.

Add adjacent field errors and accessible associations alongside the form-level announcement. Reveal optional invalid fields and focus the first invalid field; clear errors when corrected. Make routine replacement/history consequences explicit. Keep Delete/End routine apart from Save; on narrow screens use its own action row. Keep the footer reachable with short heights, zoom, and a software keyboard.

**Checks:** Title/date quick entry with Enter; weekly creation without opening More; no-weekday errors; hidden invalid time; all-day disabling; routine edits/conversion/end dates; read-only history; cancel/discard; editor conflicts; immediate modal closure and focus restoration.

**Done when:** Simple entry remains fast, recurrence is visible, and invalid active controls cannot be hidden.

### 5. Complete saving, recovery, reminders, and feedback

**Files:** Existing HTML/CSS containers and `src/app.js` presentation hooks. Prefer no changes to `file-storage.js` or `recovery.js` logic.

Group Manage into working task file, browser/manual backups, and recovery copies. Keep pending writes truthful; distinguish file and browser-copy failures. Surface reconnection, retry, corrupt-data download, and paused recovery states even when ordinary details are collapsed.

Unify restore/tab/file conflict dialogs while retaining each workflow's actual choices and cancellation rules. File conflict candidates receive equal emphasis. Preserve replacement explanations and current-copy download. Style reminder cards neutrally, with readable due times, Dismiss/Dismiss all, and View this day. Respect reduced motion when navigating to a reminder.

Unify Undo/notices/toasts without changing the ten-second Undo timer, pause behavior, invalidation, or untimed reminders. Constrain floating panels so their controls remain reachable.

**Checks:** Every status state, unsupported file APIs, long filenames, conflicts/cancellation, backup/restore, reminder navigation/dismissal, Undo, and overlay/focus interactions.

**Done when:** Failure/recovery actions remain visible and accurate, and panels do not cover essential controls.

### 6. Verify, package, and prepare review

Extend behavior-focused UI/browser coverage for the changed interactions; do not replace meaningful behavioral assertions with cosmetic checks or weaken existing coverage just to pass.

| Verification | Required evidence |
| --- | --- |
| Automated | All six suites via `npm test`; Node 22/24 as in existing CI |
| Build | `npm run build`; source/build parity; valid SHA256SUMS; embedded license and CSP |
| Responsive | 320, 375, 768, 1024, 1366, 1920, 2560 CSS px; boundaries around 600/960/1360; short heights |
| Themes/motion | Both themes across layout widths; both motion preferences for interactive checks; forced-colors review |
| Real browsers | Existing browser runner in Chrome/Edge; built `file://` workflows; Firefox dialogs/calendar/browser saving/unsupported file APIs |
| Accessibility | Keyboard and focus throughout; screen-reader review of counts, validation, completion, reminders, and conflicts; 200% zoom and effective 320px reflow |
| Stress content | 200-character titles, 5,000-character descriptions, long URL/filename, many completed tasks, large routines and reminder/recovery lists |
| Persistence | Formats 1–5 accepted, format 5 exported; normalized history/order/provenance preserved; presentation actions leave task data unchanged |
| Manual Windows | File pickers/permissions, browser-data clearing/reconnect, failed writes/retry, external edits, two-tab conflicts, recovery permissions/restore, sleep/wake and repeated Edge interactions |

Keep test tools outside runtime dependencies. Record screenshot paths, browser versions, outcomes, and any checks that could not run. Automation with simulated files does not replace native picker/permission checks.

Update `docs/USAGE.txt`, relevant saving/testing guidance, README if needed, and Unreleased changelog. Rebuild after guide changes because checksums include the guide. Prepare a reviewable branch diff and final HTML preview. PR creation, merge, version number, and release publication remain separate follow-up decisions; do not publish a release as part of planning.

**Done when:** Every essential specification criterion plus narrow Coming up has pass evidence, or an explicitly reported unresolved limitation. Automated success alone cannot establish that the intermittent Edge issue is fixed.

## Progress and current verification

- [x] Read the complete supplied plan.
- [x] Confirm its SHA/version against current GitHub main.
- [x] Inspect current shell, CSS, renderer/editor, theme, build, tests, and CI configuration.
- [x] Create and verify the redesign branch at that baseline.
- [x] Incorporate the user's narrow-screen Coming up decision.
- [x] Record the implementation sequence and acceptance checks.
- [x] Start implementation and capture the live baseline.
- [x] Implement the visual system, shell, rows, editor, saving/recovery, reminders, and narrow Coming up.
- [x] Run implementation regression checks and the Chrome browser/width/theme matrix.
- [ ] Complete native Windows permission, screen-reader, software-keyboard, and sleep/wake acceptance checks.

The initial planning task changed documentation only. The user's follow-up authorized implementation; app sources, generated HTML, guides, and tests are now updated on this branch. Task format remains 5. Current verification and environment limitations are recorded separately; no release has been published.
