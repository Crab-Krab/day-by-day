// Optional real-browser runner. The default npm test needs no installed packages.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
async function main() {
  let chromium, browserType;
  try { const pw = require(process.env.DAY_BY_DAY_PLAYWRIGHT_PATH || 'playwright'); chromium = pw.chromium; browserType = process.env.DAY_BY_DAY_BROWSER_TYPE === 'firefox' ? pw.firefox : chromium; }
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
    browser = await browserType.launch({ headless: true, ...(browserType === chromium && process.env.DAY_BY_DAY_BROWSER_CHANNEL ? { channel: process.env.DAY_BY_DAY_BROWSER_CHANNEL } : {}) });
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
        if (await standalone.locator('#taskFileDetails').isHidden()) await standalone.locator('#manageTaskFile').click();
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
    // Everyone opens the downloaded file straight from disk, so check that too: adding,
    // reloading, no errors, no blocked content, and no requests beyond the file itself.
    const local = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await local.newPage(), problems = [], requests = [];
    page.on('pageerror', error => problems.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') problems.push(msg.text()); });
    page.on('request', request => { if (!/^(file|data|blob):/.test(request.url())) requests.push(request.url()); });
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => console.error('Blocked by the page policy: ' + event.violatedDirective)));
    await page.goto(require('node:url').pathToFileURL(path.join(root, 'Day-by-Day.html')).href);
    await page.locator('#addTask').click();
    await page.locator('#taskTitle').fill('Opened from disk');
    await page.locator('#taskTitle').press('Enter');
    await page.locator('#taskDialog').waitFor({ state: 'hidden' });
    await page.reload();
    assert.equal(await page.getByText('Opened from disk', { exact: true }).count(), 1);
    assert.deepEqual(problems, []);
    assert.deepEqual(requests, []);
    // The page policy is really in force: code the app didn't ship is refused, and nothing can connect out.
    const refused = await page.evaluate(() => new Promise(resolve => {
      const seen = [];
      document.addEventListener('securitypolicyviolation', event => { seen.push(event.violatedDirective.split('-')[0]); if (seen.length === 2) resolve(seen.sort()); });
      const extra = document.createElement('script'); extra.textContent = 'window.notShipped = true'; document.head.append(extra);
      fetch('https://example.com/').catch(() => {});
      setTimeout(() => resolve(seen.sort()), 2000);
    }));
    assert.deepEqual(refused, ['connect', 'script']);
    assert.equal(await page.evaluate(() => window.notShipped), undefined);
    console.log('PASS file:// opening: add, reload, no errors, nothing blocked, no outside requests, and the page policy refuses outside code and connections');
    await local.close();
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
