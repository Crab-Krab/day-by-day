// Guards for interface changes. The scripts find their buttons and panels by name, so a renamed or
// duplicated name in index.html would quietly stop a button from working. Looking around the app
// (changing dates and views, opening menus and the editor, then cancelling) must never change saved tasks.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { boot, html } = require('./helpers/runtime.cjs');

// Every name in index.html is used once.
const declared = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicates = declared.filter((id, index) => declared.indexOf(id) !== index);
assert.deepEqual(duplicates, [], 'index.html repeats element ids');
const present = new Set(declared);

// Every name the scripts look up exists in index.html: direct lookups, and lists of names used with $(id).
const referenced = new Set();
for (const file of ['app.js', 'file-storage.js', 'recovery.js', 'theme.js']) {
  const code = fs.readFileSync('src/' + file, 'utf8');
  for (const match of code.matchAll(/(?:\$|getElementById)\('([A-Za-z0-9_-]+)'\)/g)) referenced.add(match[1]);
  for (const match of code.matchAll(/\[((?:\s*'[A-Za-z0-9_-]+'\s*,?)+)\][^;\n]{0,40}?\$\(id\)/g)) {
    for (const name of match[1].matchAll(/'([A-Za-z0-9_-]+)'/g)) referenced.add(name[1]);
  }
}
assert.ok(referenced.size > 100, 'the element lookup scan found too few names to be trusted');
const missing = [...referenced].filter(id => !present.has(id));
assert.deepEqual(missing, [], 'scripts look up element ids that index.html no longer has');

// Shared page parts the scripts find by class or attribute still exist.
const classes = new Set([...html.matchAll(/\sclass="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/)));
for (const name of ['app-shell', 'sidebar', 'main-nav', 'brand', 'topbar-actions', 'calendar-weekdays']) assert.ok(classes.has(name), `index.html lost the .${name} element the scripts use`);
assert.match(html, /<meta name="theme-color"/, 'theme.js needs the theme-color meta tag');
// The build replaces each of these tags exactly once.
for (const tag of ['<link rel="stylesheet" href="styles.css">', '<script src="theme.js"></script>', '<script src="app.js" defer></script>', '<script src="schedule.js" defer></script>', '<script src="recovery.js" defer></script>', '<script src="file-storage.js" defer></script>']) {
  assert.equal(html.split(tag).length - 1, 1, `index.html must contain ${tag} once for the build`);
}
// The 2.0 palette replaced the green one everywhere: styles, theme colors, and the tab icon.
const legacyGreens = ['236653', '1b5142', '397a5f', '3c8062', 'dfe8d7', '2c604b', 'd0dfc6', 'f2f5ed', 'e8eee0', 'f8faf4', '68785f', '96643d', '7a8d6e', 'f6f7f2', 'eef1e8', '243c34', '151c19', '202b25', '85a970', '79a16d', 'd6e8c6', 'd2e7ba', '284f3e', '3b6046', 'e0efb7', 'fff2df', '815218', '17291f', '070d0a'];
for (const file of ['styles.css', 'theme.js', 'index.html', 'app.js']) {
  const text = fs.readFileSync('src/' + file, 'utf8').toLowerCase();
  const found = legacyGreens.filter(hex => text.includes('#' + hex) || text.includes('%23' + hex));
  assert.deepEqual(found, [], `src/${file} still uses colors from the old green palette`);
}
assert.doesNotMatch(fs.readFileSync('src/styles.css', 'utf8'), /Georgia/, 'the serif headings were replaced by the system font');
// 2.0 removed the decorative slogans and kept the footer line.
for (const slogan of ['YOUR EVERYDAY SPACE', 'A little progress, every day.', 'Make room for what matters.', 'MAKE A LITTLE PLAN', 'A RHYTHM THAT WORKS FOR YOU', 'A fresh day. A little space']) assert.equal(html.includes(slogan), false, `slogan "${slogan}" came back`);
assert.match(html, /Less remembering\. More doing\./, 'the footer line stays');
assert.match(html, /<a class="skip-link" href="#mainContent">/, 'the skip link leads to the main content');
console.log(`Markup passed: ${declared.length} unique element ids, all ${referenced.size} looked up by the scripts present, shared page parts and build tags intact.`);

// A saved file using every part of format 5: routine versions, a completed snapshot, a skipped and a
// moved occurrence, an ended routine, an earlier overdue task, timed reminders, long text, and both
// order kinds. The screenshot script uses the same file.
const sample = JSON.parse(fs.readFileSync('tests/fixtures/sample-tasks.json', 'utf8'));
const key = 'day-by-day.v1';
const app = boot(new Map([[key, JSON.stringify(sample)]]), new Date(2026, 9, 28, 10, 0).getTime());
const { validate } = app.context.window.DayByDay;
assert.deepEqual(JSON.parse(JSON.stringify(validate(JSON.parse(JSON.stringify(sample))))), JSON.parse(JSON.stringify(sample)), 'the sample is already in normalized format 5');
assert.equal(app.ids.overdueSection.hidden, false, 'the sample shows an Overdue section');
const before = app.storage.get(key);
const row = id => [...app.ids.taskList.querySelectorAll('.task-row'), ...app.ids.overdueList.querySelectorAll('.task-row')].find(node => node.dataset.id === id);

// Look around without changing anything.
app.ids.nextWeek.onclick(); app.ids.prevWeek.onclick();
app.ids.nextMonth.onclick(); app.ids.prevMonth.onclick();
app.ids.jumpDate.value = '2026-10-29'; app.ids.jumpDate.onchange();
app.ids.todayNav.onclick();
app.ids.routinesNav.onclick(); app.ids.endedRoutines.open = true; app.ids.endedRoutines.dispatch('toggle');
app.ids.todayNav.onclick();
const menu = row('call').querySelector('.task-menu'); menu.open = true; menu.dispatch('toggle'); menu.open = false; menu.dispatch('toggle');
const completedGroup = app.ids.taskList.querySelector('.completed-tasks'); completedGroup.open = false; completedGroup.dispatch('toggle');
row('call').querySelector('.edit-task').onclick(); assert.equal(app.ids.taskDialog.open, true); app.ids.cancelDialog.onclick(); assert.equal(app.ids.taskDialog.open, false);
app.ids.addTask.onclick(); app.ids.cancelDialog.onclick();
app.ids.manageTaskFile.onclick(); app.ids.manageTaskFile.onclick();
app.flushTimeouts();
assert.equal(app.storage.get(key), before, 'looking around changed the saved tasks');

// A backup of the sample restores the same tasks and history.
app.ids.backupBtn.onclick();
(async () => {
  const exported = JSON.parse(await app.downloads.at(-1).blob.text());
  assert.equal(exported.version, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(validate(exported))), JSON.parse(JSON.stringify(validate(JSON.parse(before)))));
  console.log('Presentation safety passed: changing weeks, months, dates and views, opening menus, Completed, saving details and the editor, then cancelling, left a full format-5 sample unchanged, and its backup restores the same data.');
})().catch(error => { console.error(error); process.exitCode = 1; });
