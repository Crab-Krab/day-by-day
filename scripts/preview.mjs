import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Serves the built app and the browser checks on this computer only, so the checks can load the app.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8766;
const routes = new Map([['/', 'Day-by-Day.html'], ['/Day-by-Day.html', 'Day-by-Day.html'], ['/tests/browser.html', 'tests/browser.html']]);
const server = http.createServer((request, response) => {
  const file = routes.get(new URL(request.url, 'http://localhost').pathname);
  if (!file || request.method !== 'GET') { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(path.join(root, file)));
});
server.listen(port, '127.0.0.1', () => {
  console.log(`App: http://127.0.0.1:${port}/`);
  console.log(`Browser checks: http://127.0.0.1:${port}/tests/browser.html`);
  console.log('Press Ctrl+C to stop.');
});
