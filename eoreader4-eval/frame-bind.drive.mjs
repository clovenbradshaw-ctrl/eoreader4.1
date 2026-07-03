// frame-bind.drive — headless smoke of the FRAME-BINDING compose fork in the reader app.
//
// Reproduces the regression fixture (docs/frame-binding-route.md): the exported audit
// "write me a story about my cat buster". Loads the REAL index.html in headless Chromium,
// mocks only the model layer (deterministic, no download) and the curiosity walk (no network),
// then drives sendChat through window.__eoApp and asserts the frame binding:
//
//   1. COMPOSE       — "write me a story about my cat buster" composes (stance:compose), no walk.
//   2. THE REPAIR    — "what do you mean what's his name?" binds back into the act. The discourse
//                      read settles compose, the fork STAYS in compose (reusing the one bubble),
//                      and NO research walk runs. This is the bug the frame-binding fork closes:
//                      before, the seed (_switchesFromCompose) tore the repair out of the story
//                      into a research walk that matched the Bieber/Oasis songs by title.
//   3. A REAL SWITCH — "who won the election last week?" mid-compose, a read naming a world-gap,
//                      LEAVES compose and routes to the research walk. The fix is not a compose trap.
//
//   run:  node eoreader4-eval/frame-bind.drive.mjs

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
  throw new Error('Playwright not found — `npm i -D playwright` (browser: `npx playwright install chromium`).');
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
  const settle = () => page.waitForFunction(() => {
    const c = window.__eoApp.activeChatObj();
    const m = c && c.messages[c.messages.length - 1];
    return m && m.role === 'asst' && !m.pending;
  }, { timeout: 20000 });
  let page;

  try {
    try { browser = await pw.chromium.launch(); }
    catch { browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
    page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__eoApp && window.__eoApp.state && window.__eoApp.state.ready, { timeout: 30000 });

    // ── Mock the model layer + the walk. The discourse read's SPEECH is keyed off the turn:
    // the repair binds to the act (compose), the switch names a world-gap (research). A compose
    // answer prompt streams a story line. No download, no network.
    await page.evaluate(() => {
      const app = window.__eoApp;
      app.__walks = 0;
      let read = 0;
      const READS = [
        // turn 2 — the repair: a return into the composing act (settles compose).
        'The user is responding to my own question about the story; they want to keep composing the tale about their cat Buster. Nothing needs to be looked up.',
        // turn 3 — a genuine switch: a world-question the reading cannot cover (research).
        'They are asking about recent news the reading cannot cover — this has to be found out on the web, a search for current information.',
      ];
      app.ensureChatModel = async () => ({ id: 'mock' });
      const ME = {
        LIBRARIAN_CUE: 'Answer as a librarian.',
        shapeForScope: () => '',
        buildGroundedMessages: ({ question }) => [{ role: 'user', content: question }],
        buildChatMessages: ({ question }) => [{ role: 'user', content: question }],
        streamPhrase: async (model, messages, opts) => {
          const p = (messages && messages[messages.length - 1] && messages[messages.length - 1].content) || '';
          if (/watching one conversation/i.test(p)) return READS[Math.min(read++, READS.length - 1)];
          const out = 'Buster the cat padded across the kitchen, tail high, hunting for his breakfast.';
          if (opts && opts.onToken) opts.onToken(out);
          return out;
        },
      };
      Object.defineProperty(app, '_ME', { value: ME, writable: false, configurable: true });
      // A source in scope so a turn is not net-new (an isolated space always webs, by design).
      app._answerScope = () => ({ isolated: false, sources: ['src:1'] });
      app._curiosityWalk = async () => { app.__walks++; return { readUrls: [], hops: [] }; };
      app._gutenbergBook = async () => null;
      app._reviseIfNeeded = async (model, q, out) => out;   // keep compose deterministic (no rewrite pass)
      app.newChat(null);
    });

    // ── Turn 1: an explicit compose ("write me a story about my cat buster"). _composeIntent
    // catches it before the discourse read → composeArtifact, stance:compose, no walk.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: 'write me a story about my cat buster' }); return a.sendChat(); });
    await settle();
    const t1 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      return { stance: m.stance, kind: m.focus && m.focus.kind, walks: window.__eoApp.__walks };
    });
    check(t1.stance === 'compose', 'turn 1: "write me a story…" composes', 'stance=' + t1.stance);
    check(t1.kind === 'story', 'turn 1: the focus kind is a story', 'kind=' + t1.kind);
    check(t1.walks === 0, 'turn 1: no research walk ran');

    // ── Turn 2: THE REPAIR. "what do you mean what's his name?" — the seed would tear it out of
    // compose (wh-opener, trailing "?", "his" not in its back-ref list), but the discourse read
    // binds it back into the act → STAY in compose, reuse the one bubble, NO walk.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: "what do you mean what's his name?" }); return a.sendChat(); });
    await settle();
    const t2 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      const userEchoes = c.messages.filter((x) => x.role === 'user').length;
      return { stance: m.stance, register: m.register, walks: window.__eoApp.__walks,
        mode: m.research && m.research.mode, audit: (m.audit || []).map((a) => a.stage),
        readBeat: ((m.research && m.research.steps) || []).some((s) => /My read of this turn:/.test(s.text || '')),
        userEchoes };
    });
    check(t2.walks === 0, 'turn 2: the repair did NOT route to a research walk (the bug is closed)', 'walks=' + t2.walks);
    check(t2.stance === 'compose', 'turn 2: the repair STAYS in compose', 'stance=' + t2.stance);
    check(t2.audit.includes('discourse-read'), 'turn 2: the discourse read ran before the fork', t2.audit.join(','));
    check(t2.mode !== 'research', 'turn 2: the bubble is the compose bubble, not a research trail', 'mode=' + t2.mode);
    check(t2.readBeat, 'turn 2: the shared bubble kept the read beat (one bubble, reused)');
    check(t2.userEchoes === 2, 'turn 2: exactly one user echo per turn (no duplicate bubble)', 'echoes=' + t2.userEchoes);

    // ── Turn 3: A REAL SWITCH. A world-question mid-compose whose read names a gap LEAVES compose
    // and routes to the research walk — the fusion is not a one-way compose trap.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: 'who won the election last week?' }); return a.sendChat(); });
    await settle();
    const t3 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      return { walks: window.__eoApp.__walks, mode: m.research && m.research.mode };
    });
    check(t3.walks === 1, 'turn 3: a genuine switch LEFT compose and ran the research walk', 'walks=' + t3.walks);
    check(t3.mode === 'research', 'turn 3: the trail is a research trail', 'mode=' + t3.mode);

    const pageErrs = errs.filter((e) => !/favicon|eoGen load failed|net::ERR/.test(e));
    check(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 3).join(' | '));
  } catch (e) {
    fail = true;
    console.error('DRIVE ERROR:', (e && e.message) || e);
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    server.kill();
  }
  console.log(fail ? 'SMOKE: FAIL' : 'SMOKE: PASS');
  process.exit(fail ? 1 : 0);
};

main();
