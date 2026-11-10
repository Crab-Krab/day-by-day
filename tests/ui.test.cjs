const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { boot } = require('./helpers/runtime.cjs');
const clock = new Date(2026, 9, 28, 0, 0).getTime();
const tasks = [
  { id: 'a', title: 'First', kind: 'weekly', weekdays: [3], startDate: '2026-10-01' },
  { id: 'b', title: 'Second', kind: 'once', date: '2026-10-28', time: '12:00', reminders: [15] },
  { id: 'c', title: 'Third', kind: 'once', date: '2026-10-28' }
];
const saved = () => new Map([['day-by-day.v1', JSON.stringify({ version: 5, tasks, completed: { '2026-10-28': ['c'] } })]]);
function row(app, id) { return app.ids.taskList.querySelectorAll('.task-row').find(node => node.dataset.id === id); }

const quick = boot(new Map(), clock);
quick.ids.addTask.onclick();
assert.equal(quick.ids.taskOptions.hidden, true);
assert.equal(quick.ids.toggleTaskOptions.getAttribute('aria-expanded'), 'false');
assert.equal(quick.ids.taskDate.value, '2026-10-28');
quick.ids.taskTitle.value = 'Quick entry'; quick.ids.taskForm.dispatch('submit');
assert.equal(quick.state().tasks[0].time, null);
assert.equal(quick.state().tasks[0].description, '');
assert.equal(quick.ids.taskDialog.open, false);
quick.ids.taskForm.dispatch('submit'); assert.equal(quick.state().tasks.length, 1);
quick.ids.taskList.querySelector('.edit-task').onclick();
assert.equal(quick.ids.taskOptions.hidden, false);
quick.ids.toggleTaskOptions.onclick(); assert.equal(quick.ids.taskOptions.hidden, true);
quick.ids.toggleTaskOptions.onclick(); assert.equal(quick.ids.taskOptions.hidden, false);
quick.ids.taskForm.elements.timing.value = 'timed'; quick.ids.taskForm.elements.timing[1].onchange();
quick.ids.toggleTaskOptions.onclick();
assert.equal(quick.ids.taskOptions.hidden, false); assert.match(quick.ids.formError.textContent, /valid time/);
quick.ids.taskTime.value = '13:30'; quick.ids.toggleTaskOptions.onclick();
assert.equal(quick.ids.taskOptions.hidden, true);
quick.ids.taskForm.dispatch('submit'); assert.equal(quick.state().tasks[0].time, '13:30');
quick.ids.routinesNav.onclick(); quick.ids.addTask.onclick();
assert.equal(quick.ids.taskOptions.hidden, false); assert.equal(quick.ids.weeklyDays.hidden, false);
console.log('Quick-entry UI passed: compact defaults, full edit/routine controls, toggling, hidden-time validation, preserved values, and duplicate-submit protection.');

const app = boot(saved(), clock);
assert.match(app.ids.dayOrderScope.textContent, /Due time.*every Wednesday/);
assert.equal(row(app, 'a').querySelector('.move-down').getAttribute('aria-describedby'), 'dayOrderScope');
const menu = row(app, 'a').querySelector('.task-menu');
assert.equal(menu.open, false); assert.equal(menu.querySelector('.move-up'), null); assert.ok(row(app, 'a').children[0].className.includes('task-order')); // arrows sit left of the task, outside More
assert.ok(menu.querySelector('.skip-task')); assert.ok(row(app, 'b').querySelector('.task-menu').querySelector('.reminder-meta'));
row(app, 'a').querySelector('.move-up').onclick();
assert.match(app.ids.dayOrderScope.textContent, /Custom order.*every Wednesday/);
assert.equal(row(app, 'a').querySelector('.task-menu').open, false); // moving never opens More
app.ids.sortDay.onclick();
assert.match(app.ids.dayOrderScope.textContent, /^Due time/);
assert.equal(app.context.document.activeElement, app.ids.dayOrderScope);
app.ids.routinesNav.onclick();
assert.match(app.ids.routineOrderScope.textContent, /catalog only/);
assert.equal(app.ids.routineList.querySelector('.move-up').getAttribute('aria-describedby'), 'routineOrderScope');
console.log('Row/order UI passed: closed secondary actions, reminder details, scope before reordering, retained open menu, custom-order label, accessible reset focus, and catalog scope.');

const completed = boot(saved(), clock);
let group = completed.ids.taskList.querySelector('.completed-tasks');
assert.equal(group.open, true); assert.equal(group.querySelector('summary').textContent, 'Completed · 1');
group.open = false; group.dispatch('toggle');
row(completed, 'a').querySelector('.check-button').onclick();
group = completed.ids.taskList.querySelector('.completed-tasks');
assert.equal(group.open, false); assert.equal(group.querySelector('summary').textContent, 'Completed · 2');
assert.equal(completed.context.document.activeElement, group.querySelector('summary'));
assert.deepEqual(Array.from(completed.state().completed['2026-10-28']), ['c', 'a']);
completed.ids.nextWeek.onclick(); completed.ids.prevWeek.onclick();
assert.equal(completed.ids.taskList.querySelector('.completed-tasks').open, false);
group = completed.ids.taskList.querySelector('.completed-tasks'); group.open = true; group.dispatch('toggle');
row(completed, 'c').querySelector('.check-button').onclick();
assert.deepEqual(Array.from(completed.state().completed['2026-10-28']), ['a']);
assert.equal(completed.ids.taskList.querySelector('.completed-tasks').open, true);
assert.equal(boot(completed.storage, clock).ids.taskList.querySelector('.completed-tasks').open, true);
console.log('Completed UI passed: count, collapse across mutations/navigation, visible keyboard focus after completion, expand/uncheck, and unchanged stored history.');

const stalled = boot(new Map(), clock, { motion: true });
stalled.ids.addTask.onclick();
assert.equal(stalled.animations.at(-1).cancelled, false);
stalled.ids.cancelDialog.onclick();
assert.equal(stalled.ids.taskDialog.open, false);
assert.equal(stalled.animations.at(-1).cancelled, true);
stalled.ids.addTask.onclick(); stalled.ids.taskTitle.value = 'After a stalled animation'; stalled.ids.taskForm.dispatch('submit');
assert.equal(stalled.ids.taskDialog.open, false); assert.equal(stalled.state().tasks.length, 1);
console.log('Dialog regression passed: an animation that never finishes cannot retain the modal or block a subsequent add/save.');
