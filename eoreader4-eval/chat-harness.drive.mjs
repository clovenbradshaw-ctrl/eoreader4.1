// chat-harness.drive — headless smoke of the generation chat harness.
//
// Serves the repo and drives eoreader4-eval/chat-harness.html in a real (headless) browser,
// exercising the LIVE generation pipeline through the chat UI across the three grounds. This
// is "testing from the chat app side" for the actual pipeline (the real app index.html does
// NOT include this work; the harness imports the live src/ modules). Proves the modules load
// and run in a browser and that the honest outcomes fire (walk / NUL / turn).
//
//   run:  node eoreader4-eval/chat-harness.drive.mjs
//   need: a Chromium Playwright can find. In this environment the browser is at
//         /opt/pw-browsers/chromium and Playwright is a global module; both are resolved
//         below. Elsewhere: `npm i -D playwright && npx playwright install chromium`.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = 8099;

// Resolve Playwright whether it is a local dep or the environment's global install.
const loadPlaywright = async () => {
  const req = createRequire(import.meta.url);
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
    try { return req(spec); } catch { /* try next */ }
  }
  throw new Error('Playwright not found — `npm i -D playwright` (browser: `npx playwright install chromium`).');
};

const main = async () => {
  const pw = await loadPlaywright();
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1000));

  let browser, fail = false;
  try {
    // The env pins the browser via PLAYWRIGHT_BROWSERS_PATH; fall back to a known path.
    try { browser = await pw.chromium.launch(); }
    catch { browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/eoreader4-eval/chat-harness.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('ready'), { timeout: 15000 });

    // what each ground should do: cohered walks, uncohered holds (NUL), turning turns (REC)
    const expect = { cohered: (m) => m.includes('SYN') || m.includes('REC'), uncohered: (m) => m.trim() === 'NUL', turning: (m) => m.includes('REC') };
    for (const preset of ['cohered', 'uncohered', 'turning']) {
      await page.selectOption('#preset', preset);
      await page.click('#run');
      await page.waitForFunction(() => document.getElementById('status').textContent === 'done', { timeout: 15000 });
      const moves = (await page.textContent('#moves')).trim();
      const verdict = (await page.textContent('#verdict')).trim();
      const ok = expect[preset](moves);
      if (!ok) fail = true;
      console.log(`${ok ? 'PASS' : 'FAIL'} [${preset}] ${moves}`);
      console.log(`        ${verdict}`);
      await page.evaluate(() => (document.getElementById('status').textContent = ''));
    }
    if (errs.length) { fail = true; console.log('PAGE ERRORS:', errs.join(' | ')); }
    else console.log('no page errors — the live pipeline ran in the browser.');
    await browser.close();
  } finally {
    server.kill();
  }
  process.exitCode = fail ? 1 : 0;
};

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
