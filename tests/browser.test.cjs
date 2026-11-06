// Optional real-browser runner. The default npm test needs no installed packages.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
async function main() {
  let chromium;
  try { ({ chromium } = require(process.env.DAY_BY_DAY_PLAYWRIGHT_PATH || 'playwright')); }
  catch { throw Error('Browser tests need Playwright. Install it separately, or set DAY_BY_DAY_PLAYWRIGHT_PATH to its module directory. See docs/TESTING.md.'); }
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = req.url === '/Day-by-Day.html' ? 'Day-by-Day.html' : req.url === '/' ? 'tests/ui-browser.html' : req.url === '/legacy' ? 'tests/browser.html' : null;
    if (!file) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(path.join(root, file)));
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(process.env.DAY_BY_DAY_BROWSER_CHANNEL ? { channel: process.env.DAY_BY_DAY_BROWSER_CHANNEL } : {}) });
    console.log('Browser version:', browser.version());
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      page.on('console', msg => { if (msg.text().startsWith('PASS ')) console.log(msg.text()); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.clock.install({ time: new Date('2026-11-06T14:00:00Z') });
      await page.getByRole('button', { name: 'Run browser checks' }).click();
      await page.waitForFunction(() => ['passed', 'failed'].includes(document.getElementById('status').dataset.state), { timeout: 120000 });
      if (process.env.DAY_BY_DAY_BROWSER_OUTPUT) {
        fs.mkdirSync(process.env.DAY_BY_DAY_BROWSER_OUTPUT, { recursive: true });
        await page.screenshot({ path: path.join(process.env.DAY_BY_DAY_BROWSER_OUTPUT, `checks-${reducedMotion}.png`), fullPage: true });
      }
      assert.equal(await page.locator('#status').getAttribute('data-state'), 'passed', await page.locator('#results').innerText());
      assert.deepEqual(errors, []);
      console.log(`${reducedMotion}: ${await page.locator('#status').innerText()}`);
      if (process.env.DAY_BY_DAY_BROWSER_OUTPUT) {
        fs.mkdirSync(process.env.DAY_BY_DAY_BROWSER_OUTPUT, { recursive: true });
        await page.locator('iframe').screenshot({ path: path.join(process.env.DAY_BY_DAY_BROWSER_OUTPUT, `mobile-${reducedMotion}.png`) });
      }
      // Use trusted browser input in the standalone page as well as DOM-level
      // checks in the harness. This catches invisible overlays and focus traps.
      const fixture = await page.evaluate(() => window.fixture.toString());
      const standalone = await context.newPage();
      standalone.on('pageerror', error => errors.push(error.message));
      await standalone.clock.install({ time: new Date('2026-11-06T14:00:00Z') });
      await standalone.addInitScript({ content: `(${fixture})();` });
      for (const width of [1366, 390]) {
        await standalone.setViewportSize({ width, height: 900 });
        await standalone.goto(`http://127.0.0.1:${server.address().port}/Day-by-Day.html`);
        await standalone.locator('#createTaskFile').click();
        await standalone.locator('#taskFilePanel[data-state="saved"]').waitFor();
        const label = `trusted input ${width}px ${reducedMotion}`;
        await standalone.locator('#addTask').click();
        await standalone.locator('#taskTitle').fill('Keyboard entry');
        await standalone.locator('#taskTitle').press('Enter');
        await standalone.locator('#taskDialog').waitFor({ state: 'hidden' });
        assert.equal(await standalone.getByText('Keyboard entry', { exact: true }).count(), 1);
        const checkbox = standalone.locator('[data-id="walk"] .check-button');
        await checkbox.click({ position: { x: 4, y: 4 } });
        assert.equal(await checkbox.getAttribute('aria-pressed'), 'true');
        await checkbox.click({ position: { x: 4, y: 4 } });
        assert.equal(await checkbox.getAttribute('aria-pressed'), 'false');
        const menu = standalone.locator('#taskList [data-id="routine"] .task-menu');
        await menu.locator('summary').focus(); await menu.locator('summary').press('Enter');
        assert.equal(await menu.evaluate(node => node.open), true);
        await standalone.keyboard.press('Escape');
        assert.equal(await menu.evaluate(node => node.open), false);
        assert.equal(await menu.locator('summary').evaluate(node => node === document.activeElement), true);
        await standalone.locator('#addTask').click();
        await standalone.locator('#taskTitle').fill('Task with a due time');
        await standalone.locator('#toggleTaskOptions').click();
        await standalone.locator('input[name="timing"][value="timed"] + span').click();
        await standalone.locator('#saveTask').click();
        assert.equal(await standalone.locator('#taskDialog').evaluate(node => node.open), true);
        assert.equal(await standalone.locator('#taskTime').evaluate(node => node === document.activeElement), true);
        await standalone.locator('#taskTime').fill('23:59');
        await standalone.locator('#saveTask').click();
        await standalone.locator('#taskDialog').waitFor({ state: 'hidden' });
        console.log(`PASS ${label}: Enter to add, checkbox edges, native keyboard menu/Escape, visible required-time validation, full editor save`);
        if (process.env.DAY_BY_DAY_BROWSER_OUTPUT) {
          await standalone.evaluate(() => scrollTo(0, 0));
          const name = `${width === 1366 ? 'desktop' : 'mobile'}-${reducedMotion}`;
          await standalone.screenshot({ path: path.join(process.env.DAY_BY_DAY_BROWSER_OUTPUT, `${name}.png`), fullPage: true });
          if (process.env.DAY_BY_DAY_BROWSER_EMIT_PREVIEW === 'true' && reducedMotion === 'no-preference') {
            const jpeg = await standalone.screenshot({ type: 'jpeg', quality: 75, fullPage: true });
            console.log(`::group::Visual preview ${name}`);
            console.log(`UI_PREVIEW_START ${name}.jpg`);
            const encoded = jpeg.toString('base64');
            for (let offset = 0; offset < encoded.length; offset += 8000) console.log('UI_PREVIEW_CHUNK ' + encoded.slice(offset, offset + 8000));
            console.log('UI_PREVIEW_END'); console.log('::endgroup::');
          }
        }
      }
      const legacy = await context.newPage();
      legacy.on('pageerror', error => errors.push(error.message));
      await legacy.clock.install({ time: new Date('2026-11-06T14:00:00Z') });
      await legacy.goto(`http://127.0.0.1:${server.address().port}/legacy`);
      await legacy.getByRole('button', { name: 'Run browser checks' }).click();
      await legacy.waitForFunction(() => !document.getElementById('run').disabled, { timeout: 120000 });
      const legacyStatus = await legacy.locator('#status').innerText();
      assert.match(legacyStatus, /^All \d+ browser checks passed$/, await legacy.locator('#results').innerText());
      console.log(`${reducedMotion}: v1.5.0 regression: ${legacyStatus}`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
