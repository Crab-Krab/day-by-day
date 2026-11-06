// Optional real-browser runner. The default npm test needs no installed packages.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
async function main() {
  let chromium;
  try { ({ chromium } = require(process.env.DAY_BY_DAY_PLAYWRIGHT_PATH || 'playwright')); }
  catch { throw Error('Browser tests need Playwright. Install it separately, or set DAY_BY_DAY_PLAYWRIGHT_PATH to its module directory. See docs/UI-TESTING.md.'); }
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = req.url === '/Day-by-Day.html' ? 'Day-by-Day.html' : req.url === '/' ? 'tests/browser.html' : null;
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
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
