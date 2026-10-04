#!/usr/bin/env node
// Headless play-test helper: serves the production build, opens it in Chromium,
// runs optional scripted interactions, saves screenshots, and reports console errors.
//
// Usage:
//   npm run build && node scripts/dev/playtest.mjs [--out dir] [--steps steps.mjs] [--wait ms]
//     [--width px --height px]
//
// A steps module default-exports `async (page, shot) => {}`; call `await shot('name')`
// to capture a screenshot at any point. Without --steps it captures the initial screen.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(id);
    } catch {
      // try the next location
    }
  }
  throw new Error('Playwright not found. Install it or use the preinstalled global copy.');
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = resolve(arg('out', 'playtest-output'));
const stepsPath = arg('steps', '');
const waitMs = Number(arg('wait', '1500'));
const width = Number(arg('width', '1280'));
const height = Number(arg('height', '800'));
const port = Number(arg('port', '4317'));

mkdirSync(outDir, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('vite preview did not start in 20s')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(port))) {
      clearTimeout(timer);
      res();
    }
  });
  server.on('exit', (code) => rej(new Error(`vite preview exited with ${code}`)));
});

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const errors = [];
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(waitMs);
  let n = 0;
  const shot = async (name) => {
    const file = resolve(outDir, `${String(++n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`screenshot: ${file}`);
  };
  if (stepsPath) {
    const steps = (await import(pathToFileURL(resolve(stepsPath)).href)).default;
    await steps(page, shot);
  } else {
    await shot('initial');
  }
} catch (err) {
  errors.push(`playtest failure: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  await browser.close();
  server.kill();
}

if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log(`  ${e}`);
  exitCode = 1;
} else {
  console.log('\nno console errors');
}
process.exit(exitCode);
