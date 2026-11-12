'use strict';
(() => {
  const KEY = 'day-by-day.v1';
  let fileStore = null, recovery = null;
  const $ = id => document.getElementById(id);
  const { SIZE_LIMIT, DAYS, dateKey, weekdayLabel, parseDate, validDate, plusDays, monday, weekdaysOf, recurrenceLabel, routineFields, createRoutine, routineVersion, resolveTask, scheduled, completedSnapshots, reviseRoutine, orderByIds, moveOrderedId, lastRoutineDate, overdueTasks, validTime, taskTimeOrder, sortTasksByTime, descriptionPreview, descriptionParts, dueTime, formatTime, reminderKey, dueReminders, validate } = window.DayByDayCore;
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
  let dialogCycle = 0, dialogFocusTarget = null, taskFormStart = '';
  function focusTask(id) {
    const containers = [view === 'routines' ? $('routineList') : $('taskList')];
    if (view === 'day' && selected === today && !$('overdueSection').hidden) containers.push($('overdueList'));
    for (const container of containers) {
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
    const dialog = $('taskDialog'); if (!dialog.open) return;
    // Release the native modal immediately. A suspended/unfinished animation must
    // never leave an invisible top-layer dialog blocking checklist input in Edge.
    activeMotion.get(dialog)?.cancel();
    dialog.close();
    restoreDialogFocus(dialogCycle);
  }
  const empty = () => ({ version: 5, tasks: [], completed: {}, weekdayOrders: {}, routineOrder: null });
  let data = empty(), persistent = true, loadFailed = false, originalSavedData = null, browserUnsaved = false;
  // The browser copy as this tab last read or wrote it. If storage holds something else, another tab saved first.
  let storedText = null;
  function storageError(message) {
    if (fileStore?.isConnected()) message = 'The browser copy could not be saved. Check the task-file status above to confirm your JSON file is saved.';
    fileStore?.showDetails();
    persistent = false; $('storageWarning').hidden = false; $('storageWarningText').textContent = message;
    $('downloadOriginalData').hidden = originalSavedData === null;
    // Retrying only helps when a write failed. Unreadable saved data is never written over.
    $('retrySave').hidden = loadFailed;
    $('saveStatus').textContent = fileStore?.isConnected() ? 'Browser copy unavailable' : loadFailed ? 'Not saved · recover original data' : 'Not saved · back up your tasks';
  }
  try {
    originalSavedData = storedText = localStorage.getItem(KEY);
    if (originalSavedData) data = validate(JSON.parse(originalSavedData));
    originalSavedData = null;
  } catch (_) {
    loadFailed = true;
    storageError(originalSavedData === null ? 'Saved tasks could not be accessed. Changes will last only for this session. Browser storage may be unavailable.' : 'Saved tasks could not be loaded. Your original saved data has been kept untouched. Download it for recovery before restoring a backup. Changes will last only for this session.');
  }
  function savedBytes(value) {
    const text = JSON.stringify(value, null, 2) + '\n';
    return typeof Blob === 'function' ? new Blob([text]).size : text.length;
  }
  // The last accepted data, used to undo a change that fails the checks in save().
  let lastGood = JSON.stringify(data), lastGoodBytes = savedBytes(data);
  function rememberGood() { lastGood = JSON.stringify(data); lastGoodBytes = savedBytes(data); }
  let today = dateKey(new Date()), selected = today, month = parseDate(today), view = 'day', editingId = null, editingReadOnly = false, editingBase = null;
  let renderedOverdueKey = '';
  function overdueKey(tasks) { return JSON.stringify(tasks.map(task => [task.date, task.id])); }
  const expandedDescriptions = new Set();
  const collapsedCompleted = new Set();
  let openTaskMenuKey = null;
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
    announceStatus($('storageProtectionStatus').textContent);
  };
  function renderBackupStatus() {
    const text = backupStatus.lastExported ? `Last backup exported ${new Date(backupStatus.lastExported).toLocaleDateString()}` : 'No backup exported in this browser';
    $('lastBackup').textContent = text;
    const oldChanges = backupStatus.firstChangeAt && Date.now() - backupStatus.firstChangeAt >= 7 * 86400000;
    $('backupNotice').hidden = !data.tasks.length || backupStatus.snoozedUntil > Date.now() || !(backupStatus.changes >= 25 || (backupStatus.changes > 0 && oldChanges));
    $('backupNoticeText').textContent = `${text}. You have changes to back up.`;
  }
  let undoAction, announcementTimer, pendingAnnouncement = null;
  function announceStatus(message) {
    const status = $('statusAnnouncement');
    const repeat = status.textContent === message || pendingAnnouncement === message;
    clearTimeout(announcementTimer); pendingAnnouncement = null;
    if (repeat) {
      status.textContent = ''; pendingAnnouncement = message;
      announcementTimer = setTimeout(() => { status.textContent = message; pendingAnnouncement = null; }, 50);
    } else status.textContent = message;
  }
  function timedNotice(node, onHide = () => {}) {
    const duration = 10000;
    let timer, started = null, remaining = duration, hovered = false, generation = 0;
    const paused = () => document.hidden || hovered || node.contains(document.activeElement);
    function pause() {
      clearTimeout(timer);
      generation++;
      if (started !== null) remaining = Math.max(0, remaining - (Date.now() - started));
      started = null;
    }
    function hide() {
      pause(); node.hidden = true; hovered = false; onHide();
    }
    function resume() {
      if (node.hidden || paused() || started !== null) return;
      started = Date.now();
      const current = ++generation;
      timer = setTimeout(() => {
        if (current !== generation) return;
        if (paused()) { pause(); return; }
        hide();
      }, remaining);
    }
    function show() {
      pause(); remaining = duration;
      hovered = node.matches(':hover');
      node.hidden = false; resume();
    }
    node.addEventListener('pointerenter', () => { hovered = true; pause(); });
    node.addEventListener('pointerleave', () => { hovered = false; resume(); });
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', () => queueMicrotask(resume));
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
    return { show, hide };
  }
  const toastNotice = timedNotice($('toast'));
  const undoNotice = timedNotice($('undoNotice'), () => { undoAction = null; });
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
  function newTaskId() {
    let id;
    do { id = globalThis.crypto?.randomUUID ? crypto.randomUUID() : `t${Date.now()}_${Math.random().toString(36).slice(2)}`; }
    while (data.tasks.some(task => task.id === id));
    return id;
  }
  function writeBrowserCopy(replaceUnreadable, text = JSON.stringify(data)) {
    // Saved data that could not be read stays untouched for recovery until the user restores over it.
    if (loadFailed && !replaceUnreadable) { browserUnsaved = true; return; }
    // Two tabs saving at nearly the same moment would otherwise overwrite each other's change.
    // Ask which copy to keep instead. A connected task file is authoritative, so it skips this check.
    if (!replaceUnreadable && !fileStore?.ownsCache()) {
      let current = storedText;
      try { current = localStorage.getItem(KEY); } catch (_) { /* Reading failed; the write below reports it. */ }
      if (current !== storedText) { browserUnsaved = true; chooseTab(current); return; }
    }
    try {
      localStorage.setItem(KEY, text);
      storedText = text;
      browserUnsaved = false;
      // Retry after every failure, so a temporary problem such as a full disk clears itself.
      if (!persistent && !loadFailed) { $('storageWarning').hidden = true; $('saveStatus').textContent = 'Saved in this browser'; }
      persistent = true;
    } catch (_) {
      browserUnsaved = true;
      storageError('Your browser could not save these changes. Tasks are available for this session. Use Back up tasks to keep a copy before closing.');
    }
  }
  // Try the browser copy again without needing another edit.
  $('retrySave').onclick = () => {
    writeBrowserCopy(false);
    renderBackupStatus();
    if (browserUnsaved) { notify('The browser still could not save your tasks. Use Back up tasks to keep a copy before closing.'); return; }
    $('inlineAdd').focus({ preventScroll: true });
    notify('Saved in this browser.');
  };
  function save({ replaceUnreadable = false } = {}) {
    // A new data change supersedes the previous one-step Undo.
    undoNotice.hide();
    // Check the whole task list before keeping a change, so the app never saves data it would refuse to open.
    let problem = null, bytes = 0;
    try {
      bytes = savedBytes(validate(data));
      // A change that shrinks oversized data is still allowed, so you can delete your way back under the limit.
      if (bytes > SIZE_LIMIT && bytes >= lastGoodBytes) problem = 'Your tasks would be larger than the 10 MB limit, and a backup that size could not be restored.';
    } catch (error) { problem = error.message; }
    if (problem) {
      data = JSON.parse(lastGood); render();
      const message = `Change not saved. ${problem} Delete unused tasks or history first.`;
      if ($('taskDialog').open) formProblem(message);
      notify(message);
      return false;
    }
    lastGood = JSON.stringify(data); lastGoodBytes = bytes;
    writeBrowserCopy(replaceUnreadable, lastGood);
    backupStatus.changes++;
    if (!backupStatus.firstChangeAt) backupStatus.firstChangeAt = Date.now();
    persistBackupStatus();
    fileStore?.changed();
    recovery?.afterSave();
    render();
    renderBackupStatus();
    checkReminders();
    return true;
  }
  function notify(message, undo) {
    toastNotice.hide();
    announceStatus(undo ? `${message} Undo is available above the checklist for 10 seconds. The timer pauses while the message is hovered or focused, or the tab is hidden.` : message);
    if (undo) {
      undoAction = undo; $('undoMessage').textContent = message; undoNotice.show();
    } else {
      $('toastMessage').textContent = message; toastNotice.show();
    }
  }
  function chooseDate(date) {
    if (!validDate(date)) return;
    const previousView = view, changed = selected !== date || view !== 'day';
    if (changed) openTaskMenuKey = null;
    selected = date; month = parseDate(date); view = 'day'; render();
    if (changed) { if (previousView !== 'day') revealView($('dailyView')); else fadeDayContent(); }
  }
  function renderCalendar() {
    $('monthLabel').textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12), start = monday(first);
    const grid = $('calendarGrid'), monthKey = `${month.getFullYear()}-${month.getMonth()}`;
    if (grid.dataset.monthKey !== monthKey) { grid.replaceChildren(); grid.dataset.monthKey = monthKey; }
    // Exactly one day is reachable with Tab: the selected day or today when shown in this month,
    // otherwise the 1st. The arrow keys then move between days.
    const inMonth = key => parseDate(key).getMonth() === month.getMonth() && parseDate(key).getFullYear() === month.getFullYear();
    const tabKey = inMonth(selected) ? selected : inMonth(today) ? today : dateKey(first);
    for (let i = 0; i < 42; i++) {
      const date = plusDays(start, i), key = dateKey(date), count = taskCountOn(key);
      let button = grid.children[i];
      if (!button) { button = el('button', '', date.getDate()); grid.append(button); }
      button.className = [date.getMonth() !== month.getMonth() ? 'outside' : '', key === today ? 'today' : '', key === selected ? 'selected' : '', count ? 'has-tasks' : ''].filter(Boolean).join(' ');
      button.type = 'button'; button.setAttribute('aria-label', `${fmt(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${count} task${count === 1 ? '' : 's'}`);
      button.setAttribute('aria-current', key === today ? 'date' : 'false');
      button.setAttribute('aria-pressed', String(key === selected)); button.onclick = () => chooseDate(key);
      button.dataset.date = key; button.tabIndex = key === tabKey ? 0 : -1;
      button.onkeydown = event => {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (!step) return;
        event.preventDefault();
        const next = dateKey(plusDays(parseDate(key), step));
        if (!validDate(next)) return;
        chooseDate(next);
        [...$('calendarGrid').children].find(day => day.dataset.date === next)?.focus();
      };
    }
    // Show the selected day in Go to date, unless someone is typing in it.
    if (document.activeElement !== $('jumpDate')) $('jumpDate').value = selected;
  }
  $('jumpDate').onchange = () => chooseDate($('jumpDate').value);
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
    const box = el('div', 'empty-state'), illustration = el('div', 'empty-illustration'); illustration.append(icon(routines ? 'repeat' : remainingOverdue ? 'clock' : 'calendar'));
    const day = fmt(selected, { weekday: 'long', month: 'long', day: 'numeric' });
    box.append(illustration, el('h3', '', routines ? 'Build your weekly routine' : remainingOverdue ? 'Everything left for today is overdue' : `No tasks planned for ${day}`), el('p', '', routines ? 'Add the things you do each week, and each day gets its own checkbox.' : remainingOverdue ? 'Complete or move those tasks in the Overdue section above.' : 'Add something you’d like to get done.'));
    if (routines) { const add = el('button', 'outline-button', 'Add routine'); add.type = 'button'; add.prepend(icon('plus')); add.onclick = () => openTask(null, 'weekly'); box.append(add); }
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
      const check = el('button', 'check-button'); check.type = 'button'; check.setAttribute('aria-label', `${task.title}, ${fmt(occurrenceDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`); check.setAttribute('aria-pressed', String(done)); if (done) check.append(icon('check'));
      check.onclick = () => {
        const completed = new Set(data.completed[occurrenceDate] || []);
        completed.has(task.id) ? completed.delete(task.id) : completed.add(task.id);
        data.completed[occurrenceDate] = [...completed];
        if (!save()) return;
        const updated = [...$('taskList').querySelectorAll('.check-button'), ...$('overdueList').querySelectorAll('.check-button')].find(b => b.dataset.id === task.id);
        const completedSummary = isDone(task.id, occurrenceDate) && collapsedCompleted.has(occurrenceDate) ? $('taskList').querySelector('.completed-tasks')?.querySelector('summary') : null;
        (completedSummary || updated || (overdue && !$('overdueSection').hidden ? $('overdueTitle') : $('inlineAdd'))).focus({ preventScroll: true });
      }; check.dataset.id = task.id; row.append(check);
    }
    const secondary = el('div', 'task-menu-content');
    const copy = el('div', 'task-copy'), name = el('p', 'task-name', task.title), meta = el('div', 'task-meta');
    if (pastDue) meta.classList.toggle('overdue-meta', true);
    meta.append(icon(pastDue ? 'clock' : task.kind === 'weekly' ? 'repeat' : 'calendar'), document.createTextNode(task.kind === 'weekly' ? `${recurrenceLabel(weekdaysOf(task))}${routine ? ' · from ' + fmt(task.startDate, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}` : pastDue ? `Due ${fmt(task.date, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'One time'));
    const lateToday = inOverdue && !done && occurrenceDate === today && Boolean(task.time);
    const heading = el('div', 'task-heading'), time = el('span', 'time-badge' + (task.time ? ' timed' : '') + (lateToday ? ' overdue' : ''), task.time ? formatTime(task.time) : 'All day');
    if (lateToday) { time.prepend(icon('clock')); time.setAttribute('aria-label', `Was due at ${formatTime(task.time)}`); }
    heading.append(name, time);
    if (task.reminders?.length) {
      // A small bell shows at a glance that a task will remind you. Details stay under More.
      const when = task.reminders.map(offset => offset === 60 ? '1 hr' : `${offset} min`).join(', ');
      const bell = el('span', 'reminder-badge'); bell.title = `Reminder ${when} before`;
      bell.append(icon('bell'), el('span', 'sr-only', `Reminder ${when} before`)); heading.append(bell);
    }
    copy.append(heading, meta);
    if (task.movedFrom) {
      // A task carried over by Move to tomorrow links back to the day it came from.
      const origin = el('button', 'text-button moved-link', `Moved from ${fmt(task.movedFrom.date, { weekday: 'short', month: 'short', day: 'numeric' })}`); origin.type = 'button';
      origin.setAttribute('aria-label', `${task.title} was moved from ${fmt(task.movedFrom.date, { weekday: 'long', month: 'long', day: 'numeric' })}. Go to that day.`);
      origin.onclick = () => { chooseDate(task.movedFrom.date); ($('skippedSection').hidden ? $('inlineAdd') : $('skippedTitle')).focus({ preventScroll: true }); };
      copy.append(origin);
    }
    if (task.reminders?.length) { const reminder = el('div', 'task-meta reminder-meta'); reminder.append(icon('bell'), document.createTextNode('Remind ' + task.reminders.map(offset => offset === 60 ? '1 hr' : `${offset} min`).join(', ') + ' before')); secondary.append(reminder); }
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
        selected = today; month = parseDate(today); view = 'day';
        if (!save()) return; focusTask(task.id);
        notify('Task moved to today.', () => { data.tasks = data.tasks.map(item => item.id === task.id ? { ...item, date: previous, reminderFrom: task.reminderFrom || 0 } : item); });
      };
      // Rescheduling is the main reason to look at an overdue task, so it stays visible.
      copy.append(moveToday);
    }
    if (inOverdue && !done && occurrenceDate === today && validDate(dateKey(plusDays(parseDate(today), 1)))) {
      const moveTomorrow = el('button', 'text-button move-tomorrow', 'Move to tomorrow'); moveTomorrow.type = 'button';
      moveTomorrow.setAttribute('aria-label', `Move ${task.title} to tomorrow`);
      moveTomorrow.onclick = () => {
        const currentDate = dateKey(new Date());
        // Recheck the occurrence so double clicks, other tabs, and a midnight
        // rollover cannot defer the same task twice or move a completed task.
        if (occurrenceDate !== currentDate || !overdueTasks(data.tasks, data.completed, currentDate).some(item => item.id === task.id && item.date === currentDate)) {
          refreshToday(); notify('This task is no longer overdue today.'); return;
        }
        const tomorrow = dateKey(plusDays(parseDate(currentDate), 1));
        if (!validDate(tomorrow)) return;
        const original = data.tasks.find(item => item.id === task.id);
        const occurrence = resolveTask(original, currentDate);
        let deferredId = original.id;
        if (original.kind === 'once') {
          data.tasks = data.tasks.map(item => item.id === original.id ? { ...item, date: tomorrow, reminderFrom: Date.now() } : item);
        } else {
          if (data.tasks.length >= 20000 || (original.exceptions || []).length >= 20000) { notify('The task limit has been reached. Remove unused tasks before moving this occurrence.'); return; }
          // A separate one-time record keeps this occurrence independent even
          // when tomorrow already has its own scheduled routine occurrence.
          deferredId = newTaskId();
          const deferred = { id: deferredId, kind: 'once', date: tomorrow, title: occurrence.title, description: occurrence.description || '', time: occurrence.time || null, reminders: [...(occurrence.reminders || [])], reminderFrom: Date.now(), movedFrom: { taskId: original.id, date: currentDate } };
          const snapshots = { ...original.snapshots }; delete snapshots[currentDate];
          data.tasks = data.tasks.map(item => item.id === original.id ? { ...item, snapshots, exceptions: [...new Set([...(item.exceptions || []), currentDate])].sort() } : item);
          data.tasks.push(deferred);
        }
        if (!save()) return;
        ($('overdueList').querySelector('.move-tomorrow') || $('overdueList').querySelector('.check-button') || $('inlineAdd')).focus({ preventScroll: true });
        notify(original.kind === 'once' ? 'Task moved to tomorrow. Due time and reminders kept.' : 'Occurrence moved to tomorrow as a one-time task. Future repeats are unchanged.', () => {
          data.tasks = data.tasks.filter(item => original.kind === 'once' || item.id !== deferredId).map(item => item.id === original.id ? original : item);
        });
      };
      copy.append(moveTomorrow);
    }
    if (!routine && task.kind === 'weekly' && !done && occurrenceDate >= today) {
      const skip = el('button', 'text-button skip-task', 'Skip this occurrence'); skip.type = 'button';
      skip.setAttribute('aria-label', `Skip ${task.title} on ${fmt(occurrenceDate, { month: 'short', day: 'numeric' })}`);
      skip.onclick = () => {
        const source = data.tasks.find(item => item.id === task.id);
        if ((source.exceptions || []).length >= 20000) { notify('This routine has reached its limit of 20,000 skipped dates. Create a new routine and end this one.'); return; }
        source.exceptions = [...new Set([...(source.exceptions || []), occurrenceDate])].sort();
        if (!save()) return; $('skippedTitle').focus({ preventScroll: true });
        notify('Occurrence skipped. Future repeats are unchanged.', () => { source.exceptions = source.exceptions.filter(date => date !== occurrenceDate); });
      };
      secondary.append(skip);
    }
    if (routine && task.endedOn) copy.append(el('p', 'task-meta', `Ends before ${fmt(task.endedOn, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    const nextVersion = routine && task.versions?.find(version => version.from > today);
    if (nextVersion) copy.append(el('p', 'task-meta', `Changes scheduled from ${fmt(nextVersion.from, { month: 'short', day: 'numeric', year: 'numeric' })}`));
    row.append(copy);
    const actions = el('div', 'task-actions'), ordering = el('div', 'task-order'), position = peers.findIndex(peer => peer.id === task.id);
    for (const [direction, step] of [['up', -1], ['down', 1]]) {
      const move = el('button', `icon-button move-task move-${direction}`); move.type = 'button'; move.append(icon('arrow'));
      move.title = routine ? `Move ${direction} in the routine catalog` : `Move ${direction} for every ${DAYS[parseDate(occurrenceDate).getDay()]}`; move.setAttribute('aria-label', `Move ${task.title} ${direction}`); move.setAttribute('aria-describedby', routine ? 'routineOrderScope' : 'dayOrderScope'); move.dataset.move = direction;
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
        if (!save()) return;
        const container = routine ? $('routineList') : overdue ? $('overdueList') : $('taskList');
        const movedRow = [...container.querySelectorAll('.task-row')].find(item => item.dataset.id === task.id);
        const control = movedRow?.querySelector(`[data-move="${direction}"]`);
        if (control && !control.disabled) control.focus({ preventScroll: true }); else movedRow?.focus({ preventScroll: true });
        notify(routine ? `Routine moved ${direction}. Daily orders are unchanged.` : `Task moved ${direction}. This order repeats on ${DAYS[weekday]}.`);
      };
      ordering.append(move);
    }
    const edit = el('button', 'icon-button edit-task'); edit.type = 'button'; edit.append(icon('edit')); edit.setAttribute('aria-label', `Edit ${task.title}`); edit.title = 'Edit task'; edit.onclick = () => openTask(task);
    // The reorder arrows sit to the left of the task, so moving it never needs the More menu.
    // The line above the list explains what a move affects.
    if (!overdue || occurrenceDate === selected) row.prepend(ordering);
    // Offer More only when it has something in it. An invisible copy keeps the Edit buttons lined up.
    if (!secondary.children.length) {
      const spacer = el('span', 'task-menu-toggle task-menu-spacer', 'More'); spacer.setAttribute('aria-hidden', 'true');
      actions.append(edit, spacer); row.append(actions); return row;
    }
    const menu = el('details', 'task-menu'), summary = el('summary', 'task-menu-toggle', 'More');
    const menuKey = `${routine ? 'routine' : occurrenceDate}:${task.id}`;
    menu.dataset.key = menuKey; menu.open = openTaskMenuKey === menuKey;
    summary.setAttribute('aria-label', `More actions for ${task.title}`); summary.title = 'More actions';
    menu.append(summary, secondary);
    menu.addEventListener('toggle', () => {
      if (!menu.isConnected) return;
      if (menu.open) {
        openTaskMenuKey = menuKey;
        for (const other of document.querySelectorAll('.task-menu')) if (other !== menu) other.open = false;
      } else if (openTaskMenuKey === menuKey) openTaskMenuKey = null;
    });
    actions.append(edit, menu); row.append(actions); return row;
  }
  // The Coming up column lists the 7 days after the selected day. On wide screens it sits beside the
  // checklist. On narrower screens it follows the checklist, folded until Show is selected.
  $('comingUpToggle').onclick = () => {
    const open = $('comingUp').classList.toggle('collapsed') === false;
    $('comingUpToggle').setAttribute('aria-expanded', String(open)); $('comingUpToggle').textContent = open ? 'Hide' : 'Show';
    $('comingUpToggle').setAttribute('aria-label', open ? 'Hide the next 7 days' : 'Show the next 7 days');
  };
  $('comingUpToggle').setAttribute('aria-label', 'Show the next 7 days');
  function renderComingUp() {
    const start = parseDate(selected);
    $('comingUpHint').textContent = selected === today ? 'Next 7 days' : `7 days after ${fmt(selected, { weekday: 'short', month: 'short', day: 'numeric' })}`;
    const days = [];
    for (let offset = 1; offset <= 7; offset++) {
      const key = dateKey(plusDays(start, offset));
      if (!validDate(key)) break;
      // Only days with two or more tasks need sorting into the order your list uses.
      const found = data.tasks.filter(task => scheduled(task, key)).map(task => resolveTask(task, key));
      const tasks = found.length > 1 ? orderedTasks(found, key) : found, open = tasks.filter(task => !isDone(task.id, key));
      const button = el('button', 'coming-up-open' + (tasks.length ? '' : ' empty')); button.type = 'button';
      const count = !tasks.length ? 'Nothing planned' : !open.length ? 'All done' : `${open.length} task${open.length === 1 ? '' : 's'}`;
      button.append(el('span', 'coming-up-date', fmt(key, { weekday: 'short', month: 'short', day: 'numeric' })), el('span', 'coming-up-count', count));
      const shown = (open.length ? open : tasks).slice(0, 6), more = (open.length ? open : tasks).length - shown.length;
      if (shown.length) { const names = el('span', 'coming-up-tasks'); names.append(...shown.map(task => el('span', '', task.title)), ...(more > 0 ? [el('span', '', `+${more} more`)] : [])); button.append(names); }
      button.onclick = () => chooseDate(key);
      const item = el('li', 'coming-up-day'); item.append(button); days.push(item);
    }
    $('comingUpList').replaceChildren(...days);
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
    $('todayNav').setAttribute('aria-current', view === 'day' ? 'page' : 'false'); $('routinesNav').setAttribute('aria-current', view === 'routines' ? 'page' : 'false');
    $('addTaskLabel').textContent = view === 'routines' ? 'Add routine' : 'Add task';
    $('todayCount').textContent = todayTasks.filter(t => !isDone(t.id, today)).length + overdueEarlier.length;
    const activeRoutines = data.tasks.filter(task => task.kind === 'weekly' && (!task.endedOn || task.endedOn > today));
    $('routineCount').textContent = activeRoutines.length;
    $('viewBreadcrumb').textContent = view === 'day' ? 'My day' : 'Weekly routines';
    $('sortDay').hidden = !data.weekdayOrders[parseDate(selected).getDay()];
    $('sortDay').title = `Restore automatic sorting for ${DAYS[parseDate(selected).getDay()]}`;
    $('dayOrderScope').textContent = `${data.weekdayOrders[parseDate(selected).getDay()] ? 'Custom order' : 'Due time'} · reordering repeats every ${DAYS[parseDate(selected).getDay()]}`;
    $('routineOrderScope').textContent = `${data.routineOrder ? 'Custom order' : 'Due time'} · catalog only, daily orders unchanged`;
    $('sortRoutines').hidden = !data.routineOrder;
    $('dateEyebrow').textContent = `${selected === today ? 'Today · ' : ''}${fmt(selected, { month: 'long', day: 'numeric', year: 'numeric' })}`;
    $('dayTitle').textContent = DAYS[parseDate(selected).getDay()];
    $('jumpToday').hidden = selected === today;
    const tasks = selected === today ? todayTasks : tasksOn(selected);
    const unfinished = tasks.filter(t => !isDone(t.id));
    const pending = unfinished.filter(task => selected !== today || !overdueTodayIds.has(task.id)), done = tasks.filter(t => isDone(t.id));
    $('taskTotal').textContent = tasks.length; $('completionText').textContent = tasks.length ? `${done.length} of ${tasks.length} complete` : ''; $('completionText').hidden = !tasks.length;
    $('progressBar').style.width = `${tasks.length ? done.length / tasks.length * 100 : 0}%`; $('progressTrack').hidden = !tasks.length;
    $('daySubtitle').hidden = !(tasks.length && !unfinished.length && (selected !== today || !overdueEarlier.length));
    const list = $('taskList'); list.replaceChildren();
    if (!tasks.length || (!pending.length && !done.length)) list.append(makeEmpty(false, selected === today && overdueToday.length > 0));
    pending.forEach(task => list.append(taskRow(task, false, pending)));
    if (done.length) {
      const completed = el('details', 'completed-tasks'); completed.open = !collapsedCompleted.has(selected);
      const summary = el('summary', 'section-label', `Completed · ${done.length}`);
      completed.append(summary, ...done.map(task => taskRow(task, false, done)));
      const date = selected;
      completed.addEventListener('toggle', () => {
        if (!completed.isConnected) return;
        if (completed.open) collapsedCompleted.delete(date); else collapsedCompleted.add(date);
      });
      list.append(completed);
    }
    $('overdueSection').hidden = selected !== today || !overdue.length;
    $('overdueCount').textContent = overdue.length;
    $('overdueList').replaceChildren(...overdueEarlier.map(task => taskRow(task, false, [task], task.date, true)), ...overdueToday.map(task => taskRow(task, false, overdueToday, today, true)));
    // Only list skips that restoring would bring back. A routine later changed to other days no longer runs on this date.
    const skipped = data.tasks.filter(task => task.kind === 'weekly' && task.exceptions?.includes(selected) && (!task.endedOn || selected < task.endedOn) && scheduled({ ...task, exceptions: [] }, selected));
    $('skippedSection').hidden = !skipped.length;
    $('skippedList').replaceChildren(...skipped.map(task => {
      const item = el('div', 'history-item'), version = resolveTask(task, selected) || task;
      // Restoring a moved occurrence would leave the task on both days.
      const moved = data.tasks.find(item => item.movedFrom?.taskId === task.id && item.movedFrom.date === selected);
      if (moved) {
        const where = el('button', 'text-button moved-link', `Moved to ${fmt(moved.date, { weekday: 'short', month: 'short', day: 'numeric' })}`); where.type = 'button';
        where.setAttribute('aria-label', `${version.title} was moved to ${fmt(moved.date, { weekday: 'long', month: 'long', day: 'numeric' })}. Go to that day.`);
        where.onclick = () => { chooseDate(moved.date); if (!focusTask(moved.id)) $('inlineAdd').focus({ preventScroll: true }); };
        const label = el('span', 'history-title'); label.append(document.createTextNode(version.title), el('span', 'history-state', 'Moved'));
        item.append(label, where); return item;
      }
      const label = el('span', 'history-title'); label.append(document.createTextNode(version.title), el('span', 'history-state', 'Skipped'));
      item.append(label);
      const restore = el('button', 'text-button restore-occurrence', 'Restore occurrence'); restore.type = 'button';
      restore.onclick = () => { task.exceptions = task.exceptions.filter(date => date !== selected); if (!save()) return; focusTask(task.id); notify('Occurrence restored.'); };
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
    renderComingUp(); renderCalendar(); renderWeek();
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
    if (!editingId && !editingReadOnly) { $('dialogTitle').textContent = weekly ? 'Add routine' : 'Add task'; $('saveTask').textContent = weekly ? 'Add routine' : 'Add task'; }
    const converting = source?.kind === 'once' && weekly;
    $('routineChanges').hidden = !(source?.kind === 'weekly' && weekly);
    const date = $('taskDate').value;
    const begins = converting && date < today ? today : date;
    const days = selectedWeekdays();
    $('scheduleHint').textContent = validDate(date) ? weekly ? days.length ? `${recurrenceLabel(days)}, starting ${fmt(begins, { month: 'short', day: 'numeric', year: 'numeric' })}. Each date has its own checkbox.${converting ? ' This converts your one-time task. An earlier or completed original occurrence stays in history.' : editingId ? ' Earlier dates and completed occurrences keep their saved details.' : ''}` : 'Select at least one day for this routine.' : `Only on ${fmt(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}.` : 'Choose a date for this task.';
    $('workdaysPreset').setAttribute('aria-pressed', String(days.length === 5 && [1, 2, 3, 4, 5].every(day => days.includes(day))));
    $('everydayPreset').setAttribute('aria-pressed', String(days.length === 7));
  }
  const fieldErrors = { taskTitle: 'taskTitleError', taskDate: 'taskDateError', weeklyDays: 'weekdaysError', taskTime: 'taskTimeError', taskEffectiveDate: 'taskEffectiveDateError', taskDescription: 'taskDescriptionError' };
  const describedBy = { taskDescription: 'descriptionHint' };
  function clearFormProblems() {
    $('formError').textContent = ''; $('formError').classList.toggle('sr-only', false); $('scheduleHint').hidden = false;
    for (const [id, errorId] of Object.entries(fieldErrors)) {
      $(errorId).hidden = true; $(errorId).textContent = '';
      $(id).setAttribute('aria-invalid', 'false'); $(id).setAttribute('aria-describedby', describedBy[id] || '');
    }
  }
  // Shows a problem. With a field, the message sits under that field, which is marked invalid; the
  // form-level message (an alert) stays for screen readers but is not shown twice.
  function formProblem(message, id = null) {
    clearFormProblems();
    $('formError').textContent = message;
    if (!id) return;
    $(fieldErrors[id]).textContent = message; $(fieldErrors[id]).hidden = false;
    $(id).setAttribute('aria-invalid', 'true'); $(id).setAttribute('aria-describedby', [describedBy[id], fieldErrors[id]].filter(Boolean).join(' '));
    $('formError').classList.toggle('sr-only', true);
    if (id === 'weeklyDays') $('scheduleHint').hidden = true;
  }
  for (const id of ['taskTitle', 'taskDate', 'taskTime', 'taskEffectiveDate', 'taskDescription']) $(id).addEventListener('input', () => { if ($('formError').textContent) clearFormProblems(); });
  function setTaskOptions(expanded) {
    $('taskOptions').hidden = !expanded;
    $('toggleTaskOptions').setAttribute('aria-expanded', String(expanded));
    $('taskOptionsLabel').textContent = expanded ? 'Fewer options' : 'More options';
  }
  // Native validation runs before submit. Reveal invalid optional controls while
  // the browser can still focus them and show its validation message.
  $('taskForm').addEventListener('invalid', event => {
    if ($('taskOptions').contains(event.target)) setTaskOptions(true);
  }, true);
  $('toggleTaskOptions').onclick = () => {
    if (!$('taskOptions').hidden && $('taskForm').elements.timing.value === 'timed' && !validTime($('taskTime').value)) {
      formProblem('Choose a valid time, or select All day.', 'taskTime'); $('taskTime').focus(); return;
    }
    setTaskOptions($('taskOptions').hidden);
  };
  function openTask(task = null, kind = 'once') {
    const source = task ? data.tasks.find(item => item.id === task.id) || task : null;
    const effective = view === 'routines' || selected < today ? today : selected;
    editingReadOnly = Boolean(source?.kind === 'weekly' && source.endedOn && source.endedOn <= today);
    if (source?.kind === 'weekly') task = resolveTask(source, editingReadOnly ? selected : effective, editingReadOnly) || source;
    dialogCycle++;
    dialogFocusTarget = { taskId: task?.id, fallback: document.activeElement };
    setTaskOptions(Boolean(task));
    editingId = task?.id || null; $('taskForm').reset();
    // The task as stored when the window opened, to notice if another tab changes or deletes it meanwhile.
    editingBase = source ? JSON.stringify(data.tasks.find(item => item.id === source.id) || null) : null; clearFormProblems();
    $('dialogTitle').textContent = task ? task.kind === 'weekly' ? 'Edit routine' : 'Edit task' : 'Add task'; $('saveTask').textContent = task ? 'Save changes' : 'Add task'; $('deleteTask').hidden = !task;
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
    $('readOnlyNotice').hidden = !editingReadOnly;
    if (editingReadOnly) {
      $('dialogTitle').textContent = 'Routine history';
      $('deleteTask').hidden = true; $('routineChanges').hidden = true;
      $('scheduleHint').textContent = '';
    }
    $('taskDialog').showModal();
    taskFormStart = taskFormState();
    playMotion($('taskDialog'), [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    (editingReadOnly ? $('cancelDialog') : $('taskTitle')).focus();
  }
  $('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('taskDialog').open) return;
    clearFormProblems();
    const title = $('taskTitle').value.trim();
    const description = $('taskDescription').value.trim();
    const kind = $('taskForm').elements.kind.value;
    const date = $('taskDate').value;
    if (editingReadOnly) return;
    if (!title) { formProblem('Give your task a name.', 'taskTitle'); $('taskTitle').focus(); return; }
    if (description.length > 5000) { setTaskOptions(true); formProblem('Use up to 5,000 characters for the description.', 'taskDescription'); $('taskDescription').focus(); return; }
    if (!validDate(date)) { formProblem('Choose a valid date.', 'taskDate'); $('taskDate').focus(); return; }
    const weekdays = selectedWeekdays();
    if (kind === 'weekly' && !weekdays.length) { formProblem('Select at least one day for this routine.', 'weeklyDays'); weekdayInputs[0].focus(); return; }
    const time = $('taskForm').elements.timing.value === 'timed' ? $('taskTime').value : null;
    if (time !== null && !validTime(time)) { setTaskOptions(true); formProblem('Choose a valid time, or select All day.', 'taskTime'); $('taskTime').focus(); return; }
    const reminders = time ? reminderInputs.filter(input => input.checked).map(input => Number(input.value)).sort((a, b) => b - a) : [];
    let previous = data.tasks.find(task => task.id === editingId);
    // Another tab may have deleted or changed this task while the window was open.
    if (editingId && !previous) {
      if (!window.confirm('This task was deleted in another tab while you were editing it. Save your version as a new task?\n\nChoose Cancel to keep editing without saving.')) { formProblem('Not saved. This task was deleted in another tab.'); return; }
      editingId = null; editingBase = null;
    } else if (editingId && JSON.stringify(previous) !== editingBase) {
      if (!window.confirm('This task was changed in another tab while you were editing it. Save your version and replace those changes?\n\nChoose Cancel to keep editing without saving.')) { formProblem('Not saved. Close and reopen the task to see the other tab\'s changes.'); return; }
      editingBase = JSON.stringify(previous);
    }
    // Keep saved data within the limits the app accepts when it loads.
    if (!previous && data.tasks.length >= 20000) { formProblem('You have reached the 20,000-task limit. Delete unused tasks before adding more.'); return; }
    const id = editingId || newTaskId();
    const effective = $('taskEffectiveDate').value;
    if (previous?.kind === 'weekly' && kind !== 'weekly') { formProblem('Create a separate one-time task and end this routine to keep its history.'); return; }
    if (previous?.kind === 'weekly' && (!validDate(effective) || effective < today || (previous.endedOn && effective >= previous.endedOn))) { formProblem('Choose a changes-from date on or after today and before the routine ends.', 'taskEffectiveDate'); $('taskEffectiveDate').focus(); return; }
    // Compare with the routine as set up on the edited date, not a later scheduled change.
    // Changed reminder choices count too, so adding one to an overdue task sends no old alert.
    const before = previous?.kind === 'weekly' ? resolveTask(previous, effective, false) || previous : previous;
    const alertsChanged = !before || before.time !== time || before.kind !== kind || JSON.stringify(before.reminders || []) !== JSON.stringify(reminders) || (before.kind === 'once' ? before.date !== date : before.startDate !== date || JSON.stringify(before.weekdays) !== JSON.stringify(weekdays));
    const reminderFrom = alertsChanged ? Date.now() : (before.reminderFrom || 0);
    const task = { id, title, description, kind, time, reminders, reminderFrom, ...(kind === 'weekly' ? { weekdays, startDate: date } : { date, ...(previous?.movedFrom ? { movedFrom: previous.movedFrom } : {}) }) };
    const converted = previous?.kind === 'once' && kind === 'weekly';
    const begins = converted && date < today ? today : date;
    const record = kind === 'weekly' ? previous?.kind === 'weekly' ? reviseRoutine(previous, task, effective, data.completed) : createRoutine(task, previous, begins, data.completed) : task;
    if (record.versions?.length > 2000) { formProblem('This routine has reached its limit of 2,000 dated changes. Create a new routine and end this one.'); return; }
    dialogFocusTarget = { taskId: id };
    const wasEditing = Boolean(editingId);
    if (wasEditing) data.tasks = data.tasks.map(t => t.id === id ? record : t);
    else data.tasks.push(record);
    const shownBefore = { selected, month, view };
    if (!wasEditing || converted) {
      let first = parseDate(begins);
      if (kind === 'weekly') {
        while (!weekdays.includes(first.getDay())) first = plusDays(first, 1);
      }
      selected = dateKey(first);
      month = first;
      view = 'day';
    }
    // A change that fails the save checks keeps the dialog open with its reason.
    if (!save()) { ({ selected, month, view } = shownBefore); render(); return; }
    closeTaskDialog();
    if (converted) {
      notify('One-time task converted to a weekly routine.', () => { data.tasks = data.tasks.map(item => item.id === id ? previous : item); selected = previous.date; month = parseDate(selected); view = 'day'; });
    } else if (previous?.kind === 'weekly') {
      notify(`Routine changes apply from ${fmt(effective, { month: 'short', day: 'numeric', year: 'numeric' })}. History is preserved.`, () => { data.tasks = data.tasks.map(item => item.id === id ? previous : item); });
    } else notify(wasEditing ? 'Task updated.' : kind === 'weekly' ? 'Your weekly routine is ready.' : 'Task added to your day.');
  });
  $('taskDate').onchange = updateHint;
  [...$('taskForm').elements.kind].forEach(radio => radio.onchange = updateHint);
  [...$('taskForm').elements.timing].forEach(radio => radio.onchange = updateTimingFields);
  weekdayInputs.forEach(input => { input.onchange = () => { clearFormProblems(); updateHint(); }; });
  $('workdaysPreset').onclick = () => { selectWeekdays([1, 2, 3, 4, 5]); clearFormProblems(); updateHint(); };
  $('everydayPreset').onclick = () => { selectWeekdays([1, 2, 3, 4, 5, 6, 0]); clearFormProblems(); updateHint(); };
  $('deleteTask').onclick = () => {
    if (editingReadOnly) return;
    const task = data.tasks.find(t => t.id === editingId), index = data.tasks.findIndex(t => t.id === editingId);
    if (!task) { closeTaskDialog(); notify('This task was already deleted in another tab.'); return; }
    if (task.kind === 'weekly') {
      const effective = $('taskEffectiveDate').value;
      if (!validDate(effective) || effective < today) { formProblem('Choose an end date on or after today.', 'taskEffectiveDate'); $('taskEffectiveDate').focus(); return; }
      recovery?.keep('end-routine');
      const previousEnd = task.endedOn;
      const previousSnapshots = task.snapshots;
      task.snapshots = completedSnapshots(task, data.completed, effective);
      task.endedOn = effective;
      dialogFocusTarget = { fallback: $('addTask') };
      if (!save()) return;
      closeTaskDialog();
      notify(`Routine ends before ${fmt(effective, { month: 'short', day: 'numeric', year: 'numeric' })}. Earlier days and completion history are kept.`, () => { task.endedOn = previousEnd; task.snapshots = previousSnapshots; });
      return;
    }
    dialogFocusTarget = { taskId: data.tasks[index + 1]?.id || data.tasks[index - 1]?.id };
    recovery?.keep('delete');
    data.tasks.splice(index, 1); if (!save()) return; closeTaskDialog(); notify('Task deleted.', () => { data.tasks.splice(index, 0, task); });
  };
  for (const id of ['closeDialog', 'cancelDialog']) $(id).onclick = closeTaskDialog;
  $('taskDialog').addEventListener('cancel', event => { event.preventDefault(); closeTaskDialog(); });
  // Clicking outside the task window closes it, like Cancel. If anything was typed or changed,
  // ask first, so a stray click never throws away a draft.
  function taskFormState() {
    const form = $('taskForm').elements;
    return JSON.stringify([...['taskTitle', 'taskDescription', 'taskDate', 'taskTime', 'taskEffectiveDate'].map(id => $(id).value),
      form.kind.value, form.timing.value, ...weekdayInputs.map(input => input.checked), ...reminderInputs.map(input => input.checked)]);
  }
  function outsideTaskDialog(event) {
    const box = $('taskDialog').getBoundingClientRect();
    return event.target === $('taskDialog') && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
  }
  let pressStartedOutside = false;
  // Only a press that starts and ends outside counts, so selecting text and dragging past the edge is safe.
  $('taskDialog').addEventListener('pointerdown', event => { pressStartedOutside = outsideTaskDialog(event); });
  $('taskDialog').addEventListener('click', event => {
    const outside = pressStartedOutside && outsideTaskDialog(event); pressStartedOutside = false;
    if (!outside) return;
    if (!editingReadOnly && taskFormState() !== taskFormStart && !window.confirm('Discard your changes to this task?')) return;
    closeTaskDialog();
  });
  document.addEventListener('click', event => {
    // A row action may have just rebuilt the list. Keep its replacement menu open.
    if (!event.target.isConnected) return;
    for (const menu of document.querySelectorAll('.task-menu')) if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || ['taskDialog', 'restoreDialog', 'tabChoiceDialog', 'fileChoiceDialog'].some(id => $(id).open)) return;
    for (const menu of document.querySelectorAll('.task-menu')) if (menu.open) {
      event.preventDefault(); menu.open = false; menu.querySelector('summary').focus();
    }
  });
  $('addTask').onclick = () => openTask(null, view === 'routines' ? 'weekly' : 'once'); $('inlineAdd').onclick = () => openTask();
  $('todayNav').onclick = $('jumpToday').onclick = () => chooseDate(today); document.querySelector('.brand').onclick = event => { event.preventDefault(); chooseDate(today); };
  $('routinesNav').onclick = () => { if (view === 'routines') return; view = 'routines'; render(); revealView($('routinesView')); };
  $('prevWeek').onclick = () => chooseDate(dateKey(plusDays(parseDate(selected), -7))); $('nextWeek').onclick = () => chooseDate(dateKey(plusDays(parseDate(selected), 7)));
  $('sortDay').onclick = () => { delete data.weekdayOrders[parseDate(selected).getDay()]; if (!save()) return; $('dayOrderScope').focus({ preventScroll: true }); notify(`Automatic sorting restored for ${DAYS[parseDate(selected).getDay()]}. Other weekdays are unchanged.`); };
  $('sortRoutines').onclick = () => { data.routineOrder = null; if (!save()) return; $('routineOrderScope').focus({ preventScroll: true }); notify('Routine catalog sorted by due time. Daily orders are unchanged.'); };
  function shiftMonth(direction) { month = new Date(month.getFullYear(), month.getMonth() + direction, 1, 12); renderCalendar(); playMotion($('calendarGrid'), [{ opacity: .4, transform: `translateX(${direction * 5}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 170 }); }
  $('prevMonth').onclick = () => shiftMonth(-1); $('nextMonth').onclick = () => shiftMonth(1);
  function downloadData(text, name) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = el('a');
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadOriginalData() {
    if (originalSavedData === null) { notify('The original saved data could not be accessed. No recovery file was exported.'); return; }
    downloadData(originalSavedData, `day-by-day-recovery-${today}.json`);
    notify('Original saved data exported unchanged for recovery. This is not a validated backup and does not include session changes.');
  }
  $('downloadOriginalData').onclick = downloadOriginalData;
  function backup() {
    // Never label the empty fallback session as a backup of unreadable saved tasks.
    if (loadFailed) {
      if (!data.tasks.length) { downloadOriginalData(); return; }
      downloadData(JSON.stringify(data, null, 2), `day-by-day-session-${today}.json`);
      notify(originalSavedData !== null ? 'Unsaved session exported. Original saved data is separate; use Download original saved data in the warning to recover it.' : 'Unsaved session exported. Browser storage is still unavailable.');
      return;
    }
    downloadData(JSON.stringify(data, null, 2), `day-by-day-backup-${today}.json`);
    backupStatus = { lastExported: Date.now(), changes: 0, firstChangeAt: 0, snoozedUntil: 0 };
    persistBackupStatus(); renderBackupStatus();
    notify('Backup export started. Check that the file was saved.');
  }
  $('backupNow').onclick = backup;
  $('backupLater').onclick = () => { backupStatus.snoozedUntil = Date.now() + 86400000; persistBackupStatus(); renderBackupStatus(); };
  $('undoAction').onclick = () => {
    const action = undoAction; undoNotice.hide();
    if (action) { action(); if (!save()) return; notify('Change undone.'); (view === 'routines' ? $('addTask') : $('inlineAdd')).focus({ preventScroll: true }); }
  };
  $('dismissUndo').onclick = () => { undoNotice.hide(); $('inlineAdd').focus({ preventScroll: true }); };
  $('dismissToast').onclick = () => { toastNotice.hide(); $('inlineAdd').focus({ preventScroll: true }); };
  let restoreDecision = null, restoreFocusTarget = null;
  function confirmRestore(copyLabel = null) {
    restoreFocusTarget = document.activeElement;
    $('restoreTitle').textContent = copyLabel ? 'Restore this recovery copy?' : 'Restore backup?';
    $('confirmRestore').textContent = copyLabel ? 'Restore copy' : 'Restore backup';
    $('restoreMessage').textContent = loadFailed && originalSavedData !== null ? 'This replaces the original saved data that could not be loaded. Download the original saved data from the warning before continuing if you want to keep a recovery copy.' : copyLabel ? `This replaces your tasks and completion history with the copy from ${copyLabel}.` : 'This replaces the tasks and completion history in this browser. Export a backup first if you want to keep your current copy.';
    if (recovery?.isOn()) $('restoreMessage').textContent += ' A recovery copy of your current tasks is saved first.';
    if (fileStore?.isConnected()) $('restoreMessage').textContent += ' Restored tasks will also be automatically saved to your connected JSON file.';
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
      if (file.size > SIZE_LIMIT) throw new Error('This file is too large. Choose a Day by Day backup under 10 MB.');
      await replaceAllTasks(validate(JSON.parse(await file.text())));
    } catch (error) { notify(error instanceof SyntaxError ? 'This is not a valid JSON backup.' : error.message); }
    finally { $('restoreFile').value = ''; }
  };
  // Backups and recovery copies restore the same way: ask first, keep a copy of the current tasks, then replace.
  async function replaceAllTasks(next, copyLabel = null) {
    if ((data.tasks.length || originalSavedData !== null) && !await confirmRestore(copyLabel)) return false;
    undoNotice.hide();
    recovery?.keep('restore');
    data = next;
    // A rejected restore leaves current tasks, and any unreadable original, untouched.
    if (!save({ replaceUnreadable: true })) return false;
    const what = copyLabel ? 'Recovery copy' : 'Backup';
    if (persistent) {
      loadFailed = false; originalSavedData = null;
      $('storageWarning').hidden = true; $('downloadOriginalData').hidden = true; $('saveStatus').textContent = 'Saved in this browser';
      notify(`${what} restored.`);
    } else notify(fileStore?.isConnected() ? `${what} loaded. Check the task-file status above for the automatic save.` : `${what} loaded for this session, but browser storage could not save it.`);
    return true;
  }
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
      const viewTask = el('button', 'text-button', 'View this day'); viewTask.type = 'button'; viewTask.onclick = () => { chooseDate(alert.date); reminderPanelOpen = false; renderReminderPanel(); const row = [...$('taskList').querySelectorAll('.task-row')].find(item => item.dataset.id === alert.taskId); row?.scrollIntoView({ block: 'center', behavior: motionEnabled() ? 'smooth' : 'auto' }); row?.focus({ preventScroll: true }); }; card.append(viewTask); container.append(card);
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
  function loadOtherTab(value) {
    data = value ? validate(JSON.parse(value)) : empty();
    storedText = value;
    loadFailed = false; originalSavedData = null; persistent = true; browserUnsaved = false; rememberGood();
    $('storageWarning').hidden = true; $('downloadOriginalData').hidden = true; $('saveStatus').textContent = 'Saved in this browser';
    undoNotice.hide();
    render();
    checkReminders();
  }
  // Another tab saved while this tab still has changes the browser could not save.
  // Ask which copy to keep instead of silently replacing this tab's changes.
  let otherTabValue = null;
  function chooseTab(value) {
    otherTabValue = value;
    if (!$('tabChoiceDialog').open) { $('tabChoiceDialog').showModal(); $('tabChoiceKeep').focus(); }
  }
  $('tabChoiceKeep').onclick = () => {
    $('tabChoiceDialog').close();
    try { recovery?.keep('choice', otherTabValue ? JSON.parse(otherTabValue) : empty()); } catch (_) { /* Unreadable tasks can't be copied. */ }
    // The other tab already replaced any unreadable original in storage, so this tab may write again.
    loadFailed = false; storedText = otherTabValue;
    writeBrowserCopy(false);
    if (!browserUnsaved && originalSavedData !== null) {
      $('storageWarning').hidden = false; $('downloadOriginalData').hidden = false; $('retrySave').hidden = true;
      $('storageWarningText').textContent = 'Your tasks are saved in this browser. The earlier saved data that could not be loaded is no longer stored, but you can still download it here.';
    }
    render(); renderBackupStatus();
    notify(browserUnsaved ? "Kept this tab's tasks, but the browser still could not save them. Use Back up tasks to keep a copy." : "Kept this tab's tasks and saved them in this browser.");
  };
  $('tabChoiceOther').onclick = () => {
    $('tabChoiceDialog').close();
    recovery?.keep('choice');
    try { loadOtherTab(otherTabValue); notify("Loaded the other tab's tasks."); }
    catch (_) { notify("The other tab's tasks could not be read. This tab's tasks were kept."); }
  };
  $('tabChoiceBackup').onclick = backup;
  $('tabChoiceDialog').addEventListener('cancel', event => event.preventDefault());
  // Keep separate tabs in step and refresh the current date after midnight or sleep.
  window.addEventListener('storage', event => {
    if (event.key === KEY) {
      // A connected file is authoritative. Another tab's browser cache must not
      // replace pending edits or silently redirect this file's contents.
      if (fileStore?.ownsCache()) return;
      try {
        if (event.newValue) validate(JSON.parse(event.newValue));
        if (browserUnsaved) { chooseTab(event.newValue); return; }
        loadOtherTab(event.newValue);
      } catch (_) {
        loadFailed = true; originalSavedData = event.newValue;
        storageError('Tasks changed in another tab but could not be read. Download the original saved data for recovery. Changes will last only for this session.');
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
    const focusClass = ['check-button', 'edit-task', 'move-up', 'move-down', 'description-toggle', 'skip-task', 'move-today', 'move-tomorrow'].find(name => focused?.className?.split(' ').includes(name));
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
  render();
  checkReminders(); renderReminderPanel(); updateNotificationStatus(); renderBackupStatus();
  recovery = window.createRecoveryCopies({ sizeLimit: SIZE_LIMIT, validate, getData: () => data, restore: (next, label) => replaceAllTasks(next, label) });
  void recovery.init();
  fileStore = window.createTaskFileStorage({
    sizeLimit: SIZE_LIMIT, getData: () => data, validate, backup, hasRecovery: () => loadFailed, keepCopy: (reason, value) => recovery.keep(reason, value),
    waitForEditor: () => $('taskDialog').open ? new Promise(resolve => $('taskDialog').addEventListener('close', resolve, { once: true })) : null,
    applyData(next) {
      data = validate(next); undoNotice.hide();
      persistent = true; loadFailed = false; originalSavedData = null;
      $('storageWarning').hidden = true; $('downloadOriginalData').hidden = true;
      $('saveStatus').textContent = 'Saved in this browser';
      rememberGood();
      try { localStorage.setItem(KEY, lastGood); browserUnsaved = false; }
      catch (_) { storageError('The browser copy could not be saved.'); }
      render(); checkReminders(); renderBackupStatus();
    }
  });
  void fileStore.init();
  // The file store warns about its own pending writes. Warn here when changes reached neither copy,
  // or a recovery copy is still being written, since closing would leave it empty.
  window.addEventListener('beforeunload', event => {
    if ((browserUnsaved && !(fileStore.isConnected() && !fileStore.isPending())) || recovery.isPending()) { event.preventDefault(); event.returnValue = ''; }
  });
  // Pure date helpers are exposed for focused schedule verification.
  window.DayByDay = Object.freeze({ dateKey, parseDate, validDate, plusDays, monday, weekdaysOf, recurrenceLabel, scheduled, resolveTask, reviseRoutine, orderByIds, moveOrderedId, overdueTasks, validTime, taskTimeOrder, sortTasksByTime, dueTime, reminderKey, dueReminders, validate });
})();
