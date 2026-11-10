# Automatically save your tasks to a file

Use the updated Day-by-Day.html in current desktop Chrome or Edge. No installation, account, server, or internet connection is needed. Workplace policies can restrict direct file access.

## First setup

1. Keep the HTML in a permanent folder. If tasks are in an older copy, export a backup from that copy before replacing it.
2. If your tasks are already visible, click **Create new task file**. Save the suggested file, named like **Day-by-Day-tasks-2026-11-10.json**, in a permanent local folder such as Documents. Avoid temporary folders.
3. If you already have a task JSON or exported backup, click **Open task file** and select it instead. Never pick an existing task file in the **Create new task file** dialog: saving over a file empties it before the app can read it. That file becomes the live autosave file; make a separate copy first if you want to keep the original backup unchanged.
4. Allow editing when the browser asks. If offered **Allow on every visit**, this can make reopening smoother.
5. Make changes normally. Each task change starts a save automatically. Wait for **Saved to** and your file's name before closing the tab or signing out.

Only the HTML needs to be opened. Do not open or edit the JSON manually during normal use. The JSON contains your tasks, schedules, completion history, and custom ordering. Appearance, desktop notification permissions, and reminder-delivery history remain browser preferences.

## The next day

- **Connection and permission retained:** tasks load automatically from the file.
- **Connection retained, permission expired:** click **Reconnect task file** and allow access.
- **Browser data cleared:** click **Open task file**, select the same JSON, and allow editing. Tasks load and autosaving resumes. Browser cleanup does not delete the ordinary JSON file.

A standalone HTML file cannot silently locate and reopen an arbitrary file after the browser has forgotten its connection and permission. This app remembers what the browser allows; it does not bypass workplace cleanup policies.

## If saving needs attention

The status above the checklist reports file saves separately from the browser copy. Failed writes do not display a successful save. Keep the tab open and choose **Retry file save** to try again. Retry works only when nothing else changed the file since the last save. Otherwise use **Reconnect task file** to choose which copy to keep. You can also use **Back up tasks** to download a separate recovery copy.

If the file and current tasks differ, the app asks which to keep. **Use file tasks** replaces the tasks currently shown. **Use current tasks** writes the current list to the selected file. **Cancel** preserves both copies. Download current tasks before choosing if you need to keep both. Invalid JSON files are never overwritten by the app.

An interrupted save can leave pending changes in browser storage. On reopening, the app compares the file, the browser copy, and the last synchronized copy. If only the browser copy changed, it saves it without asking. If only the file changed, it loads the file. It asks only when both changed. Changes that never reached disk cannot survive browser cleanup; always wait for the saved status.

Avoid using multiple copies of the app to edit the same JSON simultaneously. Writes are serialized within a tab, and the app checks for external changes before committing a write. A conflicting window pauses rather than silently replacing newer file contents. This is not a multi-user synchronization system.

**Change file** opens another existing task file. **Disconnect** removes the remembered browser connection without deleting the JSON. If the browser cannot forget the connection, the app still disconnects for this visit and says the file may reopen next time. To create a new file after disconnecting, choose **Create new task file**. Keep occasional separate backups; autosaving also saves deliberate deletions and restores.

Firefox and unsupported browsers continue to offer browser saving and manual backup/restore, but cannot use this direct-file autosave feature. If a browser copy cannot be saved, file autosaving can still work. The app explains when it cannot remember the connection for the next visit.

## Recovery copies (optional)

Recovery copies keep up to 20 earlier versions of your tasks in a folder you choose, so you can go back after a mistake long after Undo has gone. They work in desktop Chrome and Edge, with or without file autosave.

1. Open **Recovery copies** under the task-file panel and choose **Choose a folder**. Pick a private folder that stays on your computer, then allow editing.
2. The app saves a first copy right away. After that, it saves a copy at most once an hour while you work, and right before you delete a task, end a routine, restore, or choose which copy to keep.
3. To go back, choose **Show copies**, then **Restore** beside the time you want. The app asks first, and saves a copy of your current tasks before replacing them.

Copies go in a **Day-by-Day recovery copies** folder inside the folder you picked. When there are more than 20, the oldest is removed. The app only ever touches its own copies there, never your other files.

Copies never stop your tasks from saving. If the browser stops allowing the folder, for example after browser cleanup, the panel shows **Paused** and your tasks keep saving as usual. Choose **Turn copies back on** to allow the folder again. **Turn off** stops new copies and leaves existing copies in the folder.

## Updating the app

Wait for a completed file save, then close the old app tab. Replace the HTML in its usual folder with the updated HTML, and reopen it. Select the existing JSON with **Open task file** if needed. No task-data format conversion is required: the app still reads formats 1–5 and writes format 5.
