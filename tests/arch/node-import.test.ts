// @vitest-environment node
// GDD §21.6: Node 22.22 strips types by default, so the asset pipeline and the sim CLI can
// import engine modules directly. This spawns a plain `node` (no --experimental flag) that
// imports src/engine/format.ts, num.ts and src/ui/strings.ts and prints a formatted value.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './lib/scan.ts';

const url = (p: string) => pathToFileURL(join(REPO_ROOT, p)).href;

describe('node import', () => {
  it(
    'node imports src/engine/format.ts through type stripping and prints a formatted value',
    { timeout: 30_000 },
    () => {
      const code = [
        `import { pow2 } from ${JSON.stringify(url('src/engine/num.ts'))};`,
        `import { formatNum } from ${JSON.stringify(url('src/engine/format.ts'))};`,
        `import { NOTATION_TABLES } from ${JSON.stringify(url('src/ui/strings.ts'))};`,
        'process.stdout.write(formatNum(pow2(65536), NOTATION_TABLES));',
      ].join('\n');
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: REPO_ROOT,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(out).toBe('2.00e19,728');
    },
  );
});
