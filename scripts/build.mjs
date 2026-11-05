import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
const escapeScript = text => text.replace(/<\/script/gi, '<\\/script');
let html = read('index.html');
// Fail instead of silently producing an HTML that still points at missing source files.
function inline(target, replacement) {
  const count = html.split(target).length - 1;
  if (count !== 1) throw new Error(`Build stopped: expected "${target}" once in src/index.html, found it ${count} times.`);
  html = html.replace(target, () => replacement);
}
const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').trim();
inline('<!doctype html>', '<!doctype html>\n<!--\n' + license + '\n-->');
inline('<link rel="stylesheet" href="styles.css">', '<style>' + read('styles.css') + '</style>');
inline('<script src="theme.js"></script>', '<script>' + escapeScript(read('theme.js')) + '</script>');
inline('<script src="app.js" defer></script>', '');
inline('<script src="file-storage.js" defer></script>', '');
inline('</body>', '<script>' + escapeScript(read('file-storage.js') + '\n' + read('app.js')) + '</script>\n</body>');
fs.writeFileSync(path.join(root, 'Day-by-Day.html'), html);
// Checksums for the release downloads stay in step with every build.
const sums = ['Day-by-Day.html', 'docs/USAGE.txt', 'LICENSE']
  .map(file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') + '  ' + file)
  .join('\n') + '\n';
fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), sums);
console.log('Built Day-by-Day.html and updated SHA256SUMS.txt. Open the HTML directly in your browser.');
