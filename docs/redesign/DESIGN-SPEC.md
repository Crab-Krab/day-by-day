# Day by Day redesign plan
November 10, 2026 · Plan only

**Recommendation:** a neutral black-and-white planner with violet accents, clear task rows, compact date navigation, and consistent controls. Preserve the current two-view product, offline HTML delivery, task behavior, and saved-data format.

This plan incorporates your latest preference: replace the green palette; use mostly black/white according to theme, with violet for actions and selection. Red and amber communicate exceptional states. No app implementation changes are proposed as already completed.

## 1. Current-app assessment

### Evidence and limitations

The code baseline is main at commit **bf8e3b10a0fa2b6e4996fd32246aac67a8e181da**, package version **1.6.3**, inspected November 10, 2026. Your last image labeled “Current version” is the visual baseline; the earlier empty, centered screenshot is superseded for layout assessment.

Reviewed material includes the HTML shell, CSS, task rendering and editor handlers, scheduling and validation logic, theme handling, file/recovery storage logic, build script, README, user guide, testing guide, and current changelog. A separate source snapshot was retrieved for inspection; the repository was not edited.

Live browser inspection did not succeed: the in-app browser could not reach the local preview, and native browser inspection stopped because the computer-use tool does not support URL-policy enforcement for that Windows browser. Findings below distinguish code/documentation evidence from your screenshot. No interactive, mobile, or screen-reader testing was completed for this plan.

Source anchors, pinned to the reviewed commit:

