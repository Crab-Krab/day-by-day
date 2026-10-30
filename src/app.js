'use strict';
(() => {
  const KEY = 'day-by-day.v1';
  const $ = id => document.getElementById(id);
  const DAYS = Array.from({ length: 7 }, (_, day) => weekdayLabel(day));
  const activeMotion = new WeakMap();
  function motionEnabled() { return typeof $('dailyView').animate === 'function' && (typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function playMotion(element, frames, options = {}) {
    if (!element || !motionEnabled() || typeof element.animate !== 'function') return null;
    activeMotion.get(element)?.cancel();
    const animation = element.animate(frames, { duration: 210, easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
    activeMotion.set(element, animation);
    // Release finished effects as well as their tracking entry. In particular, avoid
    // leaving transformed dialog/row layers around after their visual motion ends.
    const forget = () => { if (activeMotion.get(element) === animation) activeMotion.delete(element); };
    animation.finished.then(() => { forget(); animation.cancel(); }, forget);
    return animation;
  }
  function revealView(element) {
    // Keep the interactive checklist outside animated/composited ancestors.
    playMotion(element.id === 'dailyView' ? $('dayTitle') : $('routinesTitle'), [{ opacity: .5 }, { opacity: 1 }]);
  }
  function fadeDayContent() {
    playMotion($('dayTitle'), [{ opacity: .8 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  }
  let dialogClosing = false, dialogCloseMotion = null, dialogCycle = 0, dialogFocusTarget = null;
  function focusTask(id) {
    for (const container of [view === 'routines' ? $('routineList') : $('taskList'), $('overdueList')]) {
      const row = [...container.querySelectorAll('.task-row')].find(item => item.dataset.id === id);
      if (row) { row.querySelector('.edit-task')?.focus({ preventScroll: true }); return true; }
    }
    return false;
  }
  function restoreDialogFocus(cycle) {
    queueMicrotask(() => {
      if (cycle !== dialogCycle || $('taskDialog').open) return;
      if (dialogFocusTarget?.taskId && focusTask(dialogFocusTarget.taskId)) return;
      const fallback = dialogFocusTarget?.fallback;
      if (fallback?.isConnected) fallback.focus({ preventScroll: true });
      else (view === 'routines' ? $('addTask') : $('inlineAdd')).focus({ preventScroll: true });
    });
  }
  function closeTaskDialog() {
    const dialog = $('taskDialog'); if (!dialog.open || dialogClosing) return;
    const cycle = dialogCycle;
    dialogClosing = true; dialog.classList.toggle('is-closing', true);
    const animation = playMotion(dialog, [{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: 'ease-in' });
    if (!animation) { dialog.close(); dialogClosing = false; dialog.classList.toggle('is-closing', false); restoreDialogFocus(cycle); return; }
    dialogCloseMotion = animation;
    animation.finished.catch(() => {}).then(() => {
      if (dialogCloseMotion !== animation) return;
      dialogCloseMotion = null; dialog.close(); dialogClosing = false; dialog.classList.toggle('is-closing', false);
      restoreDialogFocus(cycle);
    });
  }
  function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function weekdayLabel(day, style = 'long') { return new Intl.DateTimeFormat(undefined, { weekday: style }).format(new Date(2026, 0, 4 + day, 12)); }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); const result = new Date(0); result.setHours(12, 0, 0, 0); result.setFullYear(y, m - 1, d); return result; }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' && s <= '9999-12-31' && dateKey(parseDate(s)) === s; }
  function plusDays(d, amount) { const next = new Date(d); next.setDate(next.getDate() + amount); return next; }
  function monday(d) { return plusDays(d, -((d.getDay() + 6) % 7)); }
  function weekdaysOf(task) { return task.weekdays || [task.weekday]; }
  function recurrenceLabel(days) {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && [1, 2, 3, 4, 5].every(day => days.includes(day))) return `Every weekday (${weekdayLabel(1, 'short')}–${weekdayLabel(5, 'short')})`;
    if (days.length === 1) return `Every ${DAYS[days[0]]}`;
    return `Every ${days.map(day => weekdayLabel(day, 'short')).join(', ')}`;
  }
  function routineFields(task) {
    return { title: task.title, description: task.description || '', weekdays: [...weekdaysOf(task)], startDate: task.startDate, time: task.time || null, reminders: [...(task.reminders || [])], reminderFrom: task.reminderFrom || 0 };
  }
  function createRoutine(task, previous, from, completed) {
    const snapshots = {};
    if (previous?.kind === 'once' && (previous.date < from || (completed[previous.date] || []).includes(previous.id))) {
      snapshots[previous.date] = routineFields({ ...previous, weekdays: [parseDate(previous.date).getDay()], startDate: previous.date });
    }
    return { ...task, versions: [{ from, ...routineFields(task) }], snapshots, exceptions: [], endedOn: null };
  }
  function routineVersion(task, date, includeSnapshot = true) {
    if (includeSnapshot && task.snapshots?.[date]) return task.snapshots[date];
    if (!task.versions) return task;
    return task.versions.filter(version => version.from <= date).at(-1) || null;
  }
  function resolveTask(task, date, includeSnapshot = true) {
    if (task.kind !== 'weekly') return task;
    const version = routineVersion(task, date, includeSnapshot);
    return version ? { ...task, ...version } : null;
  }
  function scheduled(task, date, weekday) {
    if (task.kind === 'once') return task.date === date;
    if (task.snapshots?.[date]) return true;
    if ((task.endedOn && date >= task.endedOn) || task.exceptions?.includes(date)) return false;
    const version = routineVersion(task, date);
    return Boolean(version && date >= version.startDate && weekdaysOf(version).includes(weekday ?? parseDate(date).getDay()));
  }
  function completedSnapshots(task, completed, from) {
    const snapshots = { ...task.snapshots };
    for (const [date, ids] of Object.entries(completed)) {
      if (date >= from && ids.includes(task.id) && !snapshots[date]) snapshots[date] = routineFields(routineVersion(task, date) || task);
    }
    return snapshots;
  }
  function reviseRoutine(task, changes, from, completed = {}) {
    const versions = (task.versions || [{ from: '1900-01-01', ...routineFields(task) }]).filter(version => version.from < from);
    const next = routineFields(changes);
    return { ...task, ...next, versions: [...versions, { from, ...next }], snapshots: completedSnapshots(task, completed, from) };
  }
  function orderByIds(tasks, ids) {
    const sorted = sortTasksByTime(tasks);
    if (!ids) return sorted;
    const ranks = new Map(ids.map((id, index) => [id, index]));
    return sorted.sort((a, b) => (ranks.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  function moveOrderedId(ids, id, neighborId, step) {
    if (!ids.includes(id) || !ids.includes(neighborId) || id === neighborId) return ids.slice();
    const next = ids.filter(value => value !== id);
    next.splice(next.indexOf(neighborId) + (step > 0 ? 1 : 0), 0, id);
    return next;
  }
  function lastRoutineDate(task, before) {
    let latest = Object.keys(task.snapshots || {}).filter(date => date < before).sort().at(-1) || null;
    const versions = task.versions || [{ from: '1900-01-01', ...routineFields(task) }];
    const skipped = new Set(task.exceptions || []);
    versions.forEach((version, index) => {
      const until = versions[index + 1]?.from < before ? versions[index + 1].from : before;
      if (until <= version.from) return;
      const end = plusDays(parseDate(until), -1), earliest = version.from > version.startDate ? version.from : version.startDate;
      for (const weekday of version.weekdays) {
        let candidate = dateKey(plusDays(end, -((end.getDay() - weekday + 7) % 7)));
        while (candidate >= earliest && skipped.has(candidate)) candidate = dateKey(plusDays(parseDate(candidate), -7));
        if (candidate >= earliest && (!latest || candidate > latest)) latest = candidate;
      }
    });
    return latest;
  }
  function overdueTasks(tasks, completed, date, now = Date.now()) {
    return tasks.flatMap(source => {
      if (source.kind === 'once' && source.date < date) {
        return (completed[source.date] || []).includes(source.id) ? [] : [source];
      }
      const task = resolveTask(source, date);
      if (!task || !scheduled(source, date) || !validTime(task.time) || dueTime(date, task.time) >= now || (completed[date] || []).includes(task.id)) return [];
      return [{ ...task, date }];
    }).sort((a, b) => a.date.localeCompare(b.date) || taskTimeOrder(a) - taskTimeOrder(b) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  }
  function reorderTasks(tasks, id, neighborId) {
    const from = tasks.findIndex(task => task.id === id), to = tasks.findIndex(task => task.id === neighborId);
    if (from < 0 || to < 0 || from === to) return tasks;
    const ordered = tasks.slice();
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    return ordered;
  }
  function validTime(time) { return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time); }
  function taskTimeOrder(task) { return validTime(task.time) ? Number(task.time.slice(0, 2)) * 60 + Number(task.time.slice(3)) : 1440; }
  function sortTasksByTime(tasks) {
    return tasks.slice().sort((a, b) => taskTimeOrder(a) - taskTimeOrder(b) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  }
  function descriptionPreview(description) {
    const lines = description.split('\n'), firstLines = lines.slice(0, 3).join('\n'), characters = Array.from(firstLines);
    const truncated = lines.length > 3 || characters.length > 240;
    return { text: truncated ? characters.slice(0, 240).join('').trimEnd() : description, truncated };
  }
  function descriptionParts(description) {
    const parts = []; let cursor = 0;
    for (const match of description.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      let link = match[0].replace(/[.,!?;:]+$/, '');
      // Keep balanced URL parentheses, but leave prose punctuation outside the link.
      while (link.endsWith(')') && (link.match(/\)/g) || []).length > (link.match(/\(/g) || []).length) link = link.slice(0, -1);
      try {
        const url = new URL(link);
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        if (match.index > cursor) parts.push({ text: description.slice(cursor, match.index) });
        parts.push({ text: link, href: url.href }); cursor = match.index + link.length;
      } catch (_) { /* Invalid URLs remain plain text. */ }
    }
    if (cursor < description.length) parts.push({ text: description.slice(cursor) });
    return parts;
  }
  function dueTime(date, time) { const due = parseDate(date), [hour, minute] = time.split(':').map(Number); due.setHours(hour, minute, 0, 0); return due.getTime(); }
  function formatTime(time) { const date = parseDate('2026-01-01'), [hour, minute] = time.split(':').map(Number); date.setHours(hour, minute); return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function reminderKey(task, date, offset) { return `${task.id}|${date}|${task.time}|${offset}`; }
  function dueReminders(tasks, completed, seen, now) {
    const results = [], localToday = parseDate(dateKey(new Date(now)));
    // Include tomorrow for reminders before midnight and yesterday for a delayed check after sleep.
    for (const source of tasks) {
      for (const shift of [-1, 0, 1]) {
        const date = dateKey(plusDays(localToday, shift));
        const task = resolveTask(source, date);
        if (!task || !validTime(task.time) || !task.reminders?.length || !scheduled(source, date) || (completed[date] || []).includes(task.id)) continue;
        const dueAt = dueTime(date, task.time);
        if (dueAt <= (task.reminderFrom || 0)) continue;
        if (dueAt < now - 86400000) continue;
        const reached = task.reminders.filter(offset => dueAt - offset * 60000 <= now);
        if (!reached.length) continue;
        // If several intervals elapsed while closed, show one catch-up reminder rather than a burst.
        const offset = Math.min(...reached), key = reminderKey(task, date, offset);
        if (seen[key]) continue;
        results.push({ key, taskId: task.id, date, time: task.time, offset, dueAt, keys: reached.map(value => reminderKey(task, date, value)) });
      }
    }
    return results.sort((a, b) => a.dueAt - b.dueAt);
  }
  function validate(value) {
    if (!value || ![1, 2, 3, 4, 5].includes(value.version) || !Array.isArray(value.tasks) || value.tasks.length > 20000 || !value.completed || typeof value.completed !== 'object' || Array.isArray(value.completed)) throw new Error('Invalid backup format.');
    if (value.sortMode !== undefined && !['due', 'manual'].includes(value.sortMode)) throw new Error('Invalid task sort mode.');
    function fields(t, weekly) {
      if (!t || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 200) throw new Error('Invalid task name.');
      const description = t.description === undefined ? '' : t.description;
      if (typeof description !== 'string' || description.length > 5000) throw new Error('Invalid task description.');
      const time = t.time == null || t.time === '' ? null : t.time;
      if (time !== null && !validTime(time)) throw new Error('Invalid task time.');
      const reminderFrom = t.reminderFrom === undefined ? 0 : t.reminderFrom;
      if (!Number.isFinite(reminderFrom) || reminderFrom < 0) throw new Error('Invalid reminder start.');
      const rawReminders = t.reminders === undefined ? [] : t.reminders;
      if (!Array.isArray(rawReminders) || rawReminders.length > 4 || rawReminders.some(offset => ![5, 15, 30, 60].includes(offset))) throw new Error('Invalid reminder intervals.');
      const result = { title: t.title.trim(), description, time, reminderFrom, reminders: time === null ? [] : [...new Set(rawReminders)].sort((a, b) => b - a) };
      if (weekly) {
        const days = t.weekdays === undefined ? [t.weekday] : t.weekdays;
        if (!Array.isArray(days) || !days.length || days.length > 7 || days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || !validDate(t.startDate)) throw new Error('Invalid routine schedule.');
        result.weekdays = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        result.startDate = t.startDate;
      }
      return result;
    }
    const ids = new Set();
    const tasks = value.tasks.map(t => {
      if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(t.id) || ids.has(t.id) || !['once', 'weekly'].includes(t.kind)) throw new Error('Invalid task in backup.');
      ids.add(t.id);
      const task = { id: t.id, kind: t.kind, ...fields(t, t.kind === 'weekly') };
      if (t.kind === 'once') {
        if (!validDate(t.date)) throw new Error('Invalid task date.');
        return { ...task, date: t.date };
      }
      const rawVersions = t.versions === undefined ? [{ from: '1900-01-01', ...routineFields(task) }] : t.versions;
      if (!Array.isArray(rawVersions) || !rawVersions.length || rawVersions.length > 2000) throw new Error('Invalid routine history.');
      let last = '';
      task.versions = rawVersions.map(version => {
        if (!version || !validDate(version.from) || version.from <= last) throw new Error('Invalid routine history dates.');
        last = version.from;
        return { from: version.from, ...fields(version, true) };
      });
      Object.assign(task, routineFields(task.versions.at(-1)));
      const snapshots = t.snapshots === undefined ? {} : t.snapshots;
      if (!snapshots || typeof snapshots !== 'object' || Array.isArray(snapshots) || Object.keys(snapshots).length > 20000) throw new Error('Invalid occurrence history.');
      task.snapshots = {};
      for (const [date, snapshot] of Object.entries(snapshots)) {
        if (!validDate(date)) throw new Error('Invalid occurrence date.');
        task.snapshots[date] = fields(snapshot, true);
      }
      const exceptions = t.exceptions === undefined ? [] : t.exceptions;
      if (!Array.isArray(exceptions) || exceptions.length > 20000 || exceptions.some(date => !validDate(date))) throw new Error('Invalid skipped occurrences.');
      task.exceptions = [...new Set(exceptions)].sort();
      task.endedOn = t.endedOn == null ? null : t.endedOn;
      if (task.endedOn !== null && !validDate(task.endedOn)) throw new Error('Invalid routine end date.');
      return task;
    });
    const completed = {};
    for (const [date, entries] of Object.entries(value.completed)) {
      if (!validDate(date) || !Array.isArray(entries) || entries.length > 20000 || entries.some(id => typeof id !== 'string')) throw new Error('Invalid completion history.');
      completed[date] = [...new Set(entries.filter(id => ids.has(id)))];
    }
    const byId = new Map(tasks.map(task => [task.id, task]));
    for (const [date, entries] of Object.entries(completed)) for (const id of entries) {
      const task = byId.get(id);
      if (task.kind === 'weekly' && !scheduled(task, date) && !task.snapshots[date]) task.snapshots[date] = routineFields(routineVersion(task, date) || task);
    }
    function order(idsToOrder) {
      if (!Array.isArray(idsToOrder) || idsToOrder.length > 20000 || idsToOrder.some(id => typeof id !== 'string')) throw new Error('Invalid custom order.');
      return [...new Set(idsToOrder.filter(id => ids.has(id)))];
    }
    const rawOrders = value.weekdayOrders === undefined ? {} : value.weekdayOrders;
    if (!rawOrders || typeof rawOrders !== 'object' || Array.isArray(rawOrders) || Object.keys(rawOrders).some(day => !/^[0-6]$/.test(day))) throw new Error('Invalid weekday ordering.');
    const weekdayOrders = {};
    for (const [day, entries] of Object.entries(rawOrders)) weekdayOrders[day] = order(entries);
    let routineOrder = value.routineOrder == null ? null : order(value.routineOrder).filter(id => byId.get(id).kind === 'weekly');
    // Preserve older shared custom preferences, then allow each weekday to diverge.
    if (value.weekdayOrders === undefined && value.sortMode === 'manual') {
      for (let day = 0; day < 7; day++) weekdayOrders[day] = tasks.map(task => task.id);
      routineOrder = tasks.filter(task => task.kind === 'weekly').map(task => task.id);
    }
    return { version: 5, tasks, completed, weekdayOrders, routineOrder };
  }
  const empty = () => ({ version: 5, tasks: [], completed: {}, weekdayOrders: {}, routineOrder: null });
  let data = empty(), persistent = true;
  function storageError(message) { persistent = false; $('storageWarning').hidden = false; $('storageWarning').textContent = message; $('saveStatus').textContent = 'Not saved · back up your tasks'; }
  try { const saved = localStorage.getItem(KEY); if (saved) data = validate(JSON.parse(saved)); }
  catch (_) { storageError('Saved tasks could not be loaded. Changes will last only for this session. Back up your tasks before closing, or restore a valid backup.'); }
  let today = dateKey(new Date()), selected = today, month = parseDate(today), view = 'day', editingId = null, editingReadOnly = false;
  let renderedOverdueKey = '';
  function overdueKey(tasks) { return JSON.stringify(tasks.map(task => [task.date, task.id])); }
  const expandedDescriptions = new Set();
  const calendarCounts = new Map();
  const BACKUP_KEY = 'day-by-day.backup.v1';
  let backupStatus = { lastExported: 0, changes: 0, firstChangeAt: 0, snoozedUntil: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
    if (saved && ['lastExported', 'changes', 'firstChangeAt', 'snoozedUntil'].every(key => Number.isFinite(saved[key]) && saved[key] >= 0)) backupStatus = saved;
  } catch (_) { /* Backup status is optional; tasks still load independently. */ }
  function persistBackupStatus() { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(backupStatus)); } catch (_) { /* Keep status in this session. */ } }
  $('protectStorage').hidden = !(typeof navigator !== 'undefined' && navigator.storage?.persist && window.isSecureContext);
  $('protectStorage').onclick = async () => {
    try {
      const granted = await navigator.storage.persist();
      $('storageProtectionStatus').textContent = granted ? 'Browser storage protection granted. Export backups too; clearing browser data can still remove tasks.' : 'The browser did not grant storage protection. Export backups to keep a separate copy.';
    } catch (_) { $('storageProtectionStatus').textContent = 'Storage protection is unavailable for this file or browser. Export backups to keep a separate copy.'; }
    $('statusAnnouncement').textContent = $('storageProtectionStatus').textContent;
  };
  function renderBackupStatus() {
    const text = backupStatus.lastExported ? `Last backup exported ${new Date(backupStatus.lastExported).toLocaleDateString()}` : 'No backup exported in this browser';
    $('lastBackup').textContent = text;
    const oldChanges = backupStatus.firstChangeAt && Date.now() - backupStatus.firstChangeAt >= 7 * 86400000;
    $('backupNotice').hidden = !data.tasks.length || backupStatus.snoozedUntil > Date.now() || !(backupStatus.changes >= 25 || (backupStatus.changes > 0 && oldChanges));
    $('backupNoticeText').textContent = `${text}. You have changes to back up.`;
    localNote.textContent = `${persistent ? 'Saved in this browser' : 'Not saved in this browser'} · ${text}`;
  }
  let toastTimer, undoAction;
  function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-' + name); svg.setAttribute('aria-hidden', 'true'); svg.append(use); return svg; }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function fmt(date, options) { return parseDate(date).toLocaleDateString(undefined, options); }
  function orderedTasks(tasks, date = selected) { return orderByIds(tasks, data.weekdayOrders[parseDate(date).getDay()]); }
  function tasksOn(date) { return orderedTasks(data.tasks.filter(task => scheduled(task, date)).map(task => resolveTask(task, date)), date); }
  function taskCountOn(date) {
    if (!calendarCounts.has(date)) {
      const weekday = parseDate(date).getDay();
      calendarCounts.set(date, data.tasks.reduce((count, task) => count + Number(scheduled(task, date, weekday)), 0));
    }
    return calendarCounts.get(date);
  }
  function isDone(id, date = selected) { return (data.completed[date] || []).includes(id); }
  function save() {
    // Undo is one step, without a timer; the next data change supersedes it.
    undoAction = null; $('undoNotice').hidden = true;
    if (persistent) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); }
      catch (_) { storageError('Your browser could not save these changes. Tasks are available for this session. Use Back up tasks to keep a copy before closing.'); }
    }
    backupStatus.changes++;
    if (!backupStatus.firstChangeAt) backupStatus.firstChangeAt = Date.now();
    persistBackupStatus();
    render();
    renderBackupStatus();
    checkReminders();
  }
  function notify(message, undo) {
    clearTimeout(toastTimer);
    $('statusAnnouncement').textContent = undo ? `${message} Undo is available above the checklist until your next change.` : message;
    const toast = $('toast'); toast.replaceChildren(document.createTextNode(message));
    if (undo) { undoAction = undo; $('undoNotice').hidden = false; $('undoMessage').textContent = message; }
    toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }
  function chooseDate(date) {
    if (!validDate(date)) return;
    const previousView = view, changed = selected !== date || view !== 'day';
    selected = date; month = parseDate(date); view = 'day'; render();
    if (changed) { if (previousView !== 'day') revealView($('dailyView')); else fadeDayContent(); }
  }
  function renderCalendar() {
    $('monthLabel').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12), start = monday(first);
    const grid = $('calendarGrid'), monthKey = `${month.getFullYear()}-${month.getMonth()}`;
    if (grid.dataset.monthKey !== monthKey) { grid.replaceChildren(); grid.dataset.monthKey = monthKey; }
    for (let i = 0; i < 42; i++) {
      const date = plusDays(start, i), key = dateKey(date), count = taskCountOn(key);
      let button = grid.children[i];
      if (!button) { button = el('button', '', date.getDate()); grid.append(button); }
      button.className = [date.getMonth() !== month.getMonth() ? 'outside' : '', key === today ? 'today' : '', key === selected ? 'selected' : '', count ? 'has-tasks' : ''].filter(Boolean).join(' ');
      button.type = 'button'; button.setAttribute('aria-label', `${fmt(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${count} task${count === 1 ? '' : 's'}`);
      button.setAttribute('aria-current', key === today ? 'date' : 'false');
      button.setAttribute('aria-pressed', String(key === selected)); button.onclick = () => chooseDate(key);
    }
  }
  function renderWeek() {
    const start = monday(parseDate(selected)), end = plusDays(start, 6);
    $('weekLabel').textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const strip = $('weekStrip'), weekKey = dateKey(start);
    if (strip.dataset.weekKey !== weekKey) { strip.replaceChildren(); strip.dataset.weekKey = weekKey; }
    for (let i = 0; i < 7; i++) {
      const date = plusDays(start, i), key = dateKey(date);
      let button = strip.children[i];
      if (!button) { button = el('button', 'week-day'); button.append(el('span', 'weekday', weekdayLabel(date.getDay(), 'short')), el('span', 'number', date.getDate())); strip.append(button); }
      button.classList.toggle('active', key === selected); button.classList.toggle('today', key === today);
      button.type = 'button'; button.setAttribute('aria-pressed', String(key === selected)); button.setAttribute('aria-label', fmt(key, { weekday: 'long', month: 'long', day: 'numeric' }));
      button.setAttribute('aria-current', key === today ? 'date' : 'false');
      const dot = button.querySelector('.day-dot');
      if (taskCountOn(key)) { if (!dot) button.append(el('span', 'day-dot')); } else dot?.remove();
      button.onclick = () => chooseDate(key);
    }
  }
  function makeEmpty(routines = false, remainingOverdue = false) {
    const box = el('div', 'empty-state'), illustration = el('div', 'empty-illustration'); illustration.append(icon(routines ? 'repeat' : 'leaf'));
    box.append(illustration, el('h3', '', routines ? 'Find your weekly rhythm.' : remainingOverdue ? 'Your remaining tasks are overdue.' : 'What’s on your list?'), el('p', '', routines ? 'Add the things you do each week.\nThey’ll be ready when the day comes.' : remainingOverdue ? 'You can complete them in the Overdue section above.' : 'No tasks planned for this day.\nStart with one thing you’d like to get done.'));
    box.querySelector('p').style.whiteSpace = 'pre-line';
    if (routines) { const add = el('button', 'outline-button', '+ Add a routine'); add.type = 'button'; add.onclick = () => openTask(null, 'weekly'); box.append(add); }
    return box;
  }
  function taskRow(task, routine = false, peers = [task], occurrenceDate = selected, inOverdue = false) {
    const done = !routine && isDone(task.id, occurrenceDate);
    const overdue = !routine && (inOverdue || occurrenceDate !== selected);
    const pastDue = !routine && task.kind === 'once' && occurrenceDate < today && !done;
    const row = el('div', 'task-row' + (done ? ' done' : ''));
    row.dataset.id = task.id; row.tabIndex = -1;
    if (routine) { const badge = el('div', 'routine-icon'); badge.append(icon('repeat')); row.append(badge); }
    else {
      const check = el('button', 'check-button'); check.type = 'button'; check.setAttribute('aria-label', task.title); check.setAttribute('aria-pressed', String(done)); if (done) check.append(icon('check'));
      check.onclick = () => {
        const completed = new Set(data.completed[occurrenceDate] || []);
        completed.has(task.id) ? completed.delete(task.id) : completed.add(task.id);
        data.completed[occurrenceDate] = [...completed];
        save();
        const updated = [...$('taskList').querySelectorAll('.check-button'), ...$('overdueList').querySelectorAll('.check-button')].find(b => b.dataset.id === task.id);
        (updated || (overdue && !$('overdueSection').hidden ? $('overdueTitle') : $('inlineAdd'))).focus({ preventScroll: true });
      }; check.dataset.id = task.id; row.append(check);
    }
    const copy = el('div', 'task-copy'), name = el('p', 'task-name', task.title), meta = el('div', 'task-meta');
    meta.append(icon(task.kind === 'weekly' ? 'repeat' : 'calendar'), document.createTextNode(task.kind === 'weekly' ? `${recurrenceLabel(weekdaysOf(task))}${routine ? ' · from ' + fmt(task.startDate, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}` : pastDue ? `Due ${fmt(task.date, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'One time'));
    const heading = el('div', 'task-heading'), time = el('span', 'time-badge' + (task.time ? ' timed' : ''), task.time ? formatTime(task.time) : 'All day');
    heading.append(name, time); copy.append(heading, meta);
    if (task.reminders?.length) { const reminder = el('div', 'task-meta reminder-meta'); reminder.append(icon('bell'), document.createTextNode('Remind ' + task.reminders.map(offset => offset === 60 ? '1 hr' : `${offset} min`).join(', ') + ' before')); copy.append(reminder); }
    if (task.description) {
      const description = el('div', 'task-description'), body = el('div', 'description-body'), preview = descriptionPreview(task.description);
      const expansionKey = `${routine ? 'routine' : occurrenceDate}:${task.id}`;
      let expanded = expandedDescriptions.has(expansionKey);
      body.id = `description-${routine ? 'routine' : 'day'}-${task.id}`;
      const toggle = preview.truncated ? el('button', 'description-toggle') : null;
      function showDescription() {
        body.replaceChildren();
        let remaining = expanded || !preview.truncated ? task.description.length : preview.text.length;
        for (const part of descriptionParts(task.description)) {
          const text = part.text.slice(0, remaining); remaining -= text.length;
          if (!text) break;
          // A shortened URL still points to its complete original destination.
          if (part.href) { const link = el('a', '', text); link.href = part.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link); }
          else body.append(document.createTextNode(text));
        }
        if (preview.truncated && !expanded) body.append(document.createTextNode('…'));
        if (toggle) { toggle.textContent = expanded ? 'Show less' : 'Show more'; toggle.setAttribute('aria-expanded', String(expanded)); }
      }
      description.append(body);
      if (toggle) {
        toggle.type = 'button'; toggle.setAttribute('aria-controls', body.id);
        toggle.onclick = () => { expanded = !expanded; if (expanded) expandedDescriptions.add(expansionKey); else expandedDescriptions.delete(expansionKey); showDescription(); };
        description.append(toggle);
      }
      showDescription(); copy.append(description);
    }
    if (pastDue) {
      const moveToday = el('button', 'text-button move-today', 'Move to today'); moveToday.type = 'button';
      moveToday.onclick = () => {
        const previous = task.date;
        data.tasks = data.tasks.map(item => item.id === task.id ? { ...item, date: today, reminderFrom: Date.now() } : item);
        save(); focusTask(task.id);
        notify('Task moved to today.', () => { data.tasks = data.tasks.map(item => item.id === task.id ? { ...item, date: previous, reminderFrom: task.reminderFrom || 0 } : item); });
      };
      copy.append(moveToday);
    }
    if (!routine && task.kind === 'weekly' && !done && occurrenceDate >= today) {
      const skip = el('button', 'text-button skip-task', 'Skip this occurrence'); skip.type = 'button';
      skip.setAttribute('aria-label', `Skip ${task.title} on ${fmt(occurrenceDate, { month: 'short', day: 'numeric' })}`);
      skip.onclick = () => {
        const source = data.tasks.find(item => item.id === task.id);
        source.exceptions = [...new Set([...(source.exceptions || []), occurrenceDate])].sort();
        save(); $('skippedTitle').focus({ preventScroll: true });
        notify('Occurrence skipped. Future repeats are unchanged.', () => { source.exceptions = source.exceptions.filter(date => date !== occurrenceDate); });
      };
      copy.append(skip);
    }
    if (routine && task.endedOn) copy.append(el('p', 'task-meta', `Ends before ${fmt(task.endedOn, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    const nextVersion = routine && task.versions?.find(version => version.from > today);
    if (nextVersion) copy.append(el('p', 'task-meta', `Changes scheduled from ${fmt(nextVersion.from, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    row.append(copy);
    const actions = el('div', 'task-actions'), ordering = el('div', 'task-order'), position = peers.findIndex(peer => peer.id === task.id);
    for (const [direction, step] of [['up', -1], ['down', 1]]) {
      const move = el('button', `icon-button move-task move-${direction}`); move.type = 'button'; move.append(icon('arrow'));
      move.title = `Move ${direction}`; move.setAttribute('aria-label', `Move ${task.title} ${direction}`); move.dataset.move = direction;
      const neighbor = peers[position + step]; move.disabled = !neighbor;
      move.onclick = () => {
        if (!neighbor) return;
        const weekday = parseDate(occurrenceDate).getDay();
        const visible = routine ? peers.map(item => item.id) : tasksOn(occurrenceDate).map(item => item.id);
        const existing = routine ? data.routineOrder : data.weekdayOrders[weekday];
        const base = existing ? [...existing, ...visible.filter(id => !existing.includes(id))] : visible;
        const order = moveOrderedId(base, task.id, neighbor.id, step);
        if (routine) data.routineOrder = order;
        else data.weekdayOrders[weekday] = order;
        save();
        const container = routine ? $('routineList') : overdue ? $('overdueList') : $('taskList');
        const movedRow = [...container.querySelectorAll('.task-row')].find(item => item.dataset.id === task.id);
        const control = movedRow?.querySelector(`[data-move="${direction}"]`);
        if (control && !control.disabled) control.focus({ preventScroll: true }); else movedRow?.focus({ preventScroll: true });
        notify(routine ? `Routine moved ${direction}. Daily orders are unchanged.` : `Task moved ${direction}. This order repeats on ${DAYS[weekday]}.`);
      };
      ordering.append(move);
    }
    const edit = el('button', 'icon-button edit-task'); edit.type = 'button'; edit.append(icon('edit')); edit.setAttribute('aria-label', `Edit ${task.title}`); edit.title = 'Edit task'; edit.onclick = () => openTask(task);
    if (!overdue || occurrenceDate === selected) row.prepend(ordering); actions.append(edit); row.append(actions); return row;
  }
  function render() {
    calendarCounts.clear();
    const overdue = overdueTasks(data.tasks, data.completed, today);
    renderedOverdueKey = overdueKey(overdue);
    const overdueTodayIds = new Set(overdue.filter(task => task.date === today).map(task => task.id));
    const todayTasks = tasksOn(today), overdueToday = todayTasks.filter(task => overdueTodayIds.has(task.id));
    const overdueEarlier = overdue.filter(task => task.date < today);
    $('dailyView').hidden = view !== 'day'; $('routinesView').hidden = view !== 'routines';
    $('todayNav').classList.toggle('active', view === 'day'); $('routinesNav').classList.toggle('active', view === 'routines');
    $('todayCount').textContent = todayTasks.filter(t => !isDone(t.id, today)).length + overdueEarlier.length;
    const activeRoutines = data.tasks.filter(task => task.kind === 'weekly' && (!task.endedOn || task.endedOn > today));
    $('routineCount').textContent = activeRoutines.length;
    $('viewBreadcrumb').textContent = view === 'day' ? 'My day' : 'Weekly routines';
    $('sortDay').hidden = !data.weekdayOrders[parseDate(selected).getDay()];
    $('sortDay').title = `Restore automatic sorting for ${DAYS[parseDate(selected).getDay()]}`;
    $('sortRoutines').hidden = !data.routineOrder;
    $('dateEyebrow').textContent = `${selected === today ? 'TODAY · ' : ''}${fmt(selected, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`;
    $('dayTitle').replaceChildren(document.createTextNode(DAYS[parseDate(selected).getDay()]), el('span', '', '.'));
    $('jumpToday').hidden = selected === today;
    const tasks = selected === today ? todayTasks : tasksOn(selected);
    const unfinished = tasks.filter(t => !isDone(t.id));
    const pending = unfinished.filter(task => selected !== today || !overdueTodayIds.has(task.id)), done = tasks.filter(t => isDone(t.id));
    $('taskTotal').textContent = tasks.length; $('completionText').textContent = tasks.length ? `${done.length} of ${tasks.length} complete` : ''; $('completionText').hidden = !tasks.length;
    $('progressBar').style.width = `${tasks.length ? done.length / tasks.length * 100 : 0}%`;
    $('daySubtitle').textContent = tasks.length && !unfinished.length && (selected !== today || !overdueEarlier.length) ? 'All done for this day. Enjoy a little breathing room.' : 'A fresh day. A little space to get things done.';
    const list = $('taskList'); list.replaceChildren();
    if (!tasks.length || (!pending.length && !done.length)) list.append(makeEmpty(false, selected === today && overdueToday.length > 0));
    pending.forEach(task => list.append(taskRow(task, false, pending)));
    if (done.length) { list.append(el('div', 'section-label', `COMPLETED · ${done.length}`)); done.forEach(task => list.append(taskRow(task, false, done))); }
    $('overdueSection').hidden = selected !== today || !overdue.length;
    $('overdueCount').textContent = overdue.length;
    $('overdueList').replaceChildren(...overdueEarlier.map(task => taskRow(task, false, [task], task.date, true)), ...overdueToday.map(task => taskRow(task, false, overdueToday, today, true)));
    const skipped = data.tasks.filter(task => task.kind === 'weekly' && task.exceptions?.includes(selected) && (!task.endedOn || selected < task.endedOn));
    $('skippedSection').hidden = !skipped.length;
    $('skippedList').replaceChildren(...skipped.map(task => {
      const item = el('div', 'history-item'), version = resolveTask(task, selected) || task;
      item.append(el('span', '', version.title));
      const restore = el('button', 'text-button restore-occurrence', 'Restore occurrence'); restore.type = 'button';
      restore.onclick = () => { task.exceptions = task.exceptions.filter(date => date !== selected); save(); focusTask(task.id); notify('Occurrence restored.'); };
      item.append(restore); return item;
    }));
    const routines = orderByIds(activeRoutines.map(task => resolveTask(task, today, false) || resolveTask(task, task.versions?.[0].from || today, false) || task), data.routineOrder);
    $('routineList').replaceChildren(...(routines.length ? routines.map(t => taskRow(t, true, routines)) : [makeEmpty(true)]));
    const ended = data.tasks.filter(task => task.kind === 'weekly' && task.endedOn && task.endedOn <= today);
    $('endedRoutines').hidden = !ended.length; $('endedCount').textContent = ended.length;
    $('endedRoutineList').replaceChildren(...ended.map(task => {
      const item = el('div', 'history-item');
      const historical = resolveTask(task, dateKey(plusDays(parseDate(task.endedOn), -1)), false) || task;
      item.append(el('span', '', `${historical.title} · Ended ${fmt(task.endedOn, { month: 'short', day: 'numeric', year: 'numeric' })}`));
      const history = el('button', 'text-button', 'View history'); history.type = 'button';
      history.onclick = () => chooseDate(lastRoutineDate(task, task.endedOn) || task.endedOn);
      item.append(history); return item;
    }));
    renderCalendar(); renderWeek();
  }
  const weekdayInputs = [...document.querySelectorAll('input[name="weekdays"]')];
  weekdayInputs.forEach(input => {
    input.setAttribute('aria-label', DAYS[Number(input.value)]);
    const label = input.parentElement?.querySelector('span');
    if (label) label.textContent = weekdayLabel(Number(input.value), 'short');
  });
  [...document.querySelector('.calendar-weekdays').querySelectorAll('span')].forEach((span, index) => { span.textContent = weekdayLabel((index + 1) % 7, 'narrow'); });
  const reminderInputs = [...document.querySelectorAll('input[name="reminders"]')];
  function updateTimingFields() {
    const timed = $('taskForm').elements.timing.value === 'timed';
    $('taskTimingFields').hidden = !timed; $('taskTime').required = timed; $('taskTime').disabled = !timed;
    reminderInputs.forEach(input => { input.disabled = !timed; });
    updateNotificationStatus();
  }
  function selectedWeekdays() { return weekdayInputs.filter(input => input.checked).map(input => Number(input.value)); }
  function selectWeekdays(days) { weekdayInputs.forEach(input => { input.checked = days.includes(Number(input.value)); }); }
  function updateHint() {
    const weekly = $('taskForm').elements.kind.value === 'weekly'; $('dateFieldLabel').textContent = weekly ? 'Starting on' : 'Date';
    $('weeklyDays').hidden = !weekly;
    const source = data.tasks.find(task => task.id === editingId);
    const converting = source?.kind === 'once' && weekly;
    $('routineChanges').hidden = !(source?.kind === 'weekly' && weekly);
    const date = $('taskDate').value;
    const begins = converting && date < today ? today : date;
    const days = selectedWeekdays();
    $('scheduleHint').textContent = validDate(date) ? weekly ? days.length ? `${recurrenceLabel(days)}, starting ${fmt(begins, { month: 'short', day: 'numeric', year: 'numeric' })}. Each date has its own checkbox.${converting ? ' This converts your one-time task. An earlier or completed original occurrence stays in history.' : editingId ? ' Earlier dates and completed occurrences keep their saved details.' : ''}` : 'Select at least one day for this routine.' : `Only on ${fmt(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}.` : 'Choose a date for this task.';
    $('workdaysPreset').setAttribute('aria-pressed', String(days.length === 5 && [1, 2, 3, 4, 5].every(day => days.includes(day))));
    $('everydayPreset').setAttribute('aria-pressed', String(days.length === 7));
  }
  function openTask(task = null, kind = 'once') {
    const source = task ? data.tasks.find(item => item.id === task.id) || task : null;
    const effective = selected < today ? today : selected;
    editingReadOnly = Boolean(source?.kind === 'weekly' && source.endedOn && source.endedOn <= today);
    if (source?.kind === 'weekly') task = resolveTask(source, editingReadOnly ? selected : effective, editingReadOnly) || source;
    dialogCycle++;
    dialogFocusTarget = { taskId: task?.id, fallback: document.activeElement };
    dialogCloseMotion?.cancel(); dialogCloseMotion = null; dialogClosing = false; $('taskDialog').classList.toggle('is-closing', false);
    editingId = task?.id || null; $('taskForm').reset(); $('formError').textContent = '';
    $('dialogTitle').textContent = task ? 'Edit task' : 'Add a task'; $('saveTask').textContent = task ? 'Save changes' : 'Add task'; $('deleteTask').hidden = !task;
    $('deleteTask').textContent = task?.kind === 'weekly' ? 'End routine' : 'Delete task';
    [...$('taskForm').elements.kind].forEach(input => { input.disabled = source?.kind === 'weekly'; });
    $('taskEffectiveDate').value = effective; $('taskEffectiveDate').min = today;
    $('taskTitle').value = task?.title || ''; $('taskDescription').value = task?.description || ''; $('taskForm').elements.kind.value = task?.kind || kind;
    const date = task ? task.kind === 'weekly' ? task.startDate : task.date : selected;
    $('taskDate').value = date;
    selectWeekdays(task?.kind === 'weekly' ? weekdaysOf(task) : [parseDate(date).getDay()]);
    $('taskForm').elements.timing.value = task?.time ? 'timed' : 'allday'; $('taskTime').value = task?.time || '';
    reminderInputs.forEach(input => { input.checked = (task?.reminders || []).includes(Number(input.value)); });
    updateTimingFields();
    updateHint();
    for (const id of ['taskTitle', 'taskDescription', 'taskDate', 'taskTime', 'taskEffectiveDate']) $(id).disabled = editingReadOnly || (id === 'taskTime' && !task?.time);
    weekdayInputs.forEach(input => { input.disabled = editingReadOnly; });
    reminderInputs.forEach(input => { input.disabled = editingReadOnly || !task?.time; });
    [...$('taskForm').elements.timing].forEach(input => { input.disabled = editingReadOnly; });
    $('workdaysPreset').disabled = $('everydayPreset').disabled = editingReadOnly;
    $('saveTask').hidden = editingReadOnly;
    $('cancelDialog').textContent = editingReadOnly ? 'Close' : 'Cancel';
    if (editingReadOnly) {
      $('dialogTitle').textContent = 'Routine history';
      $('deleteTask').hidden = true; $('routineChanges').hidden = true;
      $('scheduleHint').textContent = 'This routine has ended. Saved occurrences and completion history are kept for reference.';
    }
    $('taskDialog').showModal();
    playMotion($('taskDialog'), [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    (editingReadOnly ? $('cancelDialog') : $('taskTitle')).focus();
  }
  $('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('taskTitle').value.trim();
    const description = $('taskDescription').value.trim();
    const kind = $('taskForm').elements.kind.value;
    const date = $('taskDate').value;
    if (dialogClosing) return;
    if (editingReadOnly) return;
    if (!title) { $('formError').textContent = 'Give your task a name.'; $('taskTitle').focus(); return; }
    if (description.length > 5000) { $('formError').textContent = 'Use up to 5,000 characters for the description.'; $('taskDescription').focus(); return; }
    if (!validDate(date)) { $('formError').textContent = 'Choose a valid date.'; return; }
    const weekdays = selectedWeekdays();
    if (kind === 'weekly' && !weekdays.length) { $('formError').textContent = 'Select at least one day for this routine.'; weekdayInputs[0].focus(); return; }
    const time = $('taskForm').elements.timing.value === 'timed' ? $('taskTime').value : null;
    if (time !== null && !validTime(time)) { $('formError').textContent = 'Choose a valid time, or select All day.'; $('taskTime').focus(); return; }
    const reminders = time ? reminderInputs.filter(input => input.checked).map(input => Number(input.value)).sort((a, b) => b - a) : [];
    const id = editingId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `t${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const previous = data.tasks.find(task => task.id === editingId);
    const effective = $('taskEffectiveDate').value;
    if (previous?.kind === 'weekly' && kind !== 'weekly') { $('formError').textContent = 'Create a separate one-time task and end this routine to keep its history.'; return; }
    if (previous?.kind === 'weekly' && (!validDate(effective) || effective < today || (previous.endedOn && effective >= previous.endedOn))) { $('formError').textContent = 'Choose a changes-from date on or after today and before the routine ends.'; $('taskEffectiveDate').focus(); return; }
    const scheduleChanged = !previous || previous.time !== time || previous.kind !== kind || (previous.kind === 'once' ? previous.date !== date : previous.startDate !== date || JSON.stringify(previous.weekdays) !== JSON.stringify(weekdays));
    const reminderFrom = scheduleChanged ? Date.now() : (previous.reminderFrom || 0);
    const task = { id, title, description, kind, time, reminders, reminderFrom, ...(kind === 'weekly' ? { weekdays, startDate: date } : { date }) };
    const converted = previous?.kind === 'once' && kind === 'weekly';
    const begins = converted && date < today ? today : date;
    const record = kind === 'weekly' ? previous?.kind === 'weekly' ? reviseRoutine(previous, task, effective, data.completed) : createRoutine(task, previous, begins, data.completed) : task;
    dialogFocusTarget = { taskId: id };
    const wasEditing = Boolean(editingId);
    if (wasEditing) data.tasks = data.tasks.map(t => t.id === id ? record : t);
    else data.tasks.push(record);
    closeTaskDialog();
    if (!wasEditing || converted) {
      let first = parseDate(begins);
      if (kind === 'weekly') {
        while (!weekdays.includes(first.getDay())) first = plusDays(first, 1);
      }
      selected = dateKey(first);
      month = first;
      view = 'day';
    }
    save();
    if (converted) {
      notify('One-time task converted to a weekly routine.', () => { data.tasks = data.tasks.map(item => item.id === id ? previous : item); selected = previous.date; month = parseDate(selected); view = 'day'; });
    } else notify(wasEditing && kind === 'weekly' ? `Routine changes apply from ${fmt(effective, { month: 'short', day: 'numeric', year: 'numeric' })}. History is preserved.` : wasEditing ? 'Task updated.' : kind === 'weekly' ? 'Your weekly routine is ready.' : 'Task added to your day.');
  });
  $('taskDate').onchange = updateHint;
  [...$('taskForm').elements.kind].forEach(radio => radio.onchange = updateHint);
  [...$('taskForm').elements.timing].forEach(radio => radio.onchange = updateTimingFields);
  weekdayInputs.forEach(input => { input.onchange = () => { $('formError').textContent = ''; updateHint(); }; });
  $('workdaysPreset').onclick = () => { selectWeekdays([1, 2, 3, 4, 5]); $('formError').textContent = ''; updateHint(); };
  $('everydayPreset').onclick = () => { selectWeekdays([1, 2, 3, 4, 5, 6, 0]); $('formError').textContent = ''; updateHint(); };
  $('deleteTask').onclick = () => {
    if (dialogClosing || editingReadOnly) return;
    const task = data.tasks.find(t => t.id === editingId), index = data.tasks.findIndex(t => t.id === editingId); if (!task) return;
    if (task.kind === 'weekly') {
      const effective = $('taskEffectiveDate').value;
      if (!validDate(effective) || effective < today) { $('formError').textContent = 'Choose an end date on or after today.'; $('taskEffectiveDate').focus(); return; }
      const previousEnd = task.endedOn;
      const previousSnapshots = task.snapshots;
      task.snapshots = completedSnapshots(task, data.completed, effective);
      task.endedOn = effective;
      dialogFocusTarget = { fallback: $('addTask') };
      closeTaskDialog(); save();
      notify(`Routine ends before ${fmt(effective, { month: 'short', day: 'numeric', year: 'numeric' })}. Earlier days and completion history are kept.`, () => { task.endedOn = previousEnd; task.snapshots = previousSnapshots; });
      return;
    }
    dialogFocusTarget = { taskId: data.tasks[index + 1]?.id || data.tasks[index - 1]?.id };
    data.tasks.splice(index, 1); closeTaskDialog(); save(); notify(task.kind === 'weekly' ? 'Weekly routine deleted.' : 'Task deleted.', () => { data.tasks.splice(index, 0, task); });
  };
  for (const id of ['closeDialog', 'cancelDialog']) $(id).onclick = closeTaskDialog;
  $('taskDialog').addEventListener('cancel', event => { event.preventDefault(); closeTaskDialog(); });
  $('addTask').onclick = () => openTask(null, view === 'routines' ? 'weekly' : 'once'); $('inlineAdd').onclick = () => openTask();
  $('todayNav').onclick = $('jumpToday').onclick = () => chooseDate(today); document.querySelector('.brand').onclick = event => { event.preventDefault(); chooseDate(today); };
  $('routinesNav').onclick = () => { if (view === 'routines') return; view = 'routines'; render(); revealView($('routinesView')); };
  $('prevWeek').onclick = () => chooseDate(dateKey(plusDays(parseDate(selected), -7))); $('nextWeek').onclick = () => chooseDate(dateKey(plusDays(parseDate(selected), 7)));
  $('sortDay').onclick = () => { delete data.weekdayOrders[parseDate(selected).getDay()]; save(); notify(`Automatic sorting restored for ${DAYS[parseDate(selected).getDay()]}. Other weekdays are unchanged.`); };
  $('sortRoutines').onclick = () => { data.routineOrder = null; save(); notify('Routine catalog sorted by due time. Daily orders are unchanged.'); };
  function shiftMonth(direction) { month = new Date(month.getFullYear(), month.getMonth() + direction, 1, 12); renderCalendar(); playMotion($('calendarGrid'), [{ opacity: .4, transform: `translateX(${direction * 5}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 170 }); }
  $('prevMonth').onclick = () => shiftMonth(-1); $('nextMonth').onclick = () => shiftMonth(1);
  function backup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = `day-by-day-backup-${today}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupStatus = { lastExported: Date.now(), changes: 0, firstChangeAt: 0, snoozedUntil: 0 };
    persistBackupStatus(); renderBackupStatus();
    notify('Backup export started. Check that the file was saved.');
  }
  $('backupNow').onclick = backup;
  $('backupLater').onclick = () => { backupStatus.snoozedUntil = Date.now() + 86400000; persistBackupStatus(); renderBackupStatus(); };
  $('undoAction').onclick = () => {
    const action = undoAction; undoAction = null; $('undoNotice').hidden = true;
    if (action) { action(); save(); notify('Change undone.'); $('inlineAdd').focus({ preventScroll: true }); }
  };
  $('dismissUndo').onclick = () => { undoAction = null; $('undoNotice').hidden = true; $('inlineAdd').focus({ preventScroll: true }); };
  let restoreDecision = null, restoreFocusTarget = null;
  function confirmRestore() {
    restoreFocusTarget = document.activeElement;
    $('restoreDialog').showModal(); $('cancelRestore').focus();
    return new Promise(resolve => { restoreDecision = resolve; });
  }
  function finishRestore(accepted) {
    $('restoreDialog').close();
    const resolve = restoreDecision; restoreDecision = null; resolve?.(accepted);
    (restoreFocusTarget?.isConnected ? restoreFocusTarget : $('restoreBtn')).focus({ preventScroll: true });
  }
  $('confirmRestore').onclick = () => finishRestore(true);
  $('cancelRestore').onclick = () => finishRestore(false);
  $('restoreDialog').addEventListener('cancel', event => { event.preventDefault(); finishRestore(false); });
  $('backupBtn').onclick = backup; $('restoreBtn').onclick = () => $('restoreFile').click();
  $('restoreFile').onchange = async () => {
    const file = $('restoreFile').files[0]; if (!file) return;
    try {
      if (file.size > 10000000) throw new Error('This file is too large. Choose a Day by Day backup under 10 MB.');
      const next = validate(JSON.parse(await file.text()));
      if (data.tasks.length && !await confirmRestore()) return;
      undoAction = null; $('undoNotice').hidden = true;
      data = next; persistent = true; $('storageWarning').hidden = true; $('saveStatus').textContent = 'Saved in this browser'; save(); notify('Backup restored.');
    } catch (error) { notify(error instanceof SyntaxError ? 'This is not a valid JSON backup.' : error.message); }
    finally { $('restoreFile').value = ''; }
  };
  // Reminder history is separate from tasks, so local alerts do not change backups or manual order.
  const REMINDER_KEY = 'day-by-day.reminders.v1';
  let reminderLogStorage = true, reminderPanelOpen = true;
  function readReminderLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(REMINDER_KEY) || 'null');
      if (!raw || !raw.seen || !Array.isArray(raw.alerts)) return { seen: {}, alerts: [] };
      const seen = {};
      for (const [key, at] of Object.entries(raw.seen)) if (key.length < 200 && Number.isFinite(at) && at > Date.now() - 172800000) seen[key] = at;
      const alerts = raw.alerts.slice(-100).filter(alert => alert && typeof alert.taskId === 'string' && validDate(alert.date) && validTime(alert.time) && [5, 15, 30, 60].includes(alert.offset) && Number.isFinite(alert.dueAt));
      return { seen, alerts };
    } catch (_) { reminderLogStorage = false; return { seen: {}, alerts: [] }; }
  }
  let reminderLog = readReminderLog();
  function persistReminderLog() { try { localStorage.setItem(REMINDER_KEY, JSON.stringify(reminderLog)); } catch (_) { reminderLogStorage = false; } }
  const reminderButton = el('button', 'reminder-center-button'); reminderButton.type = 'button'; reminderButton.title = 'Task reminders'; reminderButton.setAttribute('aria-label', 'Task reminders'); reminderButton.setAttribute('aria-controls', 'reminderPanel'); reminderButton.append(icon('bell'));
  const reminderCount = el('span', 'reminder-count'); reminderCount.hidden = true; reminderButton.append(reminderCount); document.querySelector('.topbar-actions').prepend(reminderButton);
  function taskForAlert(alert) {
    const source = data.tasks.find(task => task.id === alert.taskId);
    return source ? resolveTask(source, alert.date) : null;
  }
  function keepReminder(alert) {
    const task = taskForAlert(alert);
    return task && task.time === alert.time && task.reminders.includes(alert.offset) && scheduled(task, alert.date) && !isDone(task.id, alert.date) && alert.dueAt > (task.reminderFrom || 0) && alert.dueAt >= Date.now() - 86400000;
  }
  function renderReminderPanel() {
    const alerts = reminderLog.alerts.filter(keepReminder);
    reminderCount.hidden = !alerts.length; reminderCount.textContent = alerts.length;
    reminderButton.title = alerts.length ? `${alerts.length} active task reminder${alerts.length === 1 ? '' : 's'}` : 'No active task reminders';
    $('reminderPanel').hidden = !alerts.length || !reminderPanelOpen;
    reminderButton.setAttribute('aria-expanded', String(!$('reminderPanel').hidden));
    document.title = alerts.length ? `(${alerts.length}) Day by Day — Task reminders` : 'Day by Day — Your daily checklist';
    const container = $('reminderAlerts'); container.replaceChildren();
    for (const alert of alerts.slice().sort((a, b) => a.dueAt - b.dueAt)) {
      const task = taskForAlert(alert), card = el('div', 'reminder-card');
      const heading = el('div', 'reminder-card-heading'); heading.append(el('h3', '', task.title));
      const dismiss = el('button', 'icon-button'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', `Dismiss reminder for ${task.title}`); dismiss.append(icon('close'));
      dismiss.onclick = () => { reminderLog.alerts = reminderLog.alerts.filter(item => item.taskId !== alert.taskId || item.date !== alert.date || item.time !== alert.time); persistReminderLog(); renderReminderPanel(); };
      heading.append(dismiss); card.append(heading, el('p', '', `Due ${fmt(alert.date, { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatTime(alert.time)}`));
      const viewTask = el('button', 'text-button', 'View this day'); viewTask.type = 'button'; viewTask.onclick = () => { chooseDate(alert.date); reminderPanelOpen = false; renderReminderPanel(); const row = [...$('taskList').querySelectorAll('.task-row')].find(item => item.dataset.id === alert.taskId); row?.scrollIntoView({ block: 'center', behavior: 'smooth' }); row?.focus({ preventScroll: true }); }; card.append(viewTask); container.append(card);
    }
  }
  reminderButton.onclick = () => { reminderPanelOpen = !reminderPanelOpen; renderReminderPanel(); if (!reminderLog.alerts.length) notify('No active reminders. Add a time and reminder intervals when editing a task.'); };
  $('dismissAllReminders').onclick = () => { reminderLog.alerts = []; persistReminderLog(); renderReminderPanel(); };
  function notificationPermission() { try { return 'Notification' in window && window.isSecureContext ? Notification.permission : 'unsupported'; } catch (_) { return 'unsupported'; } }
  function updateNotificationStatus() {
    const permission = notificationPermission(), button = $('enableNotifications');
    button.hidden = permission === 'granted' || permission === 'denied' || permission === 'unsupported';
    $('notificationStatus').textContent = permission === 'granted' ? 'Desktop alerts are enabled. Reminders also appear inside this app.' : permission === 'denied' ? 'Desktop alerts are blocked by this browser. In-app reminders still work.' : permission === 'unsupported' ? 'Desktop alerts are unavailable here. Reminders will appear inside this app.' : 'Desktop alerts are optional and depend on browser support for local files. In-app reminders work without permission.';
  }
  $('enableNotifications').onclick = async () => { try { await Notification.requestPermission(); } catch (_) { notify('This browser could not enable desktop alerts. In-app reminders still work.'); } updateNotificationStatus(); };
  function showDesktopReminder(events) {
    if (notificationPermission() !== 'granted' || !events.length) return;
    try {
      const first = events[0], task = taskForAlert(first);
      const notice = new Notification(events.length > 1 ? `${events.length} task reminders` : task.title, { body: events.length > 1 ? events.slice(0, 3).map(event => taskForAlert(event)?.title || 'Task').join(' · ') : `Due ${fmt(first.date, { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatTime(first.time)}`, tag: events.length > 1 ? 'day-by-day-reminders' : first.key });
      notice.onclick = () => { window.focus(); chooseDate(first.date); reminderPanelOpen = true; renderReminderPanel(); notice.close(); };
    } catch (_) { /* The in-app panel remains available if a local-file notification is refused. */ }
  }
  function deliverReminders() {
    if (reminderLogStorage) reminderLog = readReminderLog();
    const before = JSON.stringify(reminderLog), now = Date.now();
    reminderLog.alerts = reminderLog.alerts.filter(keepReminder);
    const events = dueReminders(data.tasks, data.completed, reminderLog.seen, now);
    for (const event of events) {
      event.keys.forEach(key => { reminderLog.seen[key] = now; });
      const alert = { taskId: event.taskId, date: event.date, time: event.time, offset: event.offset, dueAt: event.dueAt };
      const existing = reminderLog.alerts.findIndex(item => item.taskId === event.taskId && item.date === event.date && item.time === event.time);
      if (existing >= 0) reminderLog.alerts[existing] = alert; else reminderLog.alerts.push(alert);
    }
    for (const [key, at] of Object.entries(reminderLog.seen)) if (at < now - 172800000) delete reminderLog.seen[key];
    reminderLog.alerts = reminderLog.alerts.slice(-100);
    if (events.length) { reminderPanelOpen = true; $('reminderAnnouncement').textContent = `${events.length} task reminder${events.length === 1 ? '' : 's'}. ${events.slice(0, 3).map(event => taskForAlert(event)?.title || 'Task').join(', ')}.`; }
    if (JSON.stringify(reminderLog) !== before) { persistReminderLog(); renderReminderPanel(); }
    showDesktopReminder(events);
  }
  let reminderCheckPending = false;
  function checkReminders() {
    // Cooperative serialization prevents two supported tabs from both claiming an alert.
    // Local-file/browser restrictions can disable Web Locks; retain best-effort delivery.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      if (reminderCheckPending) return;
      reminderCheckPending = true;
      navigator.locks.request('day-by-day.reminder-delivery', { ifAvailable: true }, lock => {
        if (lock) deliverReminders();
        else { reminderLog = readReminderLog(); renderReminderPanel(); }
      }).catch(() => deliverReminders()).finally(() => { reminderCheckPending = false; });
    } else deliverReminders();
  }
  // Keep separate tabs in step and refresh the current date after midnight or sleep.
  window.addEventListener('storage', event => {
    if (event.key === KEY) {
      try {
        data = event.newValue ? validate(JSON.parse(event.newValue)) : empty();
        undoAction = null;
        $('undoNotice').hidden = true;
        render();
        checkReminders();
      } catch (_) {
        storageError('Tasks changed in another tab but could not be read. Back up your tasks before closing.');
      }
    }
    if (event.key === REMINDER_KEY) {
      reminderLog = readReminderLog();
      renderReminderPanel();
    }
    if (event.key === BACKUP_KEY) {
      try {
        const next = JSON.parse(event.newValue);
        if (next && ['lastExported', 'changes', 'firstChangeAt', 'snoozedUntil'].every(key => Number.isFinite(next[key]) && next[key] >= 0)) {
          backupStatus = next;
          renderBackupStatus();
        }
      } catch (_) { /* Ignore invalid optional status. */ }
    }
  });
  function refreshToday() {
    const now = dateKey(new Date());
    const changedDate = now !== today;
    if (!changedDate && overdueKey(overdueTasks(data.tasks, data.completed, today)) === renderedOverdueKey) return;
    const focused = document.activeElement;
    let focusedRow = focused;
    while (focusedRow && !focusedRow.dataset?.id) focusedRow = focusedRow.parentNode;
    const focusedId = focusedRow?.dataset.id;
    const focusClass = ['check-button', 'edit-task', 'move-up', 'move-down', 'description-toggle', 'skip-task', 'move-today'].find(name => focused?.className?.split(' ').includes(name));
    const followedToday = selected === today;
    today = now;
    if (changedDate && followedToday) { selected = now; month = parseDate(now); }
    render();
    if (focusedId && !$('taskDialog').open) {
      for (const container of [view === 'routines' ? $('routineList') : $('taskList'), $('overdueList')]) {
        const row = [...container.querySelectorAll('.task-row')].find(item => item.dataset.id === focusedId);
        if (row) { (focusClass && row.querySelector('.' + focusClass) || row).focus({ preventScroll: true }); break; }
      }
    }
  }
  setInterval(refreshToday, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshToday(); }); window.addEventListener('focus', refreshToday);
  setInterval(checkReminders, 10000); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); }); window.addEventListener('focus', () => { checkReminders(); updateNotificationStatus(); renderBackupStatus(); });
  // Compact screens keep the calendar and backup controls within reach.
  const calendarToggle = el('button', 'text-button calendar-mobile-toggle', 'Calendar'); calendarToggle.type = 'button'; calendarToggle.style.display = 'none'; calendarToggle.prepend(icon('calendar')); calendarToggle.setAttribute('aria-expanded', 'false'); calendarToggle.onclick = () => { const open = document.querySelector('.sidebar').classList.toggle('mobile-calendar'); calendarToggle.setAttribute('aria-expanded', String(open)); }; document.querySelector('.main-nav').append(calendarToggle);
  const footer = document.querySelector('.main-footer'); const mobileBackup = el('button', 'text-button', 'Back up'); mobileBackup.style.display = 'none'; mobileBackup.onclick = backup; const mobileRestore = el('button', 'text-button', 'Restore'); mobileRestore.style.display = 'none'; mobileRestore.onclick = () => $('restoreFile').click(); footer.append(mobileBackup, mobileRestore);
  const localNote = el('div', 'mobile-storage', 'Saved in this browser · Tasks stay on this device'); localNote.style.display = 'none'; document.querySelector('main').append(localNote);
  render();
  checkReminders(); renderReminderPanel(); updateNotificationStatus(); renderBackupStatus();
  // Pure date helpers are exposed for focused schedule verification.
  window.DayByDay = Object.freeze({ dateKey, parseDate, validDate, plusDays, monday, weekdaysOf, recurrenceLabel, scheduled, resolveTask, reviseRoutine, orderByIds, moveOrderedId, overdueTasks, reorderTasks, validTime, taskTimeOrder, sortTasksByTime, dueTime, reminderKey, dueReminders, validate });
})();
