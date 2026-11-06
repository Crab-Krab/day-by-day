# Testing Day by Day

Day by Day has three kinds of checks. Each one catches things the others can't.

| Check | How to run it | What it covers |
| --- | --- | --- |
| Automated tests | `npm test` (GitHub runs them on every push) | Scheduling, history, saving, and the app's screens in a simulated browser |
| Browser checks | `npm run preview`, then open the printed browser-checks address and select **Run browser checks** | The real built app in a real browser: adding, editing, reloading, the calendar keyboard, Retry saving, two tabs, and Move to tomorrow links |
| Manual checklist | Below, before a release | File permission prompts and other browser behavior that can't be automated |

Run the browser checks in desktop Chrome or Edge, and in Firefox when a change touches the calendar, dialogs, or saving. They use only the preview page's own storage, put back whatever was there, and never touch your everyday tasks. Stop the preview with Ctrl+C.

## Manual checklist before a release

Use a test JSON file in a test folder, never your everyday task file. Open the downloaded `Day-by-Day.html` directly, the way users do.

**File autosave (Chrome or Edge)**

- [ ] **Set up autosave**, change a task, and wait for **Saved to**. Close and reopen the HTML. The tasks load without a prompt when the browser kept permission.
- [ ] Remove the site's file permission in browser settings, then make a change. Saving pauses. **Reconnect task file** asks for access and saves.
- [ ] Clear the browser's site data. **Open task file**, select the same JSON, and check tasks and history come back.
- [ ] Make the JSON read-only, then make a change. The status says the change isn't saved, and **Retry file save** appears. Make it writable again and select **Retry file save**. Check the file on disk has the change.
- [ ] With the app open, edit the JSON in a text editor and save it. The next change pauses saving instead of overwriting it. **Reconnect task file** asks which copy to keep. Try both answers and Cancel.
- [ ] **Disconnect**, then check the JSON file is still on disk.

**Everything else**

- [ ] Add a timed task with a reminder a few minutes ahead. The in-app reminder appears. With desktop alerts allowed, a desktop notification appears too.
- [ ] Using only the keyboard, add, edit, cancel, and complete tasks. Focus returns to a sensible place each time.
- [ ] Repeat a few steps in a narrow window, in dark mode, and with reduced motion turned on in the system settings.

**Known Edge issue**

The checklist has sometimes stopped accepting clicks or focus in Edge. Passing other checks doesn't prove it fixed. In Edge, switch dates and views, open and close dialogs, complete and reorder tasks, resize the window, and put the computer to sleep and wake it. If clicks stop working, write down the Edge version and the exact steps.
