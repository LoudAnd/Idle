#!/usr/bin/env node
// Headless play-test helper: serves the production build, opens it in Chromium,
// runs optional scripted interactions, saves screenshots, and reports console errors.
//
// Usage:
//   npm run build && node scripts/dev/playtest.mjs [--out dir] [--steps steps.mjs] [--wait ms]
//     [--width px --height px] [--port n]
//
// The preview server is always stopped on the way out (also when Playwright or the browser
// fails to start, or on Ctrl+C), and a failed server start prints vite's own output.
//
// A steps module default-exports `async (page, shot) => {}`; call `await shot('name')`
// to capture a screenshot at any point. Without --steps it captures the initial screen.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

// Resolve Playwright before starting the server, so a missing install leaves nothing running.
const { chromium } = loadPlaywright();

// Run vite's own entry point with this Node (not through `npx`), so `server.kill()` stops the
// server itself instead of only a wrapper process, and no orphan keeps the port.
const viteBin = resolve(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const server = spawn(
  process.execPath,
  [viteBin, 'preview', '--port', String(port), '--strictPort'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
// vite's own output, so a failed start says why (for example "Port 4317 is already in use").
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += String(d)));
server.stderr.on('data', (d) => (serverLog += String(d)));
const stopServer = () => {
  if (server.exitCode === null && server.signalCode === null) server.kill();
};
// From here on every way out stops the server: errors, Ctrl+C, and a plain exit.
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopServer();
    process.exit(130);
  });
}

const errors = [];
let exitCode = 0;
let browser;
try {
  await new Promise((res, rej) => {
    const timer = setTimeout(
      () => rej(new Error(`vite preview did not start in 20s\n${serverLog.trim()}`)),
      20000,
    );
    server.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
        clearTimeout(timer);
        res();
      }
    });
    server.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`vite preview exited with ${code}\n${serverLog.trim()}`));
    });
  });

  browser = await chromium.launch();
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
  await browser?.close().catch(() => {});
  stopServer();
}

if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log(`  ${e}`);
  exitCode = 1;
} else {
  console.log('\nno console errors');
}
process.exit(exitCode);
