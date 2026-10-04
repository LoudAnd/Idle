// CC0 viscious-speed icon complexity (GDD 16.2): command letters in the source d
// attributes, background square excluded, counted before svgo. Prints the role table.
// Run: node icon_complexity.mjs
import fs from 'node:fs';
const dir = (process.env.ASSET_SRC_ICONS ?? '/home/user/game-icons/icons') + '/viscious-speed';
const excl = new Set(['003', '008', '018', '019', '023', '037', '041', '046', '085', '101', '115']);
const rows = [];
for (const f of fs
  .readdirSync(dir)
  .filter((f) => /^abstract-\d{3}\.svg$/.test(f))
  .sort()) {
  const s = fs.readFileSync(dir + '/' + f, 'utf8');
  const ds = [...s.matchAll(/\sd="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((d) => d !== 'M0 0h512v512H0z');
  const n = ds.reduce((a, d) => a + (d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length, 0);
  const id = f.slice(9, 12);
  rows.push({ id, n, excl: excl.has(id), paths: ds.length });
}
const el = rows.filter((r) => !r.excl).sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));
console.log('eligible', el.length, 'excluded', rows.filter((r) => r.excl).length);
console.log(
  'sorted first 20:',
  el
    .slice(0, 20)
    .map((r) => r.id + ':' + r.n)
    .join(' '),
);
// strict ladder: next icon with strictly greater count, ties by number
const lad = [];
let last = -1;
for (const r of el) {
  if (r.n > last) {
    lad.push(r);
    last = r.n;
  }
  if (lad.length === 8) break;
}
console.log('G1-G8 strict:', lad.map((r) => r.id + ':' + r.n).join(' '));
// check background present in all
let bg = 0;
for (const f of fs.readdirSync(dir)) {
  if (fs.readFileSync(dir + '/' + f, 'utf8').includes('M0 0h512v512H0z')) bg++;
}
console.log('with bg', bg);
console.log(JSON.stringify(el.map((r) => [r.id, r.n])));
// full assignment
let pool = [...el];
const take = (r) => {
  pool = pool.filter((p) => p !== r);
  return r;
};
const out = {};
let lastN = -1;
for (const role of [
  'G1',
  'G2',
  'G3',
  'G4',
  'G5',
  'G6',
  'G7',
  'G8',
  'X1',
  'X2',
  'X3',
  'X4',
  'X5',
  'X6',
  'X7',
  'X8',
]) {
  const r = pool.find((p) => p.n > lastN);
  take(r);
  lastN = r.n;
  out[role] = r;
}
const rest = [
  'Sum',
  'Product',
  'Power',
  'Tower',
  'Slots',
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  ...Array.from({ length: 12 }, (_, i) => 'R' + (i + 1)),
  ...Array.from({ length: 8 }, (_, i) => 'Row' + (i + 1)),
];
for (const role of rest) {
  const r = pool[0];
  take(r);
  out[role] = r;
}
console.log(
  Object.entries(out)
    .map(([k, r]) => k + '=' + r.id + '(' + r.n + ')')
    .join(' '),
);
