'use strict';
(() => {
  const KEY = 'day-by-day.v1';
  const $ = id => document.getElementById(id);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const activeMotion = new WeakMap();
  function motionEnabled() { return typeof $('dailyView').animate === 'function' && (typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function playMotion(element, frames, options = {}) {
    if (!element || !motionEnabled() || typeof element.animate !== 'function') return null;
    activeMotion.get(element)?.cancel();
    const animation = element.animate(frames, { duration: 210, easing: 'cubic-bezier(.2,.7,.2,1)', ...options });
    activeMotion.set(element, animation);
    animation.finished.catch(() => {}).then(() => { if (activeMotion.get(element) === animation) activeMotion.delete(element); });
    return animation;
  }
  function revealView(element, direction = 0) { playMotion(element, [{ opacity: .35, transform: direction ? `translateX(${direction * 9}px)` : 'translateY(7px)' }, { opacity: 1, transform: 'translate(0,0)' }]); }
  function captureTaskPositions() {
    const positions = new Map(); if (!motionEnabled()) return positions;
    for (const container of [$('taskList'), $('routineList')]) for (const row of container.querySelectorAll('.task-row')) {
      const rect = row.getBoundingClientRect(); if (rect.width) positions.set(`${container.id}:${row.dataset.id}`, { top: rect.top, left: rect.left });
    }
    return positions;
  }
  function settleTaskPositions(positions) {
    if (!motionEnabled()) return;
    for (const container of [$('taskList'), $('routineList')]) for (const row of container.querySelectorAll('.task-row')) {
      const rect = row.getBoundingClientRect(); if (!rect.width) continue;
      const previous = positions.get(`${container.id}:${row.dataset.id}`);
      if (previous) {
        const x = previous.left - rect.left, y = previous.top - rect.top;
        if (Math.abs(x) + Math.abs(y) > .5 && Math.abs(y) < 350) playMotion(row, [{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], { duration: 230 });
      } else playMotion(row, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 170 });
    }
  }
  let dialogClosing = false, dialogCloseMotion = null;
  function closeTaskDialog() {
    const dialog = $('taskDialog'); if (!dialog.open || dialogClosing) return;
    dialogClosing = true; dialog.classList.toggle('is-closing', true);
    const animation = playMotion(dialog, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(5px) scale(.985)' }], { duration: 130, easing: 'ease-in' });
    if (!animation) { dialog.close(); dialogClosing = false; dialog.classList.toggle('is-closing', false); return; }
    dialogCloseMotion = animation;
    animation.finished.catch(() => {}).then(() => {
      if (dialogCloseMotion !== animation) return;
      dialogCloseMotion = null; dialog.close(); dialogClosing = false; dialog.classList.toggle('is-closing', false);
    });
  }
  function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); const result = new Date(0); result.setHours(12, 0, 0, 0); result.setFullYear(y, m - 1, d); return result; }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' && s <= '9999-12-31' && dateKey(parseDate(s)) === s; }
  function plusDays(d, amount) { const next = new Date(d); next.setDate(next.getDate() + amount); return next; }
  function monday(d) { return plusDays(d, -((d.getDay() + 6) % 7)); }
  function weekdaysOf(task) { return task.weekdays || [task.weekday]; }
  function recurrenceLabel(days) {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && [1, 2, 3, 4, 5].every(day => days.includes(day))) return 'Every weekday (Mon–Fri)';
    if (days.length === 1) return `Every ${DAYS[days[0]]}`;
    return `Every ${days.map(day => DAYS[day].slice(0, 3)).join(', ')}`;
  }
  function scheduled(task, date) { return task.kind === 'once' ? task.date === date : date >= task.startDate && weekdaysOf(task).includes(parseDate(date).getDay()); }
  function reorderTasks(tasks, id, neighborId) {
    const from = tasks.findIndex(task => task.id === id), to = tasks.findIndex(task => task.id === neighborId);
    if (from < 0 || to < 0 || from === to) return tasks;
    const ordered = tasks.slice();
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    return ordered;
  }
  function validTime(time) { return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time); }
  function dueTime(date, time) { const due = parseDate(date), [hour, minute] = time.split(':').map(Number); due.setHours(hour, minute, 0, 0); return due.getTime(); }
  function formatTime(time) { const date = parseDate('2026-01-01'), [hour, minute] = time.split(':').map(Number); date.setHours(hour, minute); return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function reminderKey(task, date, offset) { return `${task.id}|${date}|${task.time}|${offset}`; }
  function dueReminders(tasks, completed, seen, now) {
    const results = [], localToday = parseDate(dateKey(new Date(now)));
    // Include tomorrow for reminders before midnight and yesterday for a delayed check after sleep.
    for (const task of tasks) {
      if (!validTime(task.time) || !task.reminders?.length) continue;
      for (const shift of [-1, 0, 1]) {
        const date = dateKey(plusDays(localToday, shift));
        if (!scheduled(task, date) || (completed[date] || []).includes(task.id)) continue;
        const dueAt = dueTime(date, task.time);
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
    if (!value || ![1, 2, 3].includes(value.version) || !Array.isArray(value.tasks) || value.tasks.length > 20000 || !value.completed || typeof value.completed !== 'object' || Array.isArray(value.completed)) throw new Error('Invalid backup format.');
    const ids = new Set();
    const tasks = value.tasks.map(t => {
      if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(t.id) || ids.has(t.id) || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 200 || !['once', 'weekly'].includes(t.kind)) throw new Error('Invalid task in backup.');
      ids.add(t.id);
      const time = t.time == null || t.time === '' ? null : t.time;
      if (time !== null && !validTime(time)) throw new Error('Invalid task time.');
      const rawReminders = t.reminders === undefined ? [] : t.reminders;
      if (!Array.isArray(rawReminders) || rawReminders.length > 4 || rawReminders.some(offset => ![5, 15, 30, 60].includes(offset))) throw new Error('Invalid reminder intervals.');
      const timing = { time, reminders: time === null ? [] : [...new Set(rawReminders)].sort((a, b) => b - a) };
      if (t.kind === 'once') { if (!validDate(t.date)) throw new Error('Invalid task date.'); return { id: t.id, title: t.title.trim(), kind: t.kind, date: t.date, ...timing }; }
      // Accept original single-day tasks and backups without changing their IDs or completion history.
      const days = t.weekdays === undefined ? [t.weekday] : t.weekdays;
      if (!Array.isArray(days) || days.length < 1 || days.length > 7 || days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || !validDate(t.startDate)) throw new Error('Invalid routine schedule.');
      const weekdays = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return { id: t.id, title: t.title.trim(), kind: t.kind, weekdays, startDate: t.startDate, ...timing };
    });
    const completed = {};
    for (const [date, entries] of Object.entries(value.completed)) {
      if (!validDate(date) || !Array.isArray(entries) || entries.length > 20000 || entries.some(id => typeof id !== 'string')) throw new Error('Invalid completion history.');
      completed[date] = [...new Set(entries.filter(id => ids.has(id)))];
    }
    return { version: 3, tasks, completed };
  }
  const empty = () => ({ version: 3, tasks: [], completed: {} });
  let data = empty(), persistent = true;
  function storageError(message) { persistent = false; $('storageWarning').hidden = false; $('storageWarning').textContent = message; $('saveStatus').textContent = 'Not saved · back up your tasks'; }
  try { const saved = localStorage.getItem(KEY); if (saved) data = validate(JSON.parse(saved)); }
  catch (_) { storageError('Saved tasks could not be loaded. Changes will last only for this session. Back up your tasks before closing, or restore a valid backup.'); }
  let today = dateKey(new Date()), selected = today, month = parseDate(today), view = 'day', editingId = null;
  let toastTimer, undoAction;
  function icon(name) { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-' + name); svg.setAttribute('aria-hidden', 'true'); svg.append(use); return svg; }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function fmt(date, options) { return parseDate(date).toLocaleDateString(undefined, options); }
  function tasksOn(date) { return data.tasks.filter(t => scheduled(t, date)); }
  function isDone(id, date = selected) { return (data.completed[date] || []).includes(id); }
  function save() {
    if (persistent) {
      try { localStorage.setItem(KEY, JSON.stringify(data)); }
      catch (_) { storageError('Your browser could not save these changes. Tasks are available for this session. Use Back up tasks to keep a copy before closing.'); }
    }
    render(true);
    checkReminders();
  }
  function notify(message, undo) {
    clearTimeout(toastTimer); undoAction = undo;
    const toast = $('toast'); toast.replaceChildren(document.createTextNode(message));
    if (undo) { const button = el('button', '', 'Undo'); button.type = 'button'; button.onclick = () => { undoAction?.(); undoAction = null; toast.hidden = true; save(); }; toast.append(button); }
    toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; undoAction = null; }, undo ? 12000 : 4000);
  }
  function chooseDate(date) {
    if (!validDate(date)) return;
    const changed = selected !== date || view !== 'day', direction = view === 'day' && selected !== date ? (date > selected ? 1 : -1) : 0;
    selected = date; month = parseDate(date); view = 'day'; render();
    if (changed) revealView($('dailyView'), direction);
  }
  function renderCalendar() {
    $('monthLabel').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12), start = monday(first);
    const grid = $('calendarGrid'); grid.replaceChildren();
    for (let i = 0; i < 42; i++) {
      const date = plusDays(start, i), key = dateKey(date), count = tasksOn(key).length;
      const button = el('button', [date.getMonth() !== month.getMonth() ? 'outside' : '', key === today ? 'today' : '', key === selected ? 'selected' : '', count ? 'has-tasks' : ''].filter(Boolean).join(' '), date.getDate());
      button.type = 'button'; button.setAttribute('aria-label', `${fmt(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${count} task${count === 1 ? '' : 's'}`);
      if (key === today) button.setAttribute('aria-current', 'date');
      button.setAttribute('aria-pressed', String(key === selected)); button.onclick = () => chooseDate(key); grid.append(button);
    }
  }
  function renderWeek() {
    const start = monday(parseDate(selected)), end = plusDays(start, 6);
    $('weekLabel').textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    $('weekStrip').replaceChildren();
    for (let i = 0; i < 7; i++) {
      const date = plusDays(start, i), key = dateKey(date);
      const button = el('button', `week-day${key === selected ? ' active' : ''}${key === today ? ' today' : ''}`);
      button.type = 'button'; button.setAttribute('aria-pressed', String(key === selected)); button.setAttribute('aria-label', fmt(key, { weekday: 'long', month: 'long', day: 'numeric' }));
      if (key === today) button.setAttribute('aria-current', 'date');
      button.append(el('span', 'weekday', DAYS[date.getDay()].slice(0, 3)), el('span', 'number', date.getDate()));
      if (tasksOn(key).length) button.append(el('span', 'day-dot'));
      button.onclick = () => chooseDate(key); $('weekStrip').append(button);
    }
  }
  function makeEmpty(routines = false) {
    const box = el('div', 'empty-state'), illustration = el('div', 'empty-illustration'); illustration.append(icon(routines ? 'repeat' : 'leaf'));
    box.append(illustration, el('h3', '', routines ? 'Find your weekly rhythm.' : 'What’s on your list?'), el('p', '', routines ? 'Add the things you do each week.\nThey’ll be ready when the day comes.' : 'No tasks planned for this day.\nStart with one thing you’d like to get done.'));
    box.querySelector('p').style.whiteSpace = 'pre-line';
    if (routines) { const add = el('button', 'outline-button', '+ Add a routine'); add.type = 'button'; add.onclick = () => openTask(null, 'weekly'); box.append(add); }
    return box;
  }
  function taskRow(task, routine = false, peers = [task]) {
    const done = !routine && isDone(task.id), row = el('div', 'task-row' + (done ? ' done' : ''));
    row.dataset.id = task.id; row.tabIndex = -1;
    if (routine) { const badge = el('div', 'routine-icon'); badge.append(icon('repeat')); row.append(badge); }
    else {
      const check = el('button', 'check-button'); check.type = 'button'; check.setAttribute('aria-label', `${done ? 'Mark incomplete' : 'Complete'}: ${task.title}`); check.setAttribute('aria-pressed', String(done)); if (done) check.append(icon('check'));
      check.onclick = () => { const completed = new Set(data.completed[selected] || []); completed.has(task.id) ? completed.delete(task.id) : completed.add(task.id); data.completed[selected] = [...completed]; save(); const updated = [...$('taskList').querySelectorAll('.check-button')].find(b => b.dataset.id === task.id); updated?.focus(); }; check.dataset.id = task.id; row.append(check);
    }
    const copy = el('div', 'task-copy'), name = el('p', 'task-name', task.title), meta = el('div', 'task-meta');
    meta.append(icon(task.kind === 'weekly' ? 'repeat' : 'calendar'), document.createTextNode(task.kind === 'weekly' ? `${recurrenceLabel(weekdaysOf(task))}${routine ? ' · from ' + fmt(task.startDate, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}` : 'One time'));
    const heading = el('div', 'task-heading'), time = el('span', 'time-badge' + (task.time ? ' timed' : ''), task.time ? formatTime(task.time) : 'All day');
    heading.append(name, time); copy.append(heading, meta);
    if (task.reminders?.length) { const reminder = el('div', 'task-meta reminder-meta'); reminder.append(icon('bell'), document.createTextNode('Remind ' + task.reminders.map(offset => offset === 60 ? '1 hr' : `${offset} min`).join(', ') + ' before')); copy.append(reminder); }
    row.append(copy);
    const actions = el('div', 'task-actions'), ordering = el('div', 'task-order'), position = peers.findIndex(peer => peer.id === task.id);
    for (const [direction, step] of [['up', -1], ['down', 1]]) {
      const move = el('button', `icon-button move-task move-${direction}`); move.type = 'button'; move.append(icon('arrow'));
      move.title = `Move ${direction}`; move.setAttribute('aria-label', `Move ${task.title} ${direction}`); move.dataset.move = direction;
      move.disabled = !peers[position + step];
      move.onclick = () => {
        const neighbor = peers[position + step]; if (!neighbor) return;
        data.tasks = reorderTasks(data.tasks, task.id, neighbor.id); save();
        const container = routine ? $('routineList') : $('taskList');
        const movedRow = [...container.querySelectorAll('.task-row')].find(item => item.dataset.id === task.id);
        const control = movedRow?.querySelector(`[data-move="${direction}"]`);
        if (control && !control.disabled) control.focus({ preventScroll: true }); else movedRow?.focus({ preventScroll: true });
        notify(`Task moved ${direction}.`);
      };
      ordering.append(move);
    }
    const edit = el('button', 'icon-button edit-task'); edit.type = 'button'; edit.append(icon('edit')); edit.setAttribute('aria-label', `Edit ${task.title}`); edit.title = 'Edit task'; edit.onclick = () => openTask(task);
    row.prepend(ordering); actions.append(edit); row.append(actions); return row;
  }
  function render(animateRows = false) {
    const previousPositions = animateRows ? captureTaskPositions() : null;
    $('dailyView').hidden = view !== 'day'; $('routinesView').hidden = view !== 'routines';
    $('todayNav').classList.toggle('active', view === 'day'); $('routinesNav').classList.toggle('active', view === 'routines');
    $('todayCount').textContent = tasksOn(today).filter(t => !isDone(t.id, today)).length;
    $('routineCount').textContent = data.tasks.filter(t => t.kind === 'weekly').length;
    $('viewBreadcrumb').textContent = view === 'day' ? 'My day' : 'Weekly routines';
    $('dateEyebrow').textContent = `${selected === today ? 'TODAY · ' : ''}${fmt(selected, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`;
    $('dayTitle').replaceChildren(document.createTextNode(DAYS[parseDate(selected).getDay()]), el('span', '', '.'));
    $('jumpToday').hidden = selected === today;
    const tasks = tasksOn(selected), pending = tasks.filter(t => !isDone(t.id)), done = tasks.filter(t => isDone(t.id));
    $('taskTotal').textContent = tasks.length; $('completionText').textContent = tasks.length ? `${done.length} of ${tasks.length} complete` : 'A little progress starts here';
    $('progressBar').style.width = `${tasks.length ? done.length / tasks.length * 100 : 0}%`;
    $('daySubtitle').textContent = tasks.length && !pending.length ? 'All done for this day. Enjoy a little breathing room.' : 'A fresh day. A little space to get things done.';
    const list = $('taskList'); list.replaceChildren();
    if (!tasks.length) list.append(makeEmpty());
    pending.forEach(task => list.append(taskRow(task, false, pending)));
    if (done.length) { list.append(el('div', 'section-label', `COMPLETED · ${done.length}`)); done.forEach(task => list.append(taskRow(task, false, done))); }
    const routines = data.tasks.filter(t => t.kind === 'weekly');
    $('routineList').replaceChildren(...(routines.length ? routines.map(t => taskRow(t, true, routines)) : [makeEmpty(true)]));
    renderCalendar(); renderWeek();
    if (previousPositions) settleTaskPositions(previousPositions);
  }
  const weekdayInputs = [...document.querySelectorAll('input[name="weekdays"]')];
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
    $('weeklyDays').hidden = !weekly; $('onceDayField').hidden = weekly; $('scheduleDateRow').classList.toggle('weekly-date', weekly);
    const date = $('taskDate').value;
    const days = selectedWeekdays();
    $('scheduleHint').textContent = validDate(date) ? weekly ? days.length ? `${recurrenceLabel(days)}, starting ${fmt(date, { month: 'short', day: 'numeric', year: 'numeric' })}. Each date has its own checkbox.${editingId ? ' Changes apply to this routine.' : ''}` : 'Select at least one day for this routine.' : `Only on ${fmt(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}.` : 'Choose a date for this task.';
    $('workdaysPreset').setAttribute('aria-pressed', String(days.length === 5 && [1, 2, 3, 4, 5].every(day => days.includes(day))));
    $('everydayPreset').setAttribute('aria-pressed', String(days.length === 7));
  }
  function openTask(task = null, kind = 'once') {
    dialogCloseMotion?.cancel(); dialogCloseMotion = null; dialogClosing = false; $('taskDialog').classList.toggle('is-closing', false);
    editingId = task?.id || null; $('taskForm').reset(); $('formError').textContent = '';
    $('dialogTitle').textContent = task ? 'Edit task' : 'Add a task'; $('saveTask').textContent = task ? 'Save changes' : 'Add task'; $('deleteTask').hidden = !task;
    $('deleteTask').textContent = task?.kind === 'weekly' ? 'Delete routine' : 'Delete task';
    $('taskTitle').value = task?.title || ''; $('taskForm').elements.kind.value = task?.kind || kind;
    const date = task ? task.kind === 'weekly' ? task.startDate : task.date : selected;
    $('taskDate').value = date; $('taskDay').value = parseDate(date).getDay();
    selectWeekdays(task?.kind === 'weekly' ? weekdaysOf(task) : [parseDate(date).getDay()]);
    $('taskForm').elements.timing.value = task?.time ? 'timed' : 'allday'; $('taskTime').value = task?.time || '';
    reminderInputs.forEach(input => { input.checked = (task?.reminders || []).includes(Number(input.value)); });
    updateTimingFields();
    updateHint(); $('taskDialog').showModal();
    playMotion($('taskDialog'), [{ opacity: 0, transform: 'translateY(10px) scale(.975)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 200 });
    $('taskTitle').focus();
  }
  $('taskForm').addEventListener('submit', event => {
    event.preventDefault(); const title = $('taskTitle').value.trim(), kind = $('taskForm').elements.kind.value, date = $('taskDate').value;
    if (dialogClosing) return;
    if (!title) { $('formError').textContent = 'Give your task a name.'; $('taskTitle').focus(); return; }
    if (!validDate(date)) { $('formError').textContent = 'Choose a valid date.'; return; }
    const weekdays = selectedWeekdays();
    if (kind === 'weekly' && !weekdays.length) { $('formError').textContent = 'Select at least one day for this routine.'; weekdayInputs[0].focus(); return; }
    const time = $('taskForm').elements.timing.value === 'timed' ? $('taskTime').value : null;
    if (time !== null && !validTime(time)) { $('formError').textContent = 'Choose a valid time, or select All day.'; $('taskTime').focus(); return; }
    const reminders = time ? reminderInputs.filter(input => input.checked).map(input => Number(input.value)).sort((a, b) => b - a) : [];
    const id = editingId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `t${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const task = { id, title, kind, time, reminders, ...(kind === 'weekly' ? { weekdays, startDate: date } : { date }) };
    const wasEditing = Boolean(editingId); if (wasEditing) data.tasks = data.tasks.map(t => t.id === id ? task : t); else data.tasks.push(task);
    closeTaskDialog(); if (!wasEditing) { let first = parseDate(date); if (kind === 'weekly') { while (!weekdays.includes(first.getDay())) first = plusDays(first, 1); } selected = dateKey(first); month = first; view = 'day'; } save(); notify(wasEditing ? 'Task updated.' : kind === 'weekly' ? 'Your weekly routine is ready.' : 'Task added to your day.');
  });
  $('taskDay').onchange = () => { if (validDate($('taskDate').value)) { const base = monday(parseDate($('taskDate').value)); $('taskDate').value = dateKey(plusDays(base, (Number($('taskDay').value) + 6) % 7)); } updateHint(); };
  $('taskDate').onchange = () => { if (validDate($('taskDate').value)) $('taskDay').value = parseDate($('taskDate').value).getDay(); updateHint(); };
  [...$('taskForm').elements.kind].forEach(radio => radio.onchange = updateHint);
  [...$('taskForm').elements.timing].forEach(radio => radio.onchange = updateTimingFields);
  weekdayInputs.forEach(input => { input.onchange = () => { $('formError').textContent = ''; updateHint(); }; });
  $('workdaysPreset').onclick = () => { selectWeekdays([1, 2, 3, 4, 5]); $('formError').textContent = ''; updateHint(); };
  $('everydayPreset').onclick = () => { selectWeekdays([1, 2, 3, 4, 5, 6, 0]); $('formError').textContent = ''; updateHint(); };
  $('deleteTask').onclick = () => {
    if (dialogClosing) return;
    const task = data.tasks.find(t => t.id === editingId), index = data.tasks.findIndex(t => t.id === editingId); if (!task) return;
    data.tasks.splice(index, 1); closeTaskDialog(); save(); notify(task.kind === 'weekly' ? 'Weekly routine deleted.' : 'Task deleted.', () => { data.tasks.splice(index, 0, task); });
  };
  for (const id of ['closeDialog', 'cancelDialog']) $(id).onclick = closeTaskDialog;
  $('taskDialog').addEventListener('cancel', event => { event.preventDefault(); closeTaskDialog(); });
  $('addTask').onclick = () => openTask(null, view === 'routines' ? 'weekly' : 'once'); $('inlineAdd').onclick = () => openTask();
  $('todayNav').onclick = $('jumpToday').onclick = () => chooseDate(today); document.querySelector('.brand').onclick = event => { event.preventDefault(); chooseDate(today); };
  $('routinesNav').onclick = () => { if (view === 'routines') return; view = 'routines'; render(); revealView($('routinesView')); };
  $('prevWeek').onclick = () => chooseDate(dateKey(plusDays(parseDate(selected), -7))); $('nextWeek').onclick = () => chooseDate(dateKey(plusDays(parseDate(selected), 7)));
  function shiftMonth(direction) { month = new Date(month.getFullYear(), month.getMonth() + direction, 1, 12); renderCalendar(); playMotion($('calendarGrid'), [{ opacity: .4, transform: `translateX(${direction * 5}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 170 }); }
  $('prevMonth').onclick = () => shiftMonth(-1); $('nextMonth').onclick = () => shiftMonth(1);
  function backup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = `day-by-day-backup-${today}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Backup downloaded. Keep it somewhere safe.');
  }
  $('backupBtn').onclick = backup; $('restoreBtn').onclick = () => $('restoreFile').click();
  $('restoreFile').onchange = async () => {
    const file = $('restoreFile').files[0]; if (!file) return;
    try {
      if (file.size > 10000000) throw new Error('This file is too large. Choose a Day by Day backup under 10 MB.');
      const next = validate(JSON.parse(await file.text()));
      if (data.tasks.length && !confirm('Restore this backup? It will replace the tasks and completion history in this browser. Back up your current tasks first if you want to keep them.')) return;
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
  function keepReminder(alert) {
    const task = data.tasks.find(task => task.id === alert.taskId);
    return task && task.time === alert.time && task.reminders.includes(alert.offset) && scheduled(task, alert.date) && !isDone(task.id, alert.date) && alert.dueAt >= Date.now() - 86400000;
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
      const task = data.tasks.find(task => task.id === alert.taskId), card = el('div', 'reminder-card');
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
      const first = events[0], task = data.tasks.find(task => task.id === first.taskId);
      const notice = new Notification(events.length > 1 ? `${events.length} task reminders` : task.title, { body: events.length > 1 ? events.slice(0, 3).map(event => data.tasks.find(task => task.id === event.taskId).title).join(' · ') : `Due ${fmt(first.date, { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatTime(first.time)}`, tag: events.length > 1 ? 'day-by-day-reminders' : first.key });
      notice.onclick = () => { window.focus(); chooseDate(first.date); reminderPanelOpen = true; renderReminderPanel(); notice.close(); };
    } catch (_) { /* The in-app panel remains available if a local-file notification is refused. */ }
  }
  function checkReminders() {
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
    if (events.length) { reminderPanelOpen = true; $('reminderAnnouncement').textContent = `${events.length} task reminder${events.length === 1 ? '' : 's'}. ${events.slice(0, 3).map(event => data.tasks.find(task => task.id === event.taskId).title).join(', ')}.`; }
    if (JSON.stringify(reminderLog) !== before) { persistReminderLog(); renderReminderPanel(); }
    showDesktopReminder(events);
  }
  // Keep separate tabs in step and refresh the current date after midnight or sleep.
  window.addEventListener('storage', event => { if (event.key === KEY) { try { data = event.newValue ? validate(JSON.parse(event.newValue)) : empty(); render(); checkReminders(); } catch (_) { storageError('Tasks changed in another tab but could not be read. Back up your tasks before closing.'); } } if (event.key === REMINDER_KEY) { reminderLog = readReminderLog(); renderReminderPanel(); } });
  function refreshToday() { const now = dateKey(new Date()); if (now === today) return; const followedToday = selected === today; today = now; if (followedToday) { selected = now; month = parseDate(now); } render(); }
  setInterval(refreshToday, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshToday(); }); window.addEventListener('focus', refreshToday);
  setInterval(checkReminders, 10000); document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); }); window.addEventListener('focus', () => { checkReminders(); updateNotificationStatus(); });
  document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.altKey && !event.metaKey && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) && !$('taskDialog').open) { event.preventDefault(); openTask(); } });
  // Compact screens keep the calendar and backup controls within reach.
  const calendarToggle = el('button', 'text-button calendar-mobile-toggle', 'Calendar'); calendarToggle.type = 'button'; calendarToggle.style.display = 'none'; calendarToggle.prepend(icon('calendar')); calendarToggle.setAttribute('aria-expanded', 'false'); calendarToggle.onclick = () => { const open = document.querySelector('.sidebar').classList.toggle('mobile-calendar'); calendarToggle.setAttribute('aria-expanded', String(open)); }; document.querySelector('.main-nav').append(calendarToggle);
  const footer = document.querySelector('.main-footer'); const mobileBackup = el('button', 'text-button', 'Back up'); mobileBackup.style.display = 'none'; mobileBackup.onclick = backup; const mobileRestore = el('button', 'text-button', 'Restore'); mobileRestore.style.display = 'none'; mobileRestore.onclick = () => $('restoreFile').click(); footer.append(mobileBackup, mobileRestore);
  const localNote = el('div', 'mobile-storage', 'Saved in this browser · Tasks stay on this device'); localNote.style.display = 'none'; document.querySelector('main').append(localNote);
  render();
  checkReminders(); renderReminderPanel(); updateNotificationStatus();
  // Pure date helpers are exposed for focused schedule verification.
  window.DayByDay = Object.freeze({ dateKey, parseDate, validDate, plusDays, monday, weekdaysOf, recurrenceLabel, scheduled, reorderTasks, validTime, dueTime, reminderKey, dueReminders, validate });
})();
