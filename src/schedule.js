'use strict';
// Pure scheduling, history, reminder and validation logic, with no page access.
// The app and the tests both load this file, so neither has to copy it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DayByDayCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DAYS = Array.from({ length: 7 }, (_, day) => weekdayLabel(day));
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
    // Skipping wins over saved details, so Skip works on an edited, unchecked occurrence.
    if (task.exceptions?.includes(date)) return false;
    if (task.snapshots?.[date]) return true;
    if (task.endedOn && date >= task.endedOn) return false;
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
        if (t.movedFrom == null) return { ...task, date: t.date };
        // A routine occurrence moved to another day remembers where it came from.
        if (typeof t.movedFrom !== 'object' || typeof t.movedFrom.taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(t.movedFrom.taskId) || !validDate(t.movedFrom.date)) throw new Error('Invalid moved task.');
        return { ...task, date: t.date, movedFrom: { taskId: t.movedFrom.taskId, date: t.movedFrom.date } };
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
      if (task.kind !== 'weekly') continue;
      // Older versions could record a day as both done and skipped, and showed it as done. Keep it done.
      if (task.exceptions.includes(date)) task.exceptions = task.exceptions.filter(day => day !== date);
      if (!scheduled(task, date) && !task.snapshots[date]) task.snapshots[date] = routineFields(routineVersion(task, date) || task);
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
  return Object.freeze({ DAYS, dateKey, weekdayLabel, parseDate, validDate, plusDays, monday, weekdaysOf, recurrenceLabel, routineFields, createRoutine, routineVersion, resolveTask, scheduled, completedSnapshots, reviseRoutine, orderByIds, moveOrderedId, lastRoutineDate, overdueTasks, validTime, taskTimeOrder, sortTasksByTime, descriptionPreview, descriptionParts, dueTime, formatTime, reminderKey, dueReminders, validate });
});
