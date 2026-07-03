// essay-thread.drive — headless smoke of THE DISCOURSE STEERING THE ESSAY PATH.
//
// The bug: the Write/essay path skipped the discourse metacognition and took the box text
// literally, so a CRITIQUE of the previous piece ("that's not an essay") was researched as if
// "essay" were the subject — the essay drifted off the dolphin thread onto essays-about-essays.
//
// The fix: runOrganEssay now runs the same discourse read the chat path runs. When that read does
// NOT point outward (no research drive — a refine/critique) and the ask names no subject of its
// own, the essay is written on the conversation's STANDING subject. A genuine "write a <form>
// about SUBJECT" still names its own topic and is untouched.
//
// This drive loads the REAL index.html, mocks the model + eoGen essay organ, and asserts:
//   1. CRITIQUE  — runOrganEssay("that's not an essay") composes on the standing subject
//      ("Dolphin"), not the literal words; the read ran and streamed into the trail.
//   2. NEW TOPIC — runOrganEssay("write an essay about whales") keeps its own subject (whales),
//      proving the inheritance never hijacks a genuinely new commission.
//
//   run:  node eoreader4-eval/essay-thread.drive.mjs

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = 8103;

const loadPlaywright = async () => {
  const req = createRequire(import.meta.url);
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
    try { return req(spec); } catch { /* try next */ }
  }
  throw new Error('Playwright not found — `npm i -D playwright`.');
};

const main = async () => {
  const pw = await loadPlaywright();
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1000));

  let browser, fail = false;
  const check = (ok, label, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) fail = true;
  };

  try {
    try { browser = await pw.chromium.launch(); }
    catch { browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__eoApp && window.__eoApp.state && window.__eoApp.state.ready, { timeout: 30000 });

    // ── Mock the model + the essay organ. The discourse read (detected by its prompt wording)
    // returns a CRITIQUE read that names no world-gap → its route is not 'research'. essayCompose
    // is mocked to RECORD the topic + ground it was handed, so we can assert what the essay was
    // actually written ABOUT. The standing subject is pinned to "Dolphin".
    await page.evaluate(() => {
      const app = window.__eoApp;
      app.__composed = [];
      app.__gathered = [];
      app.ensureChatModel = async () => ({ id: 'mock' });
      const ME = {
        streamPhrase: async (model, messages, opts) => {
          const p = (messages && messages[messages.length - 1] && messages[messages.length - 1].content) || '';
          // The discourse read: a refine/critique that needs nothing found out on the web.
          if (/watching one conversation/i.test(p)) {
            const read = 'The user is rejecting the previous piece as not really an essay and wants a proper, complete essay on the same subject we have been discussing. Nothing new needs to be found out — this is a rewrite from what is already read.';
            if (opts && opts.onToken) for (const tok of read.split(' ')) opts.onToken(tok + ' ');
            return read;
          }
          if (opts && opts.onToken) opts.onToken('x');
          return 'x';
        },
      };
      Object.defineProperty(app, '_ME', { value: ME, writable: false, configurable: true });
      // Pin the thread's standing subject and neutralise the graph-dependent helpers.
      app._chatSubject = () => 'Dolphin';
      app._convFold = async () => ({ stance: null, focus: null, warm: [], stanceDesc: 'a chat' });
      // Record what the essay was gathered/composed ABOUT, and short-circuit the real walk/organ.
      app._gatherEssayGround = async (id, subj) => { app.__gathered.push(subj); return []; };
      const G = {
        ESSAY_MIN_WORDS: 2500,
        essayTypes: {
          essayTypeOf: () => ({ id: 'argument', label: 'Argument' }),
          ESSAY_TYPES: [{ id: 'argument', label: 'Argument' }],
          steerFrom: () => ({ cue: 'CUE', planHints: [], targetPerSection: 300 }),
          foldEssay: (p) => p, steerFrom2: null,
          profileFromJSON: () => null, emptyProfile: () => null, profileToJSON: () => '{}',
        },
        essayCompose: async (opts) => {
          app.__composed.push({ topic: opts.topic, cue: opts.cue });
          if (opts.hooks && opts.hooks.onPlan) opts.hooks.onPlan({ title: 'T', outline: ['a'] });
          return { text: 'ESSAY', words: 2600, sections: [{ h: 'a' }], grounded: false, sourceCount: 0, boundFraction: 0 };
        },
      };
      Object.defineProperty(window, 'eoGen', { value: G, writable: true, configurable: true });
      app._essayProfile = () => null; app._saveEssayProfile = () => {};
      app.newChat(null);
      // Seed a prior exchange so the read has a thread to see.
      const c = app.activeChatObj();
      app.setState({ chats: app.state.chats.map(x => x.id === c.id ? { ...x, messages: [
        { role: 'user', text: 'write me a paper about dolphins' },
        { role: 'asst', text: 'Dolphins are fast swimmers. [s5]', pending: false },
      ] } : x) });
    });

    // ── CASE 1: a critique. Must compose on "Dolphin", not "that's not an essay".
    await page.evaluate(() => window.__eoApp.runOrganEssay("that's not an essay"));
    await page.waitForFunction(() => window.__eoApp.__composed.length >= 1, { timeout: 20000 });
    const c1 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      return { composed: window.__eoApp.__composed[0], gathered: window.__eoApp.__gathered[0],
        steps: (m.research && m.research.steps || []).map(s => s.kind + '|' + s.text) };
    });
    check(c1.composed.topic === 'Dolphin', 'CASE 1: the essay is composed on the standing subject, not the critique', 'topic=' + JSON.stringify(c1.composed.topic));
    check(c1.gathered === 'Dolphin', 'CASE 1: ground is gathered on the standing subject, not "essay"', 'gathered=' + JSON.stringify(c1.gathered));
    check(c1.steps.some(s => s.startsWith('lead|My read of this turn:')), 'CASE 1: the discourse read ran and landed in the trail', c1.steps.slice(0, 6).join(' · '));
    check(/steering only/i.test(c1.composed.cue || ''), 'CASE 1: the read rides into the compose cue as a steer');

    // ── CASE 2: a genuine new commission. Must keep its OWN subject (whales), never inherit.
    await page.evaluate(() => { window.__eoApp.__composed = []; window.__eoApp.__gathered = []; });
    await page.evaluate(() => window.__eoApp.runOrganEssay('write an essay about whales'));
    await page.waitForFunction(() => window.__eoApp.__composed.length >= 1, { timeout: 20000 });
    const c2 = await page.evaluate(() => ({ composed: window.__eoApp.__composed[0], gathered: window.__eoApp.__gathered[0] }));
    check(/whales/i.test(c2.composed.topic) && c2.composed.topic !== 'Dolphin', 'CASE 2: a new "essay about whales" keeps its own subject', 'topic=' + JSON.stringify(c2.composed.topic));
    check(/whales/i.test(c2.gathered) && c2.gathered !== 'Dolphin', 'CASE 2: ground is gathered on whales, not the thread', 'gathered=' + JSON.stringify(c2.gathered));

    const pageErrs = errs.filter(e => !/favicon|eoGen load failed|net::ERR/.test(e));
    check(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 3).join(' | '));
  } catch (e) {
    check(false, 'harness threw', String((e && e.stack) || e));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  console.log(fail ? 'SMOKE: FAIL' : 'SMOKE: PASS');
  process.exit(fail ? 1 : 0);
};

main();
