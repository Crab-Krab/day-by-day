// Takes review screenshots of the built Day-by-Day.html with the sample tasks in tests/fixtures,
// at the widths the redesign is checked at, in light and dark. Run `npm run build` first.
// Needs Playwright, installed the same way as for `npm run test:browser` (see docs/TESTING.md).
// Usage: node scripts/screenshots.mjs <output folder> [width,width,...]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DAY_BY_DAY_PLAYWRIGHT_PATH || 'playwright');
const output = path.resolve(process.argv[2] || 'screenshots');
const widths = (process.argv[3] || '320,375,768,1024,1366,1920,2560').split(',').map(Number);
const sample = fs.readFileSync(path.join(root, 'tests/fixtures/sample-tasks.json'), 'utf8');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url !== '/Day-by-Day.html') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(path.join(root, 'Day-by-Day.html')));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/Day-by-Day.html`;
// Each scene starts from the same saved tasks and the same moment: Wednesday, October 28, 2026, 10:00.
const scenes = {
  day: async () => {},
  reminders: async page => { await page.locator('#reminderPanel').waitFor(); },
  routines: async page => { await page.locator('#routinesNav').click(); await page.locator('#endedRoutines summary').click(); },
  editor: async page => { await page.locator('#addTask').click(); await page.locator('#toggleTaskOptions').click(); },
  // On screens too narrow for its column, Coming up starts folded below the checklist.
  'coming-up-open': async page => { if (await page.locator('#comingUpToggle').isVisible()) { await page.locator('#comingUpToggle').click(); await page.locator('#comingUp').scrollIntoViewIfNeeded(); } },
  'saving-open': async page => { await page.locator('#manageTaskFile').click(); },
  // A routine with no days shows its message under the days, with More options still folded.
  'editor-error': async page => {
    await page.locator('#addTask').click(); await page.locator('#taskTitle').fill('Stretch');
    await page.locator('label:has(input[name="kind"][value="weekly"])').click();
    for (const box of await page.locator('input[name="weekdays"]:checked').all()) await box.evaluate(input => input.click());
    await page.locator('#saveTask').click();
  },
  'routine-history': async page => {
    await page.locator('#routinesNav').click(); await page.locator('#endedRoutines summary').click();
    await page.locator('#endedRoutineList .text-button').first().click(); await page.locator('[data-id="piano"] .edit-task').first().click();
  },
  'edit-routine': async page => { await page.locator('[data-id="gym"] .edit-task').first().click(); },
  'empty-day': async page => { await page.evaluate(() => { const input = document.getElementById('jumpDate'); input.value = '2026-11-01'; input.dispatchEvent(new Event('change')); }); }
};
const browser = await chromium.launch();
let count = 0;
try {
  for (const theme of ['light', 'dark']) for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
    await context.addInitScript(([tasks, theme]) => {
      localStorage.clear(); localStorage.setItem('day-by-day.v1', tasks); localStorage.setItem('day-by-day.theme', theme);
      localStorage.setItem('day-by-day.backup.v1', JSON.stringify({ lastExported: Date.now(), changes: 0 }));
    }, [sample, theme]);
    for (const [name, act] of Object.entries(scenes)) {
      const page = await context.newPage();
      await page.clock.install({ time: new Date(2026, 9, 28, 10, 0) });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.locator('#dayTitle').waitFor();
      // The sample's 9:00 task has reminders, so the reminder panel opens. Only its own scene keeps it.
      if (name !== 'reminders') { await page.locator('#reminderPanel').waitFor({ timeout: 2000 }).catch(() => {}); if (await page.locator('#reminderPanel').isVisible()) await page.locator('#dismissAllReminders').click(); }
      await act(page);
      await page.mouse.move(0, 0); // so no hover color shows in the picture
      await page.waitForTimeout(100);
      const dialog = await page.locator('dialog[open]').count();
      await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`), fullPage: !dialog });
      if (errors.length) throw Error(`${name} at ${width}px (${theme}): ${errors.join('; ')}`);
      await page.close(); count++;
    }
    await context.close();
  }
} finally { await browser.close(); server.close(); }
console.log(`Saved ${count} screenshots to ${output}`);
