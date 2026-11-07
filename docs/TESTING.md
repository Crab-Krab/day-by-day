# Testing Day by Day

Day by Day has three kinds of checks. Each one catches things the others can't.

| Check | How to run it | What it covers |
| --- | --- | --- |
| Automated tests | `npm test` (GitHub runs them on every push) | Scheduling, history, saving, and the app's screens in a simulated browser |
| Browser checks | `npm run preview`, then open the printed browser-checks address and select **Run browser checks** | The real built app in a real browser: adding, editing, reloading, the calendar keyboard, Retry saving, two tabs, and Move to tomorrow links |
| Interface browser tests (optional) | `npm run test:browser`, after installing Playwright as shown below. GitHub runs them in Chrome and Edge on every pull request and on main. | 51 interface checks at desktop and phone widths, with animations on and off: quick entry, task menus, collapsing Completed, saving panel, real mouse and keyboard input, plus all browser checks above. Screenshots are saved for review |
| Manual checklist | Below, before a release | File permission prompts and other browser behavior that can't be automated |

Run the browser checks in desktop Chrome or Edge, and in Firefox when a change touches the calendar, dialogs, or saving. They use only the preview page's own storage, put back whatever was there, and never touch your everyday tasks. Stop the preview with Ctrl+C.

To run the interface browser tests on your computer, install Playwright outside the project, then run them. Nothing is added to the app or to `package.json`:

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run test:browser
```

Set `DAY_BY_DAY_BROWSER_CHANNEL=msedge` to use an installed Edge, or `DAY_BY_DAY_BROWSER_OUTPUT` to a folder to keep the screenshots. These tests use sample tasks and simulated files, never your own.

## Manual checklist before a release

Use a test JSON file in a test folder, never your everyday task file. Open the downloaded `Day-by-Day.html` directly, the way users do.

**File autosave (Chrome or Edge)**

- [ ] **Set up autosave**, change a task, and wait for **Saved to**. Close and reopen the HTML. The tasks load without a prompt when the browser kept permission.
- [ ] Remove the site's file permission in browser settings, then make a change. Saving pauses. **Reconnect task file** asks for access and saves.
- [ ] Clear the browser's site data. **Open task file**, select the same JSON, and check tasks and history come back.
- [ ] Make the JSON read-only, then make a change. The status says the change isn't saved, and **Retry file save** appears. Make it writable again and select **Retry file save**. Check the file on disk has the change.
- [ ] With the app open, edit the JSON in a text editor and save it. The next change pauses saving instead of overwriting it. **Reconnect task file** asks which copy to keep. Try both answers and Cancel.
- [ ] **Disconnect**, then check the JSON file is still on disk.

**Recovery copies (Chrome or Edge)**

- [ ] Open **Recovery copies**, choose a test folder, and check a first copy appears in its **Day-by-Day recovery copies** folder.
- [ ] Delete a task, then **Show copies** and **Restore** the "before deleting a task" copy. The app asks first, and the task comes back.
- [ ] Close and reopen the HTML. The panel shows **On**, or **Paused** if the browser didn't keep folder access. In that case **Turn copies back on** asks again.
- [ ] Remove the folder's permission in browser settings, then make a change. The panel shows **Paused**, and the task still saves.
- [ ] Put an unrelated file in the copies folder, make more than 20 copies, and check only the oldest copies were removed.

**Everything else**

- [ ] Add a timed task with a reminder a few minutes ahead. The in-app reminder appears. With desktop alerts allowed, a desktop notification appears too.
- [ ] Using only the keyboard, add, edit, cancel, and complete tasks. Focus returns to a sensible place each time.
- [ ] Repeat a few steps in a narrow window, in dark mode, and with reduced motion turned on in the system settings.

**Known Edge issue**

The checklist has sometimes stopped accepting clicks or focus in Edge. Passing other checks doesn't prove it fixed. In Edge, switch dates and views, open and close dialogs, complete and reorder tasks, resize the window, and put the computer to sleep and wake it. If clicks stop working, write down the Edge version and the exact steps.