- [App structure and dialogs](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/src/index.html)
- [Current CSS and breakpoints](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/src/styles.css)
- [Task rendering, interactions, reminders, and browser saving](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/src/app.js)
- [Scheduling, history, sorting, and validation](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/src/schedule.js)
- [User guide](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/docs/USAGE.txt)
- [File saving](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/src/file-storage.js), [recovery copies](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/src/recovery.js), and [testing guide](https://github.com/Crab-Krab/day-by-day/blob/bf8e3b10a0fa2b6e4996fd32246aac67a8e181da/docs/TESTING.md)

### Existing workflows to preserve

| Workflow | Verified behavior |
| --- | --- |
| Daily planning | Opens to today. Month calendar, week strip, Go to date, previous/next week, and Back to today select dates. Weeks start Monday; date/time labels follow the local environment. |
| Task entry | One-time task or weekly routine; title, date/start date, optional description, all-day/specific time, and reminders. Quick creation initially shows title/date, with recurrence and other controls under More options. Editing expands the options. |
| Weekly routines | Any weekday combination; Mon–Fri and Every day shortcuts. Completion belongs to an occurrence date. Effective-date edits preserve earlier/completed details; ending a routine preserves history. One-time tasks can become routines, but reverse conversion is intentionally restricted. |
| Completing work | A checkbox-style toggle completes/uncompletes an occurrence. Completed is collapsible, with count/progress retained. Collapse preference lasts for that date within the current tab. |
| Ordering | Due time first, alphabetical/natural ties, all-day last. Explicit up/down arrows create a custom order for that weekday. Routine-catalog order is separate. Reset applies only to the relevant order. |
| Overdue | On today only: unfinished timed occurrences due today plus earlier unfinished one-time tasks. Earlier missed routines do not accumulate. Each task appears in one section. |
| Moving/skipping | Earlier one-time tasks offer Move to today. Today's overdue timed tasks offer Move to tomorrow. Moving a routine occurrence creates a separate one-time task and skips the original occurrence; linked provenance prevents duplicate restoration. Skip/restore affects one eligible routine occurrence. |
| Descriptions | Up to 5,000 characters. Existing preview uses up to three explicit lines/240 characters, with Show more/less; safe web links remain clickable. Titles allow up to 200 characters. |
| Coming up | Seven days after the selected date, with counts and up to six task titles per date, then “+N more.” Clicking a date opens it. Current CSS displays this panel at viewport widths of at least 1360px. |
| Reminders | Optional 5/15/30/60-minute offsets for timed tasks. In-app reminders, reminder center, and optional desktop notifications. Best effort while the app is open and computer awake; no closed-app guarantee. |
| Recovery | Manual JSON backup/restore, original corrupt-data download, conflict choices, one-step Undo for supported actions, and optional recovery copies. |

**Not present in the reviewed app:** priority fields, flags, projects, tags, assignees, subtasks, Kanban status, collaboration, account navigation, or global search. The redesign must not imply that these exist.

### Structure, persistence, and constraints

The editable app is plain HTML/CSS/JavaScript with no runtime package dependencies. The build inlines source into one offline HTML file and hashes its script/style blocks into a Content Security Policy. Remote fonts, icon CDNs, analytics, and external runtime assets do not fit that delivery model.

Browser tasks use localStorage key **day-by-day.v1**. The payload writes format **5** and accepts formats **1–5**, preserving task IDs, date-based completion, routine versions/snapshots/exceptions, end dates, moved-task provenance, weekdayOrders, and routineOrder. Theme is stored separately under **day-by-day.theme** and initially follows system preference.

Desktop Chrome/Edge file autosave uses the File System Access API; IndexedDB remembers the connection and synchronization baseline. The actual JSON file remains after browser-data clearing, but the connection can be forgotten. Browser-only operation and manual backups remain available elsewhere. File writes are serialized, checked against external changes, and surfaced as saving/saved/error states. Opening/creating a file can require choosing which copy to retain.

Create new task file intentionally chooses a folder and checks for an existing task file. Do not replace it with a conventional Save As picker: the repository documents a prior browser truncation problem. Keep file reconnection, failed-write retry, external-change checks, unsaved-close warnings, and editor coordination.

Optional recovery copies keep up to 20 earlier versions in a selected folder, hourly while working and before qualifying risky changes, with throttling for repeated small deletions. They are separate from the working task file and manual backups. The shared size limit is 10 MB.

### Supported usability findings

| Finding and evidence | Design response |
| --- | --- |
| The latest screenshot uses similar green tones for canvas, rail, cards, borders, selected navigation, and active date. CSS defines green-tinted neutral roles. This weakens visual separation by inspection; it is not a measured WCAG failure. | Replace tinted neutrals with grayscale surfaces. Use violet only for interaction/selection. |
| CSS mixes system body type with 48px Georgia day headings, serif empty states, and serif dialogs. This is intentional current styling, but differs from the direct list-oriented references. | One system sans-serif hierarchy across screens and dialogs; keep friendly wording and the wordmark. |
| At wide widths, current CSS removes the content cap and stretches the week strip. Your latest screenshot shows long sparse rows and distant right-side actions. | Use a bounded workspace with a deliberately sized Coming up column and shorter reading lines. |
| The narrow layout retains separate reorder, completion, copy, Edit, and More areas. CSS reduces Edit to 34px wide and metadata to 11–12px in places. This creates a plausible crowding risk; it was not reproduced live. | Reflow actions below task text on narrow screens, retain visible ordering, and use larger essential text/targets. |
| Recurrence is a core workflow but hidden in More options during quick creation, verified in the HTML/editor logic. | Move One time / Every week and its schedule controls into the main editor section. Keep notes/time/reminders under More options. |
| My day count and checklist count can differ correctly: the screenshot shows 3 in navigation, 2 in the checklist, and 1 earlier overdue task. | Keep calculations. Add an accessible explanation that My day includes earlier overdue tasks; make each section's scope explicit. |
| Connected-file controls already collapse to a status row; errors expand details. Your current screenshot also shows a compact status. | Preserve this behavior. Improve grouping and copy rather than proposing collapse as a new feature. |
| Action sizes, radii, text sizes, and spacing have separate rules across saving, recovery, task menus, and dialogs. | Shared tokens and a small set of control variants. |
| The documented Edge issue is intermittent; source comments avoid animated checklist ancestors and immediately release dialogs. | Retain these mitigations. Do not animate task lists or defer dialog closure for visual effects. |

## 2. Interpretation of your references

There were no separate notes on individual reference details. The explicit color preference supplied later governs this plan: black/white foundations with colored accents, especially violet. Screen contents in the references are inspiration, not instructions to add their features.

| Reference | What it contributes | How to adapt it |
| --- | --- | --- |
| 1: dark workspace with sidebar and dense task list | Neutral dark surfaces, stable left navigation, strong list alignment, compact metadata, restrained separators. | Use its dark-mode hierarchy and scanability. Omit favorites tiles, saturated category chips, portfolios, avatars, and collaboration navigation. |
| 2: navy sidebar, pastel task board, mobile companion | Clear separation of navigation/content, soft corners, readable task grouping, deliberate adaptation to mobile. | Borrow component softness and responsive grouping. Keep the existing daily list; do not add Kanban columns, team spaces, or arbitrary full-card colors. |
| 3: white reminder list with sidebar | Task-first layout, obvious completion controls, quiet metadata, generous blank space, selected-row clarity. | This is the main structural reference for task rows. Avoid copying smart-list tiles, tags, flags, or its sparse screen literally; Day by Day needs date navigation and routine controls. |
| 4: violet-accented mobile planner and editor | Violet primary actions, gentle surfaces, clear form groups, compact dates, readable task details. | Use violet accents and coherent form spacing. Do not add progress dashboards, avatars, event durations, start/end times, locations, subtasks, or swipe-sheet behavior. |

**Resolution:** reference 3 supplies the list hierarchy; reference 1 supplies dark-theme discipline; reference 4 supplies accent and form treatment; reference 2 supplies soft component boundaries and responsive grouping. All use one shared component system. Full task rows stay neutral so color has dependable meaning.

## 3. Recommended design direction and rationale

### Neutral foundations, violet accents

Light mode should feel like white paper on a very light gray workspace. Dark mode should use near-black canvas, charcoal panels, and near-white text. Avoid green, blue, or purple tint in ordinary surfaces. Pure black/white extremes are unnecessary for every element; grayscale steps create useful depth.

Use violet for the primary Add/Save action, selected date, selected navigation marker, active form choices, links, and focus. Use soft violet selection fills for navigation and segmented choices, not large purple cards. Saved/completed states can use a check plus neutral text; they do not require another brand color.

Keep Day by Day's name, checkmark identity, daily orientation, and reassuring tone. Recolor the checkmark tile violet. Replace oversized editorial headings and repeated decorative slogans with clear, compact hierarchy. Do not add a dashboard or new destination.

### Governing principles

1. **The task title is the main content.** Time, recurrence, notes, and actions support it.
2. **Dates remain first-class navigation.** Keep month, week, direct date entry, and today recovery.
3. **Scope is explicit.** Distinguish occurrence actions, weekday ordering, routine-wide edits, and data replacement.
4. **Color communicates action or exception.** Neutral rows do not receive arbitrary category colors.
5. **The same action looks the same everywhere.** Shared button/input/focus geometry in all views and saving flows.
6. **Offline behavior and history are product requirements.** Visual work does not justify a framework or data migration.

## 4. Design system

### Color tokens

Suggested values below are implementation targets. Introduce semantic aliases and migrate existing CSS uses; do not leave hard-coded white text on dark-theme accent buttons.

| Token / role | Light | Dark |
| --- | --- | --- |
| --canvas | #F7F7F8 | #111113 |
| --surface | #FFFFFF | #1B1B1E |
| --sidebar | #F2F2F4 | #171719 |
| --surface-subtle | #F3F3F6 | #232327 |
| --text | #202024 | #F5F5F7 |
| --text-secondary | #62626C | #B3B3BE |
| --text-completed | #6B6B75 | #A6A6B1 |
| --border | #DDDDE3 | #35353D |
| --control-border | #85858E | #85858E |
| --accent | #5B4CE2 | #B8ABFF |
| --on-accent | #FFFFFF | #211848 |
| --accent-hover | #4C3BCB | #C8BDFF |
| --selection | #EEEAFE | #2D2742 |
| --on-selection | #4535B5 | #D5CCFF |
| --hover | #F1F1F5 | #28282E |
| --link | #5140CC | #C9BDFF |
| --focus | #6854E8 | #C5B7FF |
| --danger | #B42332 | #FFB4BC |
| --danger-surface | #FFF1F2 | #3B2229 |
| --warning | #8A4809 | #F6CE94 |
| --warning-surface | #FFF4E6 | #3B3023 |
| --field | #FFFFFF | #151518 |

Text pairs calculated from these suggested sRGB values: light primary text on surface 16.24:1; light secondary text on sidebar 5.39:1; white on light violet button 5.87:1; dark accent button text 8.00:1; dark secondary text on surface 8.27:1. Control borders on their surface are 3.66:1 light and 4.70:1 dark. These are token calculations, not a completed accessibility audit. Validate actual combinations, especially focused, hovered, and disabled states.

Use --border for decorative dividers. Use --control-border where a boundary identifies an input, unchecked completion control, or essential outlined action. Use explicit labels/icons alongside warning and error colors.

### Typography

Use the existing offline system stack: system-ui, "Segoe UI", Arial, sans-serif. No downloaded font.

| Role | Desktop | Narrow |
| --- | --- | --- |
| Day/view title | 32px / 40px, 650 | 28px / 36px, 650 |
| Dialog title | 24px / 32px, 650 | same |
| Section title | 18px / 26px, 600 | same |
| Task title | 16px / 24px, 500 | same |
| Body, form input | 16px / 24px, 400 | same |
| Navigation, button, field label | 14px / 20px, 500–600 | same |
| Task metadata, help text | 13px / 20px, 400 | same |
| Counts, compact date captions | 12px / 18px, 500 | same |

Do not shrink essential labels to fit. Prefer wrapping or reflow. Use tabular numerals for time/count alignment. Use sentence case rather than tracked uppercase eyebrows. The day heading becomes “Tuesday” with a readable “Today · November 10, 2026” label above it. Remove the decorative period from page titles; retain it in the established wordmark if desired.

### Spacing, dimensions, and surfaces

- Space scale: 4, 8, 12, 16, 24, 32, 48px. Use 8px within small control groups, 16px within panels, 24px between sections.
- Rail: 248px including 16px side padding. Workspace maximum width: 1440px including 32px side padding. Align header, save status, dates, task sections, and footer to one grid.
- Coming up column: 280px; gap from checklist: 24px. At 1360px, the checklist retains approximately 744px inside the rail/workspace arrangement.
- Buttons and inputs: 44px minimum height. Icon actions: 44×44px. Reorder arrows may use 32×32px targets on desktop, with clear separation; use 44×44px when reflowed on touch/narrow layouts.
- Ordinary task row: minimum 76px, automatic height; 12px vertical/16px horizontal padding. Long notes expand naturally.
- Week dates: 64px minimum height desktop, 60px narrow. Keep seven columns. At 320px, use 16px page gutters, 4px gaps, and at least 36px-wide cells. Date grids are the compact-target exception; never below 24×24px.
- Radii: 8px controls; 12px panels; 16px dialogs. Completion indicator: 22px square with 6px corners inside a 44px target. Pills only for short status/time labels.
- Cards: 1px neutral border, no persistent shadow. Dividers between task rows. Do not put every row in a separate elevated card.
- Floating menu shadow: 0 8px 24px rgba(0,0,0,.12) light; .32 dark. Dialog shadow: 0 20px 64px rgba(0,0,0,.20) light; .48 dark.
- Backdrop: neutral black at about 40% light / 64% dark. No colored glow or glass blur.

### Controls and states

| State/component | Rule |
| --- | --- |
| Primary button | Accent fill and --on-accent text. One per task/form action group; Save/Add remain visible labels. |
| Secondary button | Neutral surface, control border, normal text; hover uses --hover. |
| Quiet action | Text/icon without filled container at rest; 44px target where space permits. Links are underlined. |
| Hover | Subtle neutral fill; no scaling, movement, or layout change. |
| Pressed/selected | Soft selection fill and on-selection text; selected day uses solid accent. Include aria-pressed/current where already appropriate. |
| Focus | 3px --focus outline, 2px offset; inset variant for task rows where needed. Never replace with a shadow alone. |
| Disabled | Native disabled behavior, subdued text/fill, no hover response. Avoid reducing opacity of an entire group containing useful explanation. |
| Completed | Checked indicator, line-through on title only, readable completed text, neutral subtle surface. Links, Edit, and uncomplete remain usable. |
| Invalid | Danger border and adjacent message; aria-invalid and error association. Keep entered values. |
| Saving/busy | Text “Saving…” and existing busy/disabled logic. Do not show “Saved” before the relevant write completes. |
| Overdue | Amber clock/label and optional pale heading strip; title and main row remain neutral. |
| Destructive | Red text/outline treatment for Delete/End routine, apart from Save. No default emphasis on one side of a data conflict. |

Reuse the embedded SVG sprite. Standard icons are 20px with consistent strokes; metadata icons 16px. Add no icon library. Pair icon-only controls with accessible names; full reminder meaning must not rely on hover-only titles.

Motion: 120–160ms color/focus transitions, 150–180ms dialog/title fades, optional 180ms progress-width change. No animated task reordering, checklist transforms, completion celebration, looping decoration, or delayed modal closure. Honor reduced motion, including programmatic scroll-to-task paths.

## 5. Screen-by-screen and component-by-component changes

### A. Application shell and navigation

Keep only **My day** and **Weekly routines** as primary destinations. Keep bell, theme toggle, and Add task in the main toolbar. Remove “YOUR EVERYDAY SPACE /” breadcrumb wording; show the current view label instead.

Keep the month calendar and Go to date in the rail. Remove the rail's decorative leaf/slogan block to reduce secondary content. Keep essential storage information in the consolidated saving area, not duplicated in a rail footer.

My day navigation keeps its existing action: returns to today. When another date is selected, the daily view remains within that destination, while its heading clearly identifies the selected date. Navigation counts retain current calculations. Give My day's accessible name/description the count's scope, including earlier overdue one-time tasks.

**Wide layout, annotated conceptual wireframe**

~~~text
248px rail       Workspace, max 1440px including gutters
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ day by day.  │ My day                         [Bell] [Theme] [+ Add task]  │
│              ├──────────────────────────────────────────────────────────────┤
│ My day   3   │ Saved in this browser                            [Manage]   │ A
│ Routines 3   │                                                              │
│              │ Today · November 10, 2026                                    │
│ November     │ Tuesday                                       [Today]*      │ B
│ [calendar]   │ Nov 9–15                                  [Previous][Next]  │
│ Go to date   │ [Mon 9][Tue 10 selected][Wed 11][Thu 12][Fri 13][Sat][Sun]   │ C
│              │                                                              │
│              │ ┌─ Overdue · 1 ───────────────────────┐ ┌─ Coming up ──────┐│
│              │ │ □ Earlier task · Due Oct 30         │ │ Next 7 days      ││
│              │ │   Move to today              Edit  │ │ Wed Nov 11       ││
│              │ └─────────────────────────────────────┘ │ 2 tasks …        ││
│              │ ┌─ Your checklist · 2 ────────────────┐ │ Select day →     ││
│              │ │ 0 of 2 complete                     │ └──────────────────┘│
│              │ │ Due time · order repeats Tuesdays  │                     │ D
│              │ │ ↕ □ AH Clear · All day  Edit More  │                     │
│              │ │     Every Mon, Tue, Wed, Thu, Sun  │                     │
│              │ │ ↕ □ Sup Queue Clear …             │                     │
│              │ │ Completed · N  [disclosure]        │                     │ E
│              │ └─────────────────────────────────────┘                     │
└──────────────┴──────────────────────────────────────────────────────────────┘
~~~

A: routine saving remains compact; exceptions expand here. B: Today control appears only away from today. C: date navigation stays above both content columns. D: order scope remains visible. E: Completed stays inside the checklist and is omitted when empty. Example task names are taken from your screenshot, not proposed sample data for production.

### B. My day / selected date

Place the day header 24px below save status. Keep one short subtitle only where it communicates useful state: “All done for this day” or “No tasks planned.” Remove the repeated generic daily subtitle from populated lists.

Reduce week tiles from the current 78px desktop minimum to 64px. Use neutral unselected tiles with subtle borders, not strong filled boxes. Selected day is violet. Mark today separately with a small outline or “Today” accessible label when it is not selected. Planned-task dots remain neutral except on the active fill.

Keep Overdue above Your checklist, then Skipped for this date below the checklist. Do not merge prior-date tasks into today's progress. Preserve the existing denominator: today's overdue occurrences still count in today's total; earlier overdue one-time tasks do not.

Keep the inline checklist Add action as a quiet secondary control. Global Add remains the primary violet button. At narrow widths the inline Add sits on its own header row instead of squeezing the count.

Progress remains a slim 4px violet bar plus “X of Y complete,” without a donut, streak score, or dashboard tile. Hide an empty progress track when there are no scheduled tasks; do not show an empty quantitative mark as decoration.

### C. Task rows and ordering

Desktop row geometry: reorder arrows | completion target | flexible task copy | Edit and conditional More. Retain the up/down controls outside More; this is deliberate existing behavior, and routine reordering should remain discoverable.

The task-copy block contains:

1. Full task title, with a compact time label beside it when space permits.
2. Recurrence or One time; original due date for earlier overdue tasks.
3. Description preview and existing Show more/less, if present.
4. Moved from/to provenance or the relevant visible move action.

Keep a common right action column, with the existing noninteractive spacer when More has no content. Do not make the whole row a button: it contains links and several separate actions. Edit always remains visible.

Time labels use neutral subtle fill; overdue adds a word/icon and amber cue. All day is ordinary secondary text or the same neutral badge. A bell indicates configured reminders, with a programmatic description; detailed offsets remain in More. Do not color entire task rows by recurrence or due time.

Preserve preview calculation and safe linkification. Long titles wrap without a line clamp. Unbroken strings and URLs wrap within the copy column. Editing/checkbox controls stay top-aligned as descriptions expand.

**Narrow row, before actions collide:** completion target and task copy form the first line; reorder Up/Down, Edit, and conditional More form a left-aligned action row indented to the task-copy edge. Use visible labels for Up/Down in this row if needed for clarity. Do not push the text between five narrow control columns.

No priority indicator is introduced: priority is absent from the saved model. Due status provides urgency without inventing a priority field.

### D. Overdue, skipped, moved, and completed

- Keep Overdue heading/count, with one short explanation of its exact scope. Use amber, not red error styling.
- Move to today and Move to tomorrow remain visible in eligible rows, not buried in More. Do not offer them on ineligible tasks.
- Preserve completion on an earlier task's original date.
- Preserve linked moved occurrences and the absence of Restore where it would duplicate a carried task.
- Keep the exact section name “Skipped for this date”; include neutral “Moved” or “Skipped” text on the corresponding rows. Distinguish Restore occurrence from navigating to the moved copy.
- Completed uses a 44px-high disclosure header and count. Preserve its per-date, per-tab collapse state and focus transfer after completion.
- When all today's unfinished work is in Overdue, say so instead of displaying a generic empty checklist that implies there is nothing left.

### E. Weekly routines and history

Use the same page title, card, row, metadata, ordering, and Edit control styles as My day. The routine icon replaces the occurrence checkbox; catalog rows never imply global completion.

Keep recurrence wording, start date, scheduled-change information, and future end information. Use a compact neutral “Changes from [date]” label where present, without hiding the date. The order caption reads “Catalog order · daily orders unchanged” plus current sorting state.

Global Add opens the weekly editor as it does now; its contextual label can become “Add routine” in this view while preserving the same button ID/handler. Empty state has an Add routine control. Ended routines remains a disclosure with count and View history.

Ended history is read-only. In the editor, show a clear read-only notice and Close; retain disabled fields or equivalent readable values, with no Save or Delete action. Preserve which historical occurrence is resolved.

### F. Add/edit task dialog

Keep native dialog and a single shared form. Do not introduce a detail page, side drawer, or draggable bottom sheet.

**Field order**

~~~text
Add task / Edit task                                      [Close]
Task title
[ One time | Every week ]                   ← visible core choice
Date / Starting on
Repeat on [Mon … Sun]                       ← only if weekly
[Mon–Fri] [Every day]
Apply changes / end routine from            ← existing weekly edit only
Schedule explanation and history consequence
[More options: Notes, time & reminders]
    Description
    [All day | Specific time]
    Due at                                  ← if timed
    Reminder offsets                        ← if timed
    Desktop-alert status / enable control
Field errors / form-level error
[Delete task / End routine]                 [Cancel] [Add / Save]
~~~

Move kind, repeat weekdays, effective-date fields, and essential schedule explanations outside the optional section. Keep title/date fast entry, with notes/time/reminders collapsed for new one-time tasks. Existing edits can continue to open all options. Update the disclosure hint after moving recurrence out.

Preserve radio/checkbox semantics, field names/IDs, native date/time inputs, validity rules, one-time-to-routine conversion, and restrictions on weekly conversion. Never hide an active invalid field. Choosing All day disables timing/reminder inputs as today.

Desktop width: max 560px; padding 24px; maximum height calc(100dvh - 32px). Under 600px, width calc(100% - 16px), padding 16px, maximum height calc(100dvh - 16px). Keep the footer visible without covering the final field; test with software keyboard and short-height windows.

Delete/End routine sits apart from Save. On small screens it uses its own row, then Cancel/Save share the next row. Keep existing Undo/recovery semantics; do not add confirmation dialogs to ordinary completion or every delete.

Add adjacent field errors and aria associations while retaining the form-level error/live announcement. Focus the first invalid field, return focus after closing, and preserve cancellation/draft-discard behavior. Routine editing must visibly state that saving replaces later planned changes and preserves earlier/completed history.

### G. Saving, backups, recovery, and conflicts

Use one location under the toolbar for save status and its expandable details. It already exists in current main; restyle rather than replace its storage logic.

| State | Presentation and behavior |
| --- | --- |
| File connected/saved | “Saved to [filename]” with check and Manage. Long filename wraps or truncates visually with its full accessible value available. |
| Browser-only | “Saved in this browser” as the main status. Manage explains same browser/location and backup requirements. |
| Unsupported file autosave | Brief neutral note: “File autosave unavailable here. Browser saving and backups work.” Explain Chrome/Edge support in expanded details. No permanent alarm styling. |
| Saving | Existing truthful saving text; don't collapse away a pending write or use a misleading success icon. |
| Reconnection needed / failed file write | Persistent amber/red message and appropriate Reconnect or Retry file save. Expand details automatically. Browser-copy state remains independently clear. |
| Browser save failed | Persistent error, Retry saving, and backup access; distinguish a working connected file from an unavailable browser copy. |
| Unreadable saved data | Preserve original-data download and explicit recovery guidance. Never substitute a cheerful empty state that hides the failure. |
| Recovery copies paused | Explain that copies paused and whether task saving still works. Keep Turn copies back on visible. |

Within Manage, group Working task file, Browser copy & manual backups, and Recovery copies. Preserve all IDs and each panel's independent state. Recovery copies may remain a nested native disclosure; surface paused/error text in the summary so it cannot be silently hidden.

Keep Create new task file and Open task file as distinct actions, with their current meaning. Keep disabled controls disabled where APIs are unavailable; do not make an unsupported control look enabled.

Restore, tab-choice, and file-choice dialogs share form typography and spacing. File conflicts keep both candidate choices equally styled, with a separate Cancel. Keep the existing download-current-copy action and clear replacement consequences. For restore, explicitly mention connected-file replacement when a file is connected. Keep native browser confirmations where already used; a custom confirmation framework is unnecessary.

### H. Reminders, notices, and transient feedback

Keep the bell/count and existing reminder panel. Use neutral reminder cards with violet links, an obvious Dismiss, Dismiss all, and View this day. A reminder is not an error. Show exact due date/time; retain the best-effort note and desktop-permission status.

Use one shared notice style for action confirmations and Undo. Keep Undo in document flow above the checklist and ordinary toasts low on screen; they must not cover modal buttons or reminder actions. Preserve the current 10-second timer, hover/focus/hidden-tab pause, and next-change invalidation. Reminder alerts continue to have no automatic dismissal timer.

A focused panel/notice must stay reachable; viewport-constrained panels scroll internally. When reduced motion is requested, use instant rather than smooth scroll for View this day.

### I. Empty states and crowded content

| Situation | Treatment |
| --- | --- |
| No tasks on selected date | Small neutral icon, “No tasks planned for [date],” short prompt, existing inline Add nearby. Reduce the large current decorative leaf block; do not show a fake progress bar. |
| No routines | “Build your weekly routine,” one sentence, Add routine. |
| All complete | Keep Completed and exact count; “All done for this day.” Do not remove edit/uncomplete access. |
| All remaining work overdue | Explicit pointer to Overdue, using the current differentiated empty-state behavior. |
| Coming up empty date | “Nothing planned” remains a valid selectable day. |
| Long note/title/link | Wrap safely, preserve current preview/expansion and full title; no essential-content ellipsis. |
| Many rows | Let the document scroll. No virtualization or new pagination in the essential redesign. |
| Long reminder/recovery list | Constrain floating panel height; keep list controls readable and scrollable. |

### J. Responsive behavior and access

| Width | Layout |
| --- | --- |
| At least 1360px | 248px rail; bounded workspace; checklist plus 280px Coming up. Week/header span both columns. |
| 960–1359px | Rail plus one content column. Coming up remains unavailable as in current narrow behavior; the same dates/tasks remain accessible through week/month/direct date navigation. |
| Below 960px | Rail becomes compact top brand/navigation; reuse the existing Calendar disclosure. My day and Weekly routines remain labeled buttons, with Calendar clearly visible. |
| Below 600px | 16px content gutters; wrapped toolbar/navigation; seven compact week dates; reflowed row actions; narrow dialog. |
| Short height / zoom | No fixed canvas height. Main document and dialog scroll as needed; no clipped footer or trapped controls. |

Retain the existing mobile-calendar mechanism instead of creating a hamburger drawer. A later optional improvement can expose the existing Coming up summary as a collapsed section below the checklist; that is not required to preserve scheduling capability.

Keep calendar roving tab stop and arrow-key behavior, Monday week start, current/selected distinctions, all existing accessible names and live regions, and focus restoration after list rebuilding. Add a skip link to main content. Use navigation current-state semantics without pretending the two views are an ARIA menu.

Target 44px for ordinary actions; compact calendar/reorder targets must remain at least 24px, separated and keyboard usable. Use 16px input text on phones. Test 320px viewport and 200% zoom, plus reflow at an effective 320px width. No essential action is hover-only. Do not assert that system/browser zoom in your screenshot is an app defect.

## 6. Prioritized implementation phases, dependencies, and risks

This is an implementation sequence for future work, not authorization to implement during this planning task.

### Phase 0 — Lock the baseline and behavior contract (essential)

- Implement from the reviewed commit or explicitly reconcile changes since it.
- Capture representative current views using disposable data: populated/empty day, overdue, weekly routines, ended history, expanded editor, reminders, file states, and conflicts.
- Keep fixtures for supported old formats and a format-5 dataset containing versions, snapshots, exceptions, moved tasks, completion, and both order scopes.
- Record storage keys, important DOM IDs, and focus targets before changing markup.

Dependency: baseline first. Risk: using the earlier screenshot as the implementation baseline would discard newer saving and Coming up behavior.

### Phase 1 — Tokens and shared controls (essential)

Edit src/styles.css for neutral/violet tokens, typography, spacing, controls, focus, and surfaces. Migrate all hard-coded green/white/status values, including progress bars, selected dates, warnings, backdrop, and brand tile. Replace current --green usages with --accent; use --on-accent for text/icons. Remove obsolete overrides rather than appending another cascade layer.

Update theme metadata in src/index.html and src/theme.js, plus favicon data colors, so browser chrome and first paint match. Preserve theme storage, before-paint application, and cross-tab/system preference behavior.

Dependency: tokens precede layout/component work. Risks: white text on light lavender in dark mode; stale embedded favicon/meta colors; stronger decorative borders being mistaken for input boundaries.

### Phase 2 — Shell, dates, daily list, and routine list (essential)

Use src/index.html for semantic grouping and src/styles.css for the grid. Use src/app.js taskRow, render, renderWeek, renderCalendar, and makeEmpty only where markup/state exposure must change. Keep Coming up's existing range, counts, six-title cap, and date navigation. Do not change schedule.js to accommodate visual layout.

Reflow narrow task actions while keeping .move-up/.move-down, .edit-task, .check-button, and their handlers. Preserve stable task identity/focus after list replacement. Keep Completed/skipped/ended sections and order captions.

Dependency: shared controls. Risks: duplicate IDs from mobile/desktop copies; calendar keyboard regression; misplaced focus when a row moves into Completed/Overdue; wide rows still stretching because an old content-max override survives.

### Phase 3 — Editor, saving, recovery, and feedback (essential)

Reorder the existing form in src/index.html; update src/app.js setTaskOptions, updateHint, updateTimingFields, invalid/submit handlers, and labels to match the new field grouping. Preserve the “invalid hidden input becomes visible” rule where optional controls remain.

Restyle existing status containers/dialogs. Prefer leaving file-storage.js and recovery.js logic unchanged; adjust their presentation hooks only if necessary. Keep .app-shell inert/busy scope and dialogs outside that inert region as required by current flow.

Dependency: stable shell and component geometry. Risks: hiding a required effective date, changing the meaning of routine edits, weakening conflict choices, detaching a handler from its ID, or leaving a blocking modal layer.

### Phase 4 — Verification, packaging, and review (essential)

- Run npm test for all six suites: schedule, runtime, theme, history, file storage, and UI.
- Run npm run build; review the regenerated Day-by-Day.html and SHA256SUMS.txt.
- Run existing browser/UI checks according to docs/TESTING.md, with disposable data.
- Review desktop and narrow screens in light/dark and motion/reduced-motion.
- Check the built file by file:// in Chrome/Edge, and Firefox for dialogs, calendar, browser saving, and unsupported file APIs.
- Complete manual file-picker, reconnection, conflict, recovery, and Edge click/focus checks. Automated success does not resolve the known intermittent Edge issue.
- Update the user guide/changelog where labels or control locations changed. Keep the license embedded.

Do not edit the generated HTML as the sole source. The build requires exact inline-source tags and enforces offline CSP; no runtime dependencies, remote fonts, images, or scripts should be added.

### Optional, deferred improvements

- Expose the existing Coming up content as a narrow-screen disclosure, without new scheduling behavior.
- Persist presentation preferences such as Completed collapse across sessions only if later requested; use separate UI storage rather than changing task-file format.
- Replace remaining native confirm prompts with a shared accessible dialog only if separately justified and tested.

No search, priority model, projects, Kanban, subtasks, avatars, analytics dashboard, cloud sync, or new framework is included.

### File and function map

| Area | Owning files/hooks | Constraint |
| --- | --- | --- |
| Shell, views, form, dialogs, SVGs | src/index.html | Preserve IDs, native controls, script/link tags used by build, and modal accessibility. |
| Tokens/layout/states/responsiveness | src/styles.css | Consolidate repeated media/state rules; keep hidden attribute behavior. |
| Dynamic UI and focus | src/app.js: taskRow, render, renderCalendar, renderWeek, renderComingUp, makeEmpty, openTask, setTaskOptions | Preserve data calculations and handler semantics; beware full list replacement. |
| Dates/history/validation | src/schedule.js | Behavior boundary; no redesign-driven data change. |
| Theme | src/theme.js | Preserve day-by-day.theme and first-paint logic; update color metadata. |
| File and recovery workflows | src/file-storage.js, src/recovery.js | Keep write ordering, permission flows, recovery cadence, limits, validation, and replacement protections. |
| Build/release outputs | scripts/build.mjs, Day-by-Day.html, SHA256SUMS.txt | Rebuild from source; CSP hashes must match; single offline file remains deliverable. |
| Verification/documentation | tests/, docs/TESTING.md, docs/USAGE.txt, docs/FILE-AUTOSAVE.md, CHANGELOG.md | Update UI expectations only for intended design changes; retain behavioral coverage. |

## 7. Acceptance criteria

### Visual consistency

- Both themes use grayscale default surfaces; no legacy green remains in brand, task controls, progress, calendar, hover, favicon, or browser theme metadata.
- Violet consistently denotes primary actions/selection/focus; amber and red have labeled exception meanings.
- Headings, body, form, and notices use the specified system hierarchy, shared spacing, radii, and button variants.
- Save status, page heading, week strip, cards, and footer share horizontal alignment.
- At 1920px and 2560px, workspace width stays bounded rather than turning tasks into long sparse strips.

### Usability

- A user can add a simple task with title/date and submit; weekly recurrence is visibly discoverable without opening More options.
- Completion, Edit, More when applicable, and reordering remain discoverable on desktop and touch.
- Ordering scope explicitly distinguishes the weekday from the routine catalog.
- “My day 3 / checklist 2 / overdue 1” remains logically correct and has an accessible explanation.
- Empty day, all complete, and remaining-overdue states have different accurate messages.
- Conflicts and replacement confirmations identify which copy will replace which, retain backup access, and do not visually bias file-conflict choices.

### Responsiveness

- Inspect at 320, 375, 768, 1024, 1366, 1920, and 2560 CSS-pixel viewport widths, including short heights.
- No page-wide horizontal scrolling, clipped task text, overlapping actions, or inaccessible dialog footer.
- Week dates fit at 320px; all seven remain reachable. Calendar and Go to date remain available below the rail breakpoint.
- A 200-character title, 5,000-character description, long URL, long filename, many completed items, and large routine catalog remain usable.
- At 200% zoom and effective 320px reflow, essential content remains readable without hiding actions.

### Accessibility

- Normal text meets 4.5:1, large text 3:1, and essential control boundaries/focus indicators 3:1 against adjacent colors.
- Main actions target 44×44px; compact date/reorder targets are at least 24×24px with adequate spacing.
- Every action works with keyboard; visible focus is never clipped or covered.
- Calendar preserves arrow navigation and one roving tab stop. Current date and selected date are distinct programmatically and visually.
- Dialogs have names, contain modal focus, expose invalid fields, and return focus appropriately; list rebuilding does not lose focus.
- Expanded descriptions, Completed, mobile calendar, More, and save details expose accurate expanded states.
- Screen-reader review covers completion state, section counts, save failures, validation, reminder announcements, and restore/conflict choices.
- Reduced-motion preference disables transitions and programmatic smooth scrolling used by this interface; forced-colors mode keeps controls and selection identifiable.
- Color, icons, and tooltip text are never the sole way to identify a task's essential state.

### Behavior and data preservation

- All supported existing workflows in section 1 pass regression checks.
- Format 1–5 imports remain accepted; exports remain format 5. Compare normalized semantic data, not raw whitespace or expected migration output.
- A presentation-only action does not mutate tasks, history, reminder timing, orders, or file connection state.
- A routine's completion is date-specific; effective-date edits, ending, skip/restore, and moved provenance keep prior semantics.
- Today's timed overdue tasks appear once, move correctly, and contribute correctly to today's progress. Earlier missed routines are not newly carried forward.
- Automatic ordering, weekday custom order, routine-catalog order, and reset scope remain independent.
- Description limits, preview/link behavior, 10 MB validation, and existing record limits remain enforced.
- Browser save, file save, forgotten connection, reconnect, external change, two-tab conflict, corrupted-data recovery, manual backup/restore, and recovery copies still behave as documented.
- Undo retains its scope/timing; reminders retain offsets, completion suppression, and best-effort limitations.
- The rebuilt HTML operates offline with its existing CSP and without external assets or packages.
- No release is considered validated solely because unit tests pass; perform the documented local-file and Edge interaction checks.

**Planning verification:** repository/source and supplied screenshots were inspected; proposed token contrast pairs were calculated. Live interaction, responsive rendering, assistive-technology checks, and implementation regression tests remain future acceptance work. No app redesign has been implemented.
