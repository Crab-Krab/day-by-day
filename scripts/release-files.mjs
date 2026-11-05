import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Release downloads use friendlier names than the repository paths, in the order earlier releases used.
const files = [
  ['Day-by-Day.html', 'Day-by-Day.html'],
  ['LICENSE', 'LICENSE.txt'],
  ['docs/USAGE.txt', 'Read-me.txt'],
  ['docs/FILE-AUTOSAVE.md', 'File-autosave-guide.md'],
];
const out = path.join(root, 'release');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const sums = files.map(([from, to]) => {
  const bytes = fs.readFileSync(path.join(root, from));
  fs.writeFileSync(path.join(out, to), bytes);
  return crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + to;
});
// Checksums use the release names, so downloaded files can be checked with sha256sum -c.
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log('Prepared release files in release/.');
