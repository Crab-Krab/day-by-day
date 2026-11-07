'use strict';
// File contents are the durable store. IndexedDB remembers only the connection
// and the last synchronized state; losing browser data never deletes the file.
window.createTaskFileStorage = function ({ getData, validate, applyData, backup, hasRecovery, keepCopy = () => {}, waitForEditor = () => null }) {
  const $ = id => document.getElementById(id);
  const supported = window.isSecureContext && typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
  const fileTypes = [{ description: 'Day by Day tasks', accept: { 'application/json': ['.json'] } }];
  let handle = null, rawBaseline = null, baseline = null, dirty = false, writing = null;
  let busy = false, paused = false, remembered = true, choiceResolve = null, initialized = false;
  let dbPromise = null, hasSaved = false;
  function showDetails(expanded = true) {
    $('taskFileDetails').hidden = !expanded;
    $('manageTaskFile').setAttribute('aria-expanded', String(expanded));
    $('manageTaskFile').textContent = expanded ? 'Hide details' : 'Manage';
  }
  $('manageTaskFile').onclick = () => showDetails($('taskFileDetails').hidden);
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
  function idleStatus() { status('Keep your tasks in a file', 'Set up autosave once, or open your existing JSON task file. The file stays on your computer when browser data is cleared.'); }
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
    });
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
    if (file.size > 10000000) throw new Error('Choose a Day by Day JSON file smaller than 10 MB.');
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
    const message = error?.name === 'NotAllowedError' ? 'File access needs your permission again. Reconnect to continue saving.'
      : error?.name === 'NotFoundError' ? 'The task file was moved or removed. Open it at its new location, or disconnect and set up a new file.'
      : error?.message || 'The file could not be saved. Reconnect and try again.';
    status(dirty ? 'Changes not saved to file' : 'Task file needs attention', message + ' Your current tasks remain available here; Back up tasks can save a separate copy.', 'error');
  }
  async function withFileLock(callback) {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('day-by-day.task-file.write', callback);
    return callback();
  }
  async function writeSnapshot(text) {
    if (new Blob([text]).size > 10000000) throw new Error('These tasks exceed the 10 MB task-file limit. Export a backup and reduce the task data before saving.');
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
    if (disk.canonical !== null && (hasRecovery() || (disk.canonical !== current &&
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
    const oldHandle = handle;
    try {
      // Invoke the picker synchronously in the click's activation, before any await.
      const target = creating
        ? await window.showSaveFilePicker({ id: 'day-by-day-tasks', suggestedName: 'Day-by-Day-data.json', types: fileTypes })
        : (await window.showOpenFilePicker({ id: 'day-by-day-tasks', multiple: false, types: fileTypes }))[0];
      if (await target.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow editing access to enable automatic saving.');
      const attached = await attach(target, { creating });
      if (!attached && oldHandle) { paused = true; status('Task file paused', 'Your current tasks have been kept. Reconnect to continue saving.', 'error'); }
    } catch (error) {
      if (error.name !== 'AbortError') fail(error);
    } finally {
      setBusy(false);
      if (handle && !paused) { if (dirty) await flush(); else savedStatus(); }
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
      status('File autosave needs Chrome or Edge', 'Open this HTML file in a current desktop Chrome or Edge browser. Browser saving and manual backup still work here. Workplace policies may restrict file access.', 'unsupported');
      initialized = true; return;
    }
    // The remembered connection may be slow. Keep the checklist usable; attach()
    // waits for an open editor, then compares the latest browser and file copies.
    setBusy(true, false);
    status('Looking for your task file…', 'Checking the connection saved in this browser.');
    let failed = false;
    try {
      const record = await connection('get');
      if (record?.handle) {
        handle = record.handle; baseline = record.baseline ?? null; paused = true;
        if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
          await attach(handle, { automatic: true, knownBaseline: baseline });
        }
      }
    } catch (error) { if (handle) { fail(error); failed = true; } else remembered = false; }
    finally {
      setBusy(false); initialized = true;
      if (handle && !paused) { if (dirty) await flush(); else savedStatus(); }
      else if (handle && !failed) status('Reconnect ' + handle.name, 'Your task file is remembered. Click Reconnect task file and allow access to load it and resume saving.', 'error');
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
  return { init, changed, flush, retry, showDetails, ownsCache: () => Boolean(handle) || !initialized,
    isConnected: () => Boolean(handle), isPending: () => dirty || Boolean(writing) };
};
