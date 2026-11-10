'use strict';
// Optional recovery copies: earlier versions of your tasks, kept in a folder you choose.
// Copies never stop your tasks from saving. If the folder can't be used, copies pause and the panel says so.
window.createRecoveryCopies = function ({ sizeLimit, validate, getData, restore, now = () => Date.now(), onAttention = () => {} }) {
  const $ = id => document.getElementById(id);
  const FOLDER = 'Day-by-Day recovery copies', KEEP = 20, HOUR = 3600000, BURST = 5 * 60000;
  // Repeated small actions, like deleting many tasks, make one copy per 5 minutes, so a cleanup can't push out older copies.
  // Copies before replacing the whole task list (restoring, choosing a copy) are always made.
  const THROTTLED = ['delete', 'end-routine'];
  const LABELS = { first: 'when copies were turned on', hourly: 'hourly copy', delete: 'before deleting a task', 'end-routine': 'before ending a routine', restore: 'before restoring', choice: 'before choosing which copy to keep' };
  // Only files with this exact name pattern are ever listed, restored, or removed.
  // New names carry a random part, so two app windows never write the same file. Older names without it still work.
  const NAME = /^day-by-day-copy-(\d{13})(?:-([0-9a-f]{8}))?-([a-z-]+)\.json$/;
  const supported = Boolean(window.isSecureContext) && typeof window.showDirectoryPicker === 'function';
  let folder = null, state = 'off', remembered = true, lastCopyAt = 0, lastStamp = 0, queue = Promise.resolve(), dbPromise = null;
  let pending = 0, lastLine = '';
  const lastBurst = {};

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
    $('recoveryPanel').setAttribute('aria-busy', String(pending > 0));
    if (state === 'paused') { $('recoveryPanel').open = true; onAttention(); }
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
      if (match && handle.kind === 'file' && LABELS[match[3]]) copies.push({ name, handle, stamp: Number(match[1]), reason: match[3] });
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
  function randomPart() {
    const bytes = new Uint8Array(4);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function write(stamp, reason, text) {
    if (state !== 'on') return;
    const dir = await directory(), name = `day-by-day-copy-${stamp}-${randomPart()}-${reason}.json`;
    const file = await dir.getFileHandle(name, { create: true }), stream = await file.createWritable();
    try { await stream.write(text); await stream.close(); }
    catch (error) { try { await stream.abort(); } catch (_) {} try { await dir.removeEntry(name); } catch (_) {} throw error; }
    // Keep the newest copies only. Other files in the folder are never touched.
    for (const old of (await list(dir)).slice(KEEP)) await dir.removeEntry(old.name);
    lastLine = `Last copy: ${when(stamp)}, ${LABELS[reason]}.`;
  }
  // Takes the copy's contents right away, so a copy made "before" a change really has the earlier tasks.
  function keep(reason, value = getData()) {
    if (state !== 'on' || !LABELS[reason]) return;
    let text;
    try { text = JSON.stringify(validate(value), null, 2) + '\n'; } catch (_) { return; }
    if (THROTTLED.includes(reason)) {
      if (now() - (lastBurst[reason] ?? -Infinity) < BURST) return;
      lastBurst[reason] = now();
    }
    const stamp = lastStamp = Math.max(now(), lastStamp + 1);
    lastCopyAt = stamp;
    // The copy is only safe once it's written, so the panel says so and closing the page warns until then.
    pending++;
    show('Saving a recovery copy… Keep this page open until it finishes.');
    queue = queue.then(() => write(stamp, reason, text)).catch(pause).finally(() => {
      pending--;
      if (!pending && state === 'on') show(lastLine);
      else show();
    });
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
            if (file.size > sizeLimit) throw new Error('too large');
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
  return { init, keep, afterSave, isOn: () => state === 'on', isPending: () => pending > 0, settle: () => queue };
};
