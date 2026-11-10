# Testing Day by Day

Day by Day uses automated, real-browser, and manual checks. Each catches things the others can't.

| Check | How to run it | What it covers |
| --- | --- | --- |
| Automated tests | `npm test` (GitHub runs them on pull requests and pushes to main or the redesign branch) | Scheduling, history, saving, and the app's screens in a simulated browser |
| Browser checks | `npm run preview`, then open the printed browser-checks address and select **Run browser checks** | The real built app in a real browser: adding, editing, reloading, the calendar keyboard, Retry saving, two tabs, and Move to tomorrow links |
| Interface browser tests (optional) | `npm run test:browser`, after installing Playwright as shown below. GitHub runs Chrome, Edge, and Firefox checks on pull requests and pushes to main or the redesign branch. The release workflow runs Chrome before publishing. | Trusted mouse/keyboard checks and both motion settings; add/edit, menus, completion, saving/conflicts, local-file reload and CSP enforcement. A second runner checks 13 widths in both themes, long content, short dialogs, forced colors, responsive Coming up, read-only history, and unchanged task data. Screenshots are saved for review |
| Manual checklist | Below, before a release | File permission prompts and other browser behavior that can't be automated |

Run the browser checks in desktop Chrome or Edge, and in Firefox when a change touches the calendar, dialogs, or saving. They use only the preview page's own storage, put back whatever was there, and never touch your everyday tasks. Stop the preview with Ctrl+C.

To run the interface browser tests, install Playwright in a separate test-tools directory and point the runner to it. No runtime dependency is added to the app:

```sh
# In a separate test-tools directory:
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
# From this repository, set DAY_BY_DAY_PLAYWRIGHT_PATH to that node_modules/playwright,
# then run:
npm run test:browser
```

Set `DAY_BY_DAY_BROWSER_CHANNEL=chrome` or `msedge` to use an installed browser. For Firefox, install its Playwright browser with `npx playwright install firefox` in the tools directory and set `DAY_BY_DAY_BROWSER_TYPE=firefox`. Set `DAY_BY_DAY_BROWSER_OUTPUT` to keep screenshots. These tests use fresh browser contexts, disposable tasks, and simulated file controls; they do not use your normal browser profile or task files.

The redesign matrix covers 320, 375, 599, 600, 768, 959, 960, 1024, 1359, 1360, 1366, 1920, and 2560 CSS pixels. The boundaries test changes to the rail, row actions, and Coming up. The matrix uses reduced motion for deterministic geometry; the existing interaction runner checks both motion settings. It freezes the clock and uses `tests/helpers/redesign-fixture.cjs` for history, moved/skipped tasks, separate orders, large notes, and many completed tasks. Effective 320px reflow is automated; actual browser zoom and software-keyboard interaction remain manual checks.

To run only the redesign matrix, use `node tests/redesign-browser.test.cjs` with the same environment variables. See [redesign verification](redesign/VERIFICATION.md) for the latest recorded results and limitations.

## Manual checklist before a release

Use a test JSON file in a test folder, never your everyday task file. Open the downloaded `Day-by-Day.html` directly, the way users do.

**File autosave (Chrome or Edge)**

- [ ] Choose **Manage**, then **Create new task file**, change a task, and wait for **Saved to**. Close and reopen the HTML. The tasks load without a prompt when the browser kept permission.
- [ ] Remove the site's file permission in browser settings, then make a change. Saving pauses. **Reconnect task file** asks for access and saves.
- [ ] Clear the browser's site data. **Open task file**, select the same JSON, and check tasks and history come back.
- [ ] Make the JSON read-only, then make a change. The status says the change isn't saved, and **Retry file save** appears. Make it writable again and select **Retry file save**. Check the file on disk has the change.
- [ ] With the app open, edit the JSON in a text editor and save it. The next change pauses saving instead of overwriting it. **Reconnect task file** asks which copy to keep. Try both answers and Cancel.
- [ ] Let the browser forget file permission (or remove it in site settings), reopen the HTML, change a task, and choose **Reconnect task file**. It saves without asking which copy to keep.
- [ ] With a working file connected, choose **Change file** and pick a file that isn't a task file. The message says it wasn't opened, and the next change still saves to the original file.
- [ ] Put a copy of a test task file with history in a test folder as `Day-by-Day-tasks.json`. Clear site data, choose **Create new task file**, and pick that folder. The tasks load and the file is unchanged. Repeat with different tasks in the browser: the app asks which to keep, and **Cancel** leaves the file unchanged.
- [ ] Choose **Create new task file**, pick Documents itself, and check the panel then says **No folder chosen** with a subfolder suggestion. Pick a subfolder and check **Saved to** appears.

Which folders Chrome allows: in Chrome 157 on Windows 11 (November 2026), the folder picker refused Documents, Desktop, Downloads and the user folder itself with "can't open this folder because it contains system files", including Documents and Desktop redirected to OneDrive. A subfolder such as `Documents\dbd-subfolder-test` was allowed after an "Allow this site to edit files?" prompt. A refusal, **Don't Allow**, and Cancel all reach the app the same way, so it shows one hint for all three.

Why Create new task file uses a folder: in Chrome 157 on Windows 11 (November 2026), choosing an existing task file in v1.6.0's Save dialog and confirming Replace emptied it before the app could read it. The file went from 351 to 100 bytes with no question asked (audit F-01). The app no longer uses a Save dialog for task files.
- [ ] **Disconnect**, then check the JSON file is still on disk.

**Recovery copies (Chrome or Edge)**

- [ ] Choose **Manage**, open **Recovery copies**, choose a test folder, and check a first copy appears in its **Day-by-Day recovery copies** folder.
- [ ] Delete a task, then **Show copies** and **Restore** the "before deleting a task" copy. The app asks first, and the task comes back.
- [ ] Close and reopen the HTML. The panel shows **On**, or **Paused** if the browser didn't keep folder access. In that case **Turn copies back on** asks again.
- [ ] Remove the folder's permission in browser settings, then make a change. The panel shows **Paused**, and the task still saves.
- [ ] Put an unrelated file in the copies folder, make more than 20 copies, and check only the oldest copies were removed.

**Everything else**

- [ ] Add a timed task with a reminder a few minutes ahead. The in-app reminder appears. With desktop alerts allowed, a desktop notification appears too.
- [ ] Using only the keyboard, add, edit, cancel, and complete tasks. Focus returns to a sensible place each time.
- [ ] Repeat a few steps in a narrow window, in dark mode, and with reduced motion turned on in the system settings.
- [ ] Check actual 200% browser zoom and effective 320px reflow, plus a phone software keyboard. Confirm the editor's last field and Cancel/Save stay reachable.
- [ ] Review with a screen reader: completion state, section counts, validation errors, saving failures, reminders, and restore/conflict choices. Keyboard checks and automated accessibility assertions do not replace this review.

**Known Edge issue**

The checklist has sometimes stopped accepting clicks or focus in Edge. Passing other checks doesn't prove it fixed. In Edge, switch dates and views, open and close dialogs, complete and reorder tasks, resize the window, and put the computer to sleep and wake it. If clicks stop working, write down the Edge version and the exact steps.
