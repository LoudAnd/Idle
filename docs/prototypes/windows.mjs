// Valid-window counts W_S (GDD 6.2) for every .seq file in a directory.
// A window is 8 consecutive listed terms, each an integer 0 <= t <= bound, with at
// least 3 distinct values and a sum of at least 8.
// Run: node windows.mjs <dir> [bound=20000]
import fs from 'node:fs';
const dir = process.argv[2] ?? '.';
const bound = BigInt(process.argv[3] ?? '20000');
for (const f of fs
  .readdirSync(dir)
  .filter((n) => n.endsWith('.seq'))
  .sort()) {
  const s = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const terms = s
    .split('\n')
    .filter((l) => /^%[STU] /.test(l))
    .map((l) => l.split(' ').slice(2).join(''))
    .join('')
    .split(',')
    .filter(Boolean)
    .map(BigInt);
  let w = 0;
  let last = -1;
  for (let i = 0; i + 8 <= terms.length; i++) {
    const win = terms.slice(i, i + 8);
    const ok =
      win.every((t) => t >= 0n && t <= bound) &&
      new Set(win.map(String)).size >= 3 &&
      win.reduce((a, b) => a + b, 0n) >= 8n;
    if (ok) {
      w++;
      last = i;
    }
  }
  const lastWin = last >= 0 ? terms.slice(last, last + 8).join(',') : '-';
  console.log(f.replace('.seq', ''), 'N', terms.length, 'W', w, 'last window', lastWin);
}
