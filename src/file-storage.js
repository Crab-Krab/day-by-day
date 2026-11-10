'use strict';
// File contents are the durable store. IndexedDB remembers only the connection
// and the last synchronized state; losing browser data never deletes the file.
window.createTaskFileStorage = function ({ sizeLimit, getData, validate, applyData, backup, hasRecovery, keepCopy = () => {}, waitForEditor = () => null, browserStatus = () => 'Saved in this browser', needsAttention = () => false }) {
  const $ = id => document.getElementById(id);
  const supported = window.isSecureContext && typeof window.showOpenFilePicker === 'function' && typeof window.showDirectoryPicker === 'function';
  const fileTypes = [{ description: 'Day by Day tasks', accept: { 'application/json': ['.json'] } }];
  let handle = null, rawBaseline = null, baseline = null, dirty = false, writing = null;
  let busy = false, paused = false, remembered = true, choiceResolve = null, initialized = false;
  let dbPromise = null, hasSaved = false;
  function showDetails(expanded = true) {
    expanded = expanded || needsAttention();
    $('taskFileDetails').hidden = !expanded;
    $('manageTaskFile').setAttribute('aria-expanded', String(expanded));
    $('manageTaskFile').textContent = expanded ? 'Hide details' : 'Manage';
  }
  $('manageTaskFile').onclick = () => showDetails($('taskFileDetails').hidden);
  $('toggleFileAvailability').onclick = () => {
    const expanded = $('taskFileAvailability').hidden;
    $('taskFileAvailability').hidden = !expanded;
    $('toggleFileAvailability').setAttribute('aria-expanded', String(expanded));
    $('toggleFileAvailability').textContent = expanded ? 'Collapse' : 'Show info';
    $('toggleFileAvailability').setAttribute('aria-label', `${expanded ? 'Collapse' : 'Show'} file autosave availability notice`);
  };
  const snapshot = () => JSON.stringify(validate(getData()));
  const connectionNote = () => remembered ? 'Reopens automatically when the browser keeps access. After browser cleanup, choose Open task file to reconnect.' : 'Saved files stay on disk, but this browser could not remember the connection. Choose Open task file next time.';
  function status(title, detail, state = 'idle') {
    $('taskFileStatus').textContent = title;
    $('taskFileDetail').textContent = detail;
    $('taskFilePanel').dataset.state = state;
    if (state === 'error' || state === 'idle' || state === 'unsupported') showDetails();
    if (state === 'idle' || state === 'unsupported') hasSaved = false;
    if (state === 'saved' && !hasSaved) { showDetails(false); hasSaved = true; }
    // A failed write to an unchanged file can simply be retried. Reconnect handles everything else.
    $('retryTaskFile').hidden = !handle || !paused || !dirty || rawBaseline === null;
    $('reconnectTaskFile').hidden = !handle || !paused;
    $('disconnectTaskFile').hidden = !handle;
    $('createTaskFile').hidden = Boolean(handle);
    $('openTaskFile').textContent = handle && !paused ? 'Change file' : 'Open task file';
    refreshControls();
  }
  function refreshControls() { for (const id of ['retryTaskFile', 'reconnectTaskFile', 'disconnectTaskFile', 'createTaskFile', 'openTaskFile']) $(id).disabled = busy || Boolean(writing) || !supported; }
  function savedStatus() { status('Saved to ' + handle.name, 'Changes save automatically. ' + connectionNote(), 'saved'); }
  function idleStatus() {
    status(browserStatus(), 'Already have a task file? Choose Open task file. Create new task file asks for a folder and makes the file there. The file stays on your computer when browser data is cleared.');
    showDetails(false);
  }
  function refreshBrowserStatus() {
    if (initialized && !handle && ['idle', 'unsupported'].includes($('taskFilePanel').dataset.state)) $('taskFileStatus').textContent = browserStatus();
  }
  function setBusy(value, blockChecklist = true) {
    busy = value;
    document.querySelector('.app-shell').inert = value && blockChecklist;
    refreshControls();
  }
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Connection storage unavailable')); return; }
      const request = indexedDB.open('day-by-day.files.v1', 1);
      const timer = setTimeout(() => reject(new Error('Connection storage timed out')), 4000);
      request.onupgradeneeded = () => request.result.createObjectStore('connections');
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
      request.onblocked = () => { clearTimeout(timer); reject(new Error('Connection storage blocked')); };
      request.onsuccess = () => { clearTimeout(timer); const database = request.result; database.onversionchange = () => database.close(); resolve(database); };
    }).catch(error => { dbPromise = null; throw error; }); // A slow or failed open is tried again next time.
    return dbPromise;
  }
  async function connection(action, value) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('connections', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('connections');
      const request = action === 'get' ? store.get('active') : action === 'put' ? store.put(value, 'active') : store.delete('active');
      const timer = setTimeout(() => { try { tx.abort(); } catch (_) {} reject(new Error('Connection storage timed out')); }, 4000);
      tx.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(tx.error || new Error('Connection storage unavailable')); };
    });
  }
  async function remember() {
    try { await connection('put', { handle, baseline }); remembered = true; }
    catch (_) { remembered = false; }
  }
  async function readFile(target, allowEmpty = false) {
    const file = await target.getFile();
    if (file.size > sizeLimit) throw new Error('Choose a Day by Day JSON file smaller than 10 MB.');
    const raw = await file.text();
    if (!raw.trim() && allowEmpty) return { raw, canonical: null, data: null };
    let data;
    try { data = validate(JSON.parse(raw)); }
    catch (_) { throw new Error('This file is not a valid Day by Day task file. It has not been overwritten.'); }
    return { raw, data, canonical: JSON.stringify(data) };
  }
  function choose(message) {
    $('fileChoiceMessage').textContent = message;
    $('fileChoiceDialog').showModal();
    return new Promise(resolve => { choiceResolve = resolve; });
  }
  function finishChoice(value) {
    $('fileChoiceDialog').close();
    const resolve = choiceResolve; choiceResolve = null; resolve?.(value);
  }
  $('fileChoiceCancel').onclick = () => finishChoice('cancel');
  $('fileChoiceCurrent').onclick = () => finishChoice('current');
  $('fileChoiceDisk').onclick = () => finishChoice('disk');
  $('fileChoiceBackup').onclick = backup;
  $('fileChoiceDialog').addEventListener('cancel', event => { event.preventDefault(); finishChoice('cancel'); });

  function fail(error) {
    paused = Boolean(handle);
    const message = failMessage(error);
    status(dirty ? 'Changes not saved to file' : 'Task file needs attention', message + ' Your current tasks remain available here; Back up tasks can save a separate copy.', 'error');
  }
  function failMessage(error) {
    return error?.name === 'NotAllowedError' ? 'File access needs your permission again. Reconnect to continue saving.'
      : error?.name === 'NotFoundError' ? 'The task file was moved or removed. Open it at its new location, or disconnect and create a new file.'
      : error?.message || 'The file could not be saved. Reconnect and try again.';
  }
  // New files are made inside a chosen folder, never through a Save dialog. Chrome empties a file
  // chosen in a Save dialog before the app can read it, so an existing task file could be wiped.
  // If the folder already has a task file, it is opened and compared like Open task file instead.
  const FILE_NAME = 'Day-by-Day-tasks.json', OLD_FILE_NAME = 'Day-by-Day-data.json';
  async function taskFileIn(folder) {
    for (const name of [FILE_NAME, OLD_FILE_NAME]) {
      // An empty file holds no tasks to protect, so it is filled like a new one.
      try { const target = await folder.getFileHandle(name); return { target, found: (await target.getFile()).size > 0 }; }
      catch (error) { if (error?.name !== 'NotFoundError' && error?.name !== 'TypeMismatchError') throw error; }
    }
    return { target: await folder.getFileHandle(FILE_NAME, { create: true }), found: false };
  }
  async function withFileLock(callback) {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('day-by-day.task-file.write', callback);
    return callback();
  }
  async function writeSnapshot(text) {
    if (new Blob([text]).size > sizeLimit) throw new Error('These tasks exceed the 10 MB task-file limit. Export a backup and reduce the task data before saving.');
    await withFileLock(async () => {
      // Exclusive mode and the second read protect against another writer between
      // our last read and acquiring the writable stream. Never silently overwrite.
      const stream = await handle.createWritable({ mode: 'exclusive' });
      try {
        const current = await (await handle.getFile()).text();
        if (current !== rawBaseline) throw new Error('This file changed elsewhere. Reconnect to choose which tasks to keep.');
        await stream.write(text);
        await stream.close();
      } catch (error) { try { await stream.abort(); } catch (_) {} throw error; }
    });
    rawBaseline = text;
    baseline = snapshotFromText(text);
  }
  function snapshotFromText(text) { return JSON.stringify(validate(JSON.parse(text))); }
  async function flush() {
    if (writing) return writing;
    if (!handle || paused || busy || !dirty) return;
    // Defer the body one microtask so `writing` is assigned before any UI update.
    writing = Promise.resolve().then(async () => {
      try {
        while (dirty && !paused) {
          const text = snapshot();
          status('Saving to ' + handle.name + '…', 'Keep this tab open until Saved appears.', 'saving');
          await writeSnapshot(JSON.stringify(JSON.parse(text), null, 2) + '\n');
          dirty = snapshot() !== text;
          await remember();
        }
      } catch (error) { dirty = true; fail(error); }
    });
    await writing;
    writing = null;
    if (!paused && !dirty) savedStatus();
    else refreshControls();
  }
  function changed() {
    if (!handle) return;
    dirty = true;
    if (paused) status('Changes not saved to file', 'Reconnect your task file to save these changes. Back up tasks can also save a separate copy.', 'error');
    else void flush();
  }
  async function attach(target, { creating = false, automatic = false, knownBaseline = null } = {}) {
    let disk;
    for (;;) {
      disk = await readFile(target, creating);
      const editorClosed = automatic && waitForEditor();
      if (!editorClosed) break;
      status('Finish editing to reconnect ' + target.name, 'Save or cancel the open task first. Your current tasks remain available while the file waits.', 'connecting');
      await editorClosed;
      // Both the file and the browser copy may have changed during editing.
      // Read again, and check for another editor opened before that read finished.
    }
    const current = snapshot();
    const currentHasTasks = getData().tasks.length > 0 || Object.keys(getData().completed).length > 0;
    let decision = creating ? 'current' : 'disk';
    // An unchanged cached copy may safely follow the file. A pending browser copy
    // requires an explicit decision. Missing cache after cleanup is not a deletion.
    const cacheUnchanged = automatic && knownBaseline !== null && current === knownBaseline;
    const pendingCache = automatic && knownBaseline !== null && current !== knownBaseline;
    // When the file still matches the last synced copy, only this browser changed, so
    // its tasks simply continue. An empty browser copy still asks, since browser cleanup looks the same.
    const fileUnchanged = pendingCache && disk.canonical === knownBaseline && currentHasTasks;
    if (fileUnchanged) decision = 'current';
    else if (disk.canonical !== null && (hasRecovery() || (disk.canonical !== current &&
        (creating || (!cacheUnchanged && (currentHasTasks || pendingCache)))))) {
      decision = await choose('“' + target.name + '” and the tasks currently shown are different. ' + (automatic ? 'There may be changes that did not finish saving last time.' : 'Choose the copy you want to continue with.'));
      if (decision === 'cancel') return false;
    }
    // Whichever copy is about to be replaced gets a recovery copy first, when those are on.
    if (disk.canonical !== null && disk.canonical !== current) keepCopy('choice', decision === 'disk' ? getData() : disk.data);
    handle = target; rawBaseline = disk.raw; baseline = disk.canonical;
    paused = false; dirty = decision === 'current' && current !== disk.canonical;
    if (decision === 'disk') applyData(disk.data);
    await remember();
    return true;
  }
  async function pick(creating) {
    if (busy || writing || !supported) return;
    setBusy(true);
    const oldHandle = handle, oldWorking = Boolean(handle) && !paused;
    let keptMessage = null, found = false;
    try {
      // Invoke the picker synchronously in the click's activation, before any await.
      let target;
      if (creating) ({ target, found } = await taskFileIn(await window.showDirectoryPicker({ id: 'day-by-day-tasks-folder', mode: 'readwrite' })));
      else target = (await window.showOpenFilePicker({ id: 'day-by-day-tasks', multiple: false, types: fileTypes }))[0];
      if (await target.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow editing access to enable automatic saving.');
      const attached = await attach(target, { creating: creating && !found });
      // A cancelled switch leaves a working file connected as it was.
      if (!attached && oldHandle && !oldWorking) { paused = true; status('Task file paused', 'Your current tasks have been kept. Reconnect to continue saving.', 'error'); }
      if (!attached && oldWorking) keptMessage = 'The other file was not opened. Your current tasks have been kept.';
    } catch (error) {
      // A rejected new file never pauses the file that was already saving.
      if (error.name !== 'AbortError') { if (oldWorking && handle === oldHandle) keptMessage = failMessage(error); else fail(error); }
      // Chrome reports a refused folder, Don't Allow, and Cancel the same way, so give a hint instead of nothing.
      else if (creating && !handle) status('No folder chosen', 'Chrome doesn\'t allow Documents, Desktop, Downloads or your user folder themselves. Make a folder inside one, such as Documents\\Day by Day, and choose that. Already have a task file? Choose Open task file.', 'idle');
    } finally {
      setBusy(false);
      if (handle && !paused) {
        if (dirty) await flush(); else savedStatus();
        if (found && handle && !paused && !dirty) status('Saved to ' + handle.name, 'That folder already had a task file, so it was opened instead of replaced. Changes save automatically. ' + connectionNote(), 'saved');
        if (keptMessage && handle && !paused && !dirty) status('Still saving to ' + handle.name, keptMessage + ' Changes keep saving to ' + handle.name + '.', 'error');
      }
    }
  }
  async function retry() {
    if (!handle || busy || writing) return;
    setBusy(true);
    let ready = false;
    try {
      if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow editing access to resume automatic saving.');
      // Resume directly only when nothing else changed the file. Otherwise Reconnect asks which copy to keep.
      if ((await readFile(handle, true)).raw !== rawBaseline) throw new Error('This file changed elsewhere. Reconnect to choose which tasks to keep.');
      paused = false; ready = true;
    } catch (error) { fail(error); }
    finally { setBusy(false); }
    if (ready) await flush();
  }
  async function reconnect() {
    if (!handle || busy || writing) return;
    setBusy(true);
    try {
      if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow editing access to resume automatic saving.');
      await attach(handle, { automatic: true, knownBaseline: baseline });
    } catch (error) { fail(error); }
    finally {
      setBusy(false);
      if (!paused) { if (dirty) await flush(); else savedStatus(); }
    }
  }
  async function disconnect() {
    if (busy || writing) return;
    if (dirty && !window.confirm('Some changes are not saved to the task file. Disconnect anyway? Your current tasks stay here; use Back up tasks to keep a separate copy.')) return;
    setBusy(true);
    // Always let go of the file in this tab, even when the browser cannot forget it.
    let forgotten = true;
    try { await connection('delete'); } catch (_) { forgotten = false; }
    const name = handle.name;
    handle = null; baseline = null; rawBaseline = null; dirty = false; paused = false;
    setBusy(false);
    if (forgotten) idleStatus();
    else status('Disconnected for this visit', 'The browser could not forget the connection, so it may reopen ' + name + ' next time. Choose Disconnect again then. The JSON file itself is unchanged.', 'error');
  }
  async function init() {
    if (!supported) {
      $('toggleFileAvailability').hidden = false;
      $('taskFileAvailability').hidden = false;
      $('taskFileAvailability').textContent = 'File autosave unavailable here. Browser saving and backups work.';
      status(browserStatus(), 'File autosave works in current desktop Chrome or Edge. Browser saving and manual backup still work here. Workplace policies may restrict file access.', 'unsupported');
      showDetails(false);
      initialized = true; return;
    }
    // The remembered connection may be slow. Keep the checklist usable; attach()
    // waits for an open editor, then compares the latest browser and file copies.
    setBusy(true, false);
    status('Looking for your task file…', 'Checking the connection saved in this browser.');
    let failed = false, lookupFailed = false;
    try {
      const record = await connection('get');
      if (record?.handle) {
        handle = record.handle; baseline = record.baseline ?? null; paused = true;
        if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
          await attach(handle, { automatic: true, knownBaseline: baseline });
        }
      }
    } catch (error) { if (handle) { fail(error); failed = true; } else { remembered = false; lookupFailed = true; } }
    finally {
      setBusy(false); initialized = true;
      if (handle && !paused) { if (dirty) await flush(); else savedStatus(); }
      else if (handle && !failed) status('Reconnect ' + handle.name, 'Your task file is remembered. Click Reconnect task file and allow access to load it and resume saving.', 'error');
      // A failed lookup is not the same as never having a file, so say so instead of showing first-time setup.
      else if (lookupFailed) status('Could not check for your task file', 'The browser did not answer in time. If you use a task file, choose Open task file to reconnect it, or reload the page to try again.', 'error');
      else if (!handle) idleStatus();
    }
  }
  $('createTaskFile').onclick = () => pick(true);
  $('openTaskFile').onclick = () => pick(false);
  $('retryTaskFile').onclick = retry;
  $('reconnectTaskFile').onclick = reconnect;
  $('disconnectTaskFile').onclick = disconnect;
  window.addEventListener('beforeunload', event => {
    if (dirty || writing || busy) { event.preventDefault(); event.returnValue = ''; }
  });
  // Do not poll or write on unload: writes happen immediately after each edit.
  return { init, changed, flush, retry, showDetails, refreshBrowserStatus, ownsCache: () => Boolean(handle) || !initialized,
    isConnected: () => Boolean(handle), isPending: () => dirty || Boolean(writing) };
};
