// Exact Record advance costs (GDD 11): cost(t) = max(1, bitLength(t)), which equals
// ceil(log2(1 + t)) for t >= 1. Compares with the float formula that gave the old
// (wrong) A000215 total.
// Run: node record_costs.mjs <dir with the 12 Record .seq files>
import fs from 'node:fs';
const dir = process.argv[2] ?? '.';
const ids =
  'A046859 A060843 A028444 A000215 A000058 A000372 A003095 A000396 A000668 A005150 A000112 A000798'.split(
    ' ',
  );
const bitLength = (t) => (t <= 0n ? 0 : t.toString(2).length);
let totF = 0;
let totB = 0;
let adv = 0;
for (const a of ids) {
  const s = fs.readFileSync(`${dir}/${a}.seq`, 'utf8');
  const terms = s
    .split('\n')
    .filter((l) => /^%[STU] /.test(l))
    .map((l) => l.split(' ').slice(2).join(''))
    .join('')
    .split(',')
    .filter(Boolean);
  let f = 0;
  let b = 0;
  for (const t of terms) {
    f += Math.max(1, Math.ceil(Math.log2(1 + Number(t))));
    b += Math.max(1, bitLength(BigInt(t)));
  }
  totF += f;
  totB += b;
  adv += terms.length;
  console.log(a, terms.length, 'float', f, 'exact', b);
}
console.log('total float', totF, 'exact', totB, 'advances', adv);
