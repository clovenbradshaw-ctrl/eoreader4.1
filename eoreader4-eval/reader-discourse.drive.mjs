// reader-discourse.drive — headless smoke of the DISCOURSE METACOGNITION wiring in the reader app.
//
// Serves the repo, loads the REAL index.html in headless Chromium, mocks only the model layer
// (ensureChatModel + _ME.streamPhrase — deterministic, no download) and the curiosity walk (no
// network), then drives sendChat through window.__eoApp and asserts the new turn anatomy:
//
//   1. GROUNDED TURN  — the discourse read runs, its speech lands VERBATIM as a 'lead' beat in
//      the live trail, and the turn's audit carries discourse-read → answer-prompt → answer-raw
//      with the metacognition's speech steering the answer prompt.
//   2. RESEARCH TURN  — a read whose speech names a world-gap (measured researchDrive > 0)
//      routes the same question to chatResearch (the walk runs) instead of answering offline.
//   3. EXPORT         — exportChatAudit ships one JSON with the question, every internal prompt
//      verbatim, every raw output, and the step trail.
//
//   run:  node eoreader4-eval/reader-discourse.drive.mjs

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PORT = 8102;

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

  try {
    try { browser = await pw.chromium.launch(); }
    catch { browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__eoApp && window.__eoApp.state && window.__eoApp.state.ready, { timeout: 30000 });

    // ── Mock the model layer + the walk. The SPEECH the fake model returns is keyed off the
    // prompt: a discourse prompt (its fixed wording) gets the metacognition's read; anything
    // else gets a plain answer. Turn 2's read names a world-gap so researchDrive fires.
    await page.evaluate(() => {
      const app = window.__eoApp;
      app.__walks = 0;
      // The read the fake metacognition returns is keyed off the user message embedded in the
      // discourse prompt (robust to turn order): a plain doc question, a world-gap (research), a
      // live fact, and an AMBIGUOUS ask whose read says only the user can close the gap (clarify).
      const READS = {
        ground:    'The user wants a factual answer from the document they loaded; the reading should hold it. Nothing needs to be found out.',
        worldgap:  'They are asking about recent news the reading cannot cover — this has to be found out on the web, a search for current information.',
        weather:   'They are asking about the weather right now, a live fact about the world that has to be found out on the web.',
        ambiguous: 'The request is ambiguous — they ask which book to read but never say which books or on what criteria; only the user can say, so I would have to ask them to clarify what they mean.',
      };
      // Key off the CURRENT user message only (the discourse prompt also embeds the last
      // exchange, so matching the whole prompt would bleed a prior turn's words into this read).
      const readFor = (p) => {
        const said = (String(p).match(/The user just said: "([^"]*)"/) || [, ''])[1];
        return /election last week/i.test(said) ? READS.worldgap
          : /weather/i.test(said) ? READS.weather
          : /which book/i.test(said) ? READS.ambiguous
          : READS.ground;
      };
      app.ensureChatModel = async () => ({ id: 'mock' });
      // The mount-time prewarm (componentDidMount: ensureChatModel().catch()) was already past its
      // `if(!this._ME)` guard when this mock lands; when its module import resolves it would
      // overwrite the mock (TOCTOU across the await). Freeze the property — the prewarm's late
      // assignment then throws into its own .catch and the mock stays.
      const ME = {
        LIBRARIAN_CUE: 'Answer as a librarian.',
        shapeForScope: () => '',
        buildGroundedMessages: ({ question, shape }) => [
          { role: 'system', content: 'GROUNDED. ' + (shape || '') },
          { role: 'user', content: question },
        ],
        buildChatMessages: ({ question }) => [{ role: 'user', content: question }],
        streamPhrase: async (model, messages, opts) => {
          const p = (messages && messages[messages.length - 1] && messages[messages.length - 1].content) || '';
          if (/watching one conversation/i.test(p)) return readFor(p);
          // The clarify prompt asks for ONE clarifying question — answer it as one.
          if (/clarifying question/i.test(p)) { const qq = 'Which book do you mean — is there one in particular you have in mind?'; if (opts && opts.onToken) opts.onToken(qq); return qq; }
          if (opts && opts.onToken) opts.onToken('The answer, from the reading.');
          return 'The answer, from the reading.';
        },
      };
      Object.defineProperty(app, '_ME', { value: ME, writable: false, configurable: true });
      // Tag a source into scope so turn 1 is NOT a net-new space (isolated always webs, by design).
      app._answerScope = () => ({ isolated: false, sources: ['src:1'] });
      app._curiosityWalk = async () => { app.__walks++; return { readUrls: [], hops: [] }; };
      app._gutenbergBook = async () => null;
      // A known subject so the grounded path stays offline on turn 1 (no anchor gap, no research).
      app._subjectsKnown = () => true;
      app._anchorGap = () => null;
      app.groundNotes = () => ({ spans: [{ text: 'A matched line.', u: 'src:1', i: 0 }], entities: ['Gregor'], sources: ['src:1'], relevant: true });
      app.meaningGraph = () => '';
      app.chatOrientation = () => 'one source';
      app.newChat(null);
    });

    // ── Turn 1: grounded. The read says the reading holds it → no research, answer offline.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: 'what is her name?' }); return a.sendChat(); });
    await page.waitForFunction(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c && c.messages[c.messages.length - 1];
      return m && m.role === 'asst' && !m.pending;
    }, { timeout: 15000 });

    const t1 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      return { text: m.text, steps: (m.research && m.research.steps || []).map(s => s.kind + '|' + s.text), audit: (m.audit || []).map(a => a.stage), prompt: ((m.audit || []).find(a => a.stage === 'answer-prompt') || {}).prompt || '', walks: window.__eoApp.__walks };
    });
    check(t1.steps.some(s => s.startsWith('lead|My read of this turn:')), 'turn 1: the metacognition speech is a verbatim trail beat');
    check(t1.steps.some(s => /Re-reading 1 matching passage — on Gregor/.test(s)), 'turn 1: the ground beat names the figures, not a bare count', t1.steps.join(' · '));
    check(JSON.stringify(t1.audit) === JSON.stringify(['discourse-read', 'answer-prompt', 'answer-raw']), 'turn 1: audit carries discourse-read → answer-prompt → answer-raw', t1.audit.join(','));
    check(/conversation read \(steering only/i.test(t1.prompt) && /factual answer from the document/.test(t1.prompt), 'turn 1: the read steers the answer prompt');
    check(t1.walks === 0, 'turn 1: no research walk ran');
    check(!!t1.text, 'turn 1: the turn settled with an answer');

    // ── Turn 2: the read names a world-gap → researchDrive fires → the SAME kind of question
    // routes through chatResearch (the mocked walk), not the offline answer.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: 'who won the election last week?' }); return a.sendChat(); });
    await page.waitForFunction(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c && c.messages[c.messages.length - 1];
      return m && m.role === 'asst' && !m.pending;
    }, { timeout: 20000 });
    const t2 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      return { walks: window.__eoApp.__walks, mode: m.research && m.research.mode, steps: (m.research && m.research.steps || []).map(s => s.kind), readErr: window.__eoApp._readErr || '' };
    });
    check(t2.walks === 1, 'turn 2: the discourse gap sent the turn to the research walk', 'walks=' + t2.walks + (t2.readErr ? ' readErr=' + t2.readErr.slice(0, 200) : ''));
    check(t2.mode === 'research' && t2.steps.includes('start') && t2.steps.includes('lead'), 'turn 2: the trail converted to a research trail and kept the read beat', t2.steps.join(','));

    // ── Turn 3: a LIVE FACT ("the weather") — a no-brainer web turn: gated before any coverage
    // check, searched on the OPEN WEB with today's date, and the read is anchored in time.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: 'what is the weather like right now?' }); return a.sendChat(); });
    await page.waitForFunction(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c && c.messages[c.messages.length - 1];
      return m && m.role === 'asst' && !m.pending;
    }, { timeout: 20000 });
    const t3 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      const start = ((m.research && m.research.steps) || []).find(s => s.kind === 'start');
      const read = (m.audit || []).find(a => a.stage === 'discourse-read');
      return { walks: window.__eoApp.__walks, start: (start && start.text) || '', readPrompt: (read && read.prompt) || '',
        live: window.__eoApp._isLiveFact('what is the weather like right now?'),
        prose: { data: window.__eoApp._proseOk('sunny, 72°f, winds 10mph'), junk: window.__eoApp._proseOk('sign in to view 3 photos'), stub: window.__eoApp._proseOk('ok') } };
    });
    check(t3.live === true, 'turn 3: weather is recognized as a live fact');
    check(t3.walks === 2, 'turn 3: the live fact went straight to the research walk', 'walks=' + t3.walks);
    check(/live question — searching the open web/i.test(t3.start) && /as of .*\d{4}/i.test(t3.start), 'turn 3: the walk is open-web and date-stamped', t3.start);
    check(/It is now /.test(t3.readPrompt) && new RegExp(String(new Date().getFullYear())).test(t3.readPrompt), 'turn 3: the discourse read is anchored to the current date/time');
    check(t3.prose.data === true && t3.prose.junk === false && t3.prose.stub === false, 'measurement lines survive _proseOk; junk and stubs still die', JSON.stringify(t3.prose));

    // ── Turn 4: an AMBIGUOUS ask. The read says only the user can close the gap (clarifyDrive,
    // no researchDrive) → the turn ASKS a clarifying question and ends, instead of guessing an
    // answer or spending a web walk. This is the loop the metacognition opened but never closed.
    await page.evaluate(() => { const a = window.__eoApp; a.setState({ chatInput: 'which book should I read?' }); return a.sendChat(); });
    await page.waitForFunction(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c && c.messages[c.messages.length - 1];
      return m && m.role === 'asst' && !m.pending;
    }, { timeout: 20000 });
    const t4 = await page.evaluate(() => {
      const c = window.__eoApp.activeChatObj();
      const m = c.messages[c.messages.length - 1];
      return { text: m.text, groundKind: m.groundKind, stance: m.stance || null,
        audit: (m.audit || []).map(a => a.stage), walks: window.__eoApp.__walks,
        readErr: window.__eoApp._readErr || '' };
    });
    check(t4.walks === 2, 'turn 4: the ambiguous ask did NOT spend a web walk', 'walks=' + t4.walks + (t4.readErr ? ' readErr=' + t4.readErr.slice(0, 200) : ''));
    check(t4.groundKind === 'clarify', 'turn 4: the turn is a clarifying question, not an answer', 'groundKind=' + t4.groundKind);
    check(/\?\s*$/.test((t4.text || '').trim()) && /book/i.test(t4.text || ''), 'turn 4: the assistant actually asked the user a question', JSON.stringify(t4.text));
    check(JSON.stringify(t4.audit) === JSON.stringify(['discourse-read', 'clarify-prompt', 'clarify-raw']), 'turn 4: audit carries discourse-read → clarify-prompt → clarify-raw (no answer)', t4.audit.join(','));
    check(t4.stance === null, 'turn 4: the clarify bubble carries no stance — the fold treats it transparently', 'stance=' + t4.stance);

    // ── Export: the chat audit JSON carries questions, verbatim prompts, raw outputs, steps.
    const exp = await page.evaluate(() => {
      const app = window.__eoApp;
      const c = app.activeChatObj();
      let captured = null;
      const orig = document.createElement.bind(document);
      document.createElement = (tag) => { const el = orig(tag); if (tag === 'a') { el.click = () => { captured = { href: el.href, name: el.download }; }; } return el; };
      app.exportChatAudit(c.id);
      document.createElement = orig;
      return fetch(captured.href).then(r => r.json()).then(j => ({ name: captured.name, turns: j.turns.length, stages: j.turns.flatMap(t => t.audit.map(a => a.stage)), hasPrompt: j.turns.some(t => t.audit.some(a => /steering only/i.test(a.prompt || ''))), hasRaw: j.turns.some(t => t.audit.some(a => (a.output || '').includes('The answer, from the reading'))) }));
    });
    check(exp.turns === 4 && exp.name.startsWith('eo-audit-'), 'export: one JSON, all four turns', exp.name);
    check(exp.stages.includes('discourse-read') && exp.hasPrompt && exp.hasRaw, 'export: verbatim prompts and raw outputs ride along', exp.stages.join(','));

    const pageErrs = errs.filter(e => !/favicon|eoGen load failed|net::ERR/.test(e));
    check(pageErrs.length === 0, 'no page errors', pageErrs.slice(0, 3).join(' | '));
  } catch (e) {
    fail = true;
    console.error('DRIVE ERROR:', e && e.message || e);
  } finally {
    try { await browser?.close(); } catch { /* closing */ }
    server.kill();
  }
  console.log(fail ? 'SMOKE: FAIL' : 'SMOKE: PASS');
  process.exit(fail ? 1 : 0);
};

main();
