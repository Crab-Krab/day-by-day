'use strict';
// Optional recovery copies: earlier versions of your tasks, kept in a folder you choose.
// Copies never stop your tasks from saving. If the folder can't be used, copies pause and the panel says so.
window.createRecoveryCopies = function ({ validate, getData, restore, now = () => Date.now() }) {
  const $ = id => document.getElementById(id);
  const FOLDER = 'Day-by-Day recovery copies', KEEP = 20, HOUR = 3600000;
  const LABELS = { first: 'when copies were turned on', hourly: 'hourly copy', delete: 'before deleting a task', 'end-routine': 'before ending a routine', restore: 'before restoring', choice: 'before choosing which copy to keep' };
  // Only files with this exact name pattern are ever listed, restored, or removed.
  const NAME = /^day-by-day-copy-(\d{13})-([a-z-]+)\.json$/;
  const supported = Boolean(window.isSecureContext) && typeof window.showDirectoryPicker === 'function';
  let folder = null, state = 'off', remembered = true, lastCopyAt = 0, lastStamp = 0, queue = Promise.resolve(), dbPromise = null;

  const when = stamp => new Date(stamp).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function show(message) {
    $('recoveryPanel').hidden = !supported;
    $('recoveryPanel').dataset.state = state;
    $('recoveryState').textContent = state === 'on' ? 'On' : state === 'paused' ? 'Paused' : 'Off';
    $('chooseRecoveryFolder').hidden = state === 'on';
    $('chooseRecoveryFolder').textContent = state === 'paused' ? 'Turn copies back on' : 'Choose a folder';
    $('showRecoveryCopies').hidden = state !== 'on';
    $('stopRecoveryCopies').hidden = state === 'off';
    if (state !== 'on') $('recoveryList').replaceChildren();
    if (message !== undefined) $('recoveryStatus').textContent = message;
  }

  // The chosen folder is remembered in browser storage, separately from the task file connection.
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Browser storage unavailable')); return; }
      const request = indexedDB.open('day-by-day.recovery.v1', 1);
      const timer = setTimeout(() => reject(new Error('Browser storage timed out')), 4000);
      request.onupgradeneeded = () => request.result.createObjectStore('folder');
      request.onerror = request.onblocked = () => { clearTimeout(timer); reject(request.error || new Error('Browser storage blocked')); };
      request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  async function stored(action, value) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('folder', action === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('folder');
      const request = action === 'get' ? store.get('active') : action === 'put' ? store.put(value, 'active') : store.delete('active');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Browser storage unavailable'));
    });
  }

  async function directory() {
    if (await folder.queryPermission({ mode: 'readwrite' }) !== 'granted') throw Object.assign(new Error('Folder access ended'), { name: 'NotAllowedError' });
    return folder.getDirectoryHandle(FOLDER, { create: true });
  }
  async function list(dir) {
    const copies = [];
    for await (const [name, handle] of dir.entries()) {
      const match = NAME.exec(name);
      if (match && handle.kind === 'file' && LABELS[match[2]]) copies.push({ name, handle, stamp: Number(match[1]), reason: match[2] });
    }
    return copies.sort((a, b) => b.stamp - a.stamp);
  }
  function pause(error) {
    state = 'paused';
    show(error?.name === 'NotAllowedError'
      ? 'Recovery copies are paused because the browser no longer allows access to the folder. Your tasks still save normally. Choose Turn copies back on.'
      : 'Recovery copies are paused because a copy could not be saved. Your tasks still save normally. Choose Turn copies back on to try again.');
    $('recoveryPanel').open = true;
  }
  async function write(stamp, reason, text) {
    if (state !== 'on') return;
    const dir = await directory(), name = `day-by-day-copy-${stamp}-${reason}.json`;
    const file = await dir.getFileHandle(name, { create: true }), stream = await file.createWritable();
    try { await stream.write(text); await stream.close(); }
    catch (error) { try { await stream.abort(); } catch (_) {} try { await dir.removeEntry(name); } catch (_) {} throw error; }
    // Keep the newest copies only. Other files in the folder are never touched.
    for (const old of (await list(dir)).slice(KEEP)) await dir.removeEntry(old.name);
    show(`Last copy: ${when(stamp)}, ${LABELS[reason]}.`);
  }
  // Takes the copy's contents right away, so a copy made "before" a change really has the earlier tasks.
  function keep(reason, value = getData()) {
    if (state !== 'on' || !LABELS[reason]) return;
    let text;
    try { text = JSON.stringify(validate(value), null, 2) + '\n'; } catch (_) { return; }
    const stamp = lastStamp = Math.max(now(), lastStamp + 1);
    lastCopyAt = stamp;
    queue = queue.then(() => write(stamp, reason, text)).catch(pause);
  }
  function afterSave() { if (state === 'on' && now() - lastCopyAt >= HOUR) keep('hourly'); }

  async function newestStamp() {
    try { return (await list(await directory()))[0]?.stamp || 0; } catch (_) { return 0; }
  }
  $('chooseRecoveryFolder').onclick = async () => {
    try {
      // Turning copies back on asks about the same folder. Otherwise choose one.
      const next = state === 'paused' && folder ? folder : await window.showDirectoryPicker({ id: 'day-by-day-recovery', mode: 'readwrite' });
      if (await next.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Allow editing access to the folder to keep recovery copies.');
      folder = next; state = 'on';
      try { await stored('put', folder); remembered = true; } catch (_) { remembered = false; }
      lastCopyAt = await newestStamp();
      show(`Recovery copies are on, in ${folder.name} / ${FOLDER}.` + (remembered ? '' : ' This browser could not remember the folder, so choose it again next visit.'));
      keep('first');
    } catch (error) { if (error?.name !== 'AbortError') show(error.message); }
  };
  $('stopRecoveryCopies').onclick = async () => {
    folder = null; state = 'off';
    try { await stored('delete'); } catch (_) { /* Nothing is remembered to forget. */ }
    show('Recovery copies are off. Copies already saved stay in the folder.');
  };
  $('showRecoveryCopies').onclick = async () => {
    try {
      const copies = await list(await directory());
      $('recoveryList').replaceChildren(...copies.map(copy => {
        const item = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
        label.textContent = `${when(copy.stamp)}, ${LABELS[copy.reason]}`;
        button.type = 'button'; button.className = 'text-button'; button.textContent = 'Restore';
        button.setAttribute('aria-label', `Restore the copy from ${label.textContent}`);
        button.onclick = async () => {
          try {
            const file = await copy.handle.getFile();
            if (file.size > 10000000) throw new Error('too large');
            const next = validate(JSON.parse(await file.text()));
            await restore(next, `${when(copy.stamp)}, ${LABELS[copy.reason]}`);
          } catch (_) { show('This copy could not be read, so nothing was changed. Choose another copy.'); }
        };
        item.append(label, button); return item;
      }));
      show(copies.length ? 'Choose a copy to restore. You will be asked before anything is replaced.' : 'No copies yet. The first one is saved after your next change.');
    } catch (error) { pause(error); }
  };

  async function init() {
    if (!supported) { show(); return; }
    try {
      const saved = await stored('get');
      if (saved) {
        folder = saved;
        state = await folder.queryPermission({ mode: 'readwrite' }) === 'granted' ? 'on' : 'paused';
        if (state === 'on') lastCopyAt = await newestStamp();
      }
    } catch (_) { folder = null; state = 'off'; }
    show(state === 'paused' ? 'Recovery copies are paused until you allow the folder again. Your tasks still save normally. Choose Turn copies back on.' : state === 'on' ? `Recovery copies are on, in ${folder.name} / ${FOLDER}.` : '');
  }
  return { init, keep, afterSave, isOn: () => state === 'on', settle: () => queue };
};
