import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { routeStance, switchesFromCompose } from '../src/core/conversation-fold.js';
import { metaRoute, createMetaRouter } from '../src/turn/meta-route.js';

// FRAME BINDING — the route read off what the turn binds to (docs/frame-binding-route.md).
//
// The regression fixture is the exported audit "write me a story about my cat buster" (two
// turns). Turn 1 composes; the thread carries stance:compose. Turn 2 the user sends a REPAIR —
// "what do you mean what's his name?" — a comment on the assistant's own prior question, binding
// back into the act (the story under composition). The engine treated it as a fresh research
// topic, searched the literal phrase, matched the Justin Bieber and Oasis songs BY TITLE, and
// answered about chart positions.
//
// The disease was PLURAL CONTROL: three deciders ran on that turn and desynced. The regex seed
// (_switchesFromCompose) fired TRUE — "leave compose" — while the warm measurement (metaRoute)
// settled compose and was then discarded, because sendChat reimplemented the fork inline off the
// seed and never consulted the verdict. Phase 1 wires the fork through the measurement that
// already exists: the route falls out of the binding, and _switchesFromCompose is demoted to the
// cold/abstained SEED. These tests pin the fusion (pure functions) and the wiring (both shipped
// copies), the same discipline tests/research-relevance.test.js uses.

const composeFold = { stance: 'compose', focus: { kind: 'story', subject: 'Buster the cat' }, warm: [] };

// The metacognition's own plain-language read of the repair — a return into the composing act.
// (The measurement runs on MODEL speech, not the user utterance; docs/discourse-routing.md.)
const REPAIR_READ =
  'The user is responding to my own question about the story; they want to keep composing the tale ' +
  'about their cat Buster. Nothing needs to be looked up.';
// A genuine topic switch mid-compose, re-spoken by the metacognition.
const SWITCH_READ =
  'The user changed the subject entirely — this is a fresh factual question about the capital of ' +
  'France, unrelated to the story.';
// A document question mid-compose — the answer sits in the loaded reading (a ground switch).
const GROUND_READ =
  'They are asking a factual question about the document; the answer sits in the text of the ' +
  'reading we loaded.';

// ---------------------------------------------------------------------------
// §1 — The fusion closes the repair regression (pure functions).

test('the repair binds to the act: the metacognition read settles compose, not research', () => {
  const m = metaRoute(REPAIR_READ, composeFold);
  assert.equal(m.route, 'compose', 'the repair read binds back into the composing act');
  assert.equal(m.verdict, 'COMPOSE');
  assert.ok(m.researchDrive === 0 || m.route !== 'research', 'no research subject is ever raised by the repair');
});

test('the regex seed alone MISROUTES the repair — the plural-control bug the fusion dissolves', () => {
  // switchesFromCompose fires TRUE on the repair: it starts with "what", ends with "?", and carries
  // no token from its hardcoded back-reference list ("his" is not in it). On the seed alone the turn
  // leaves compose → the research walk → the songs matched by title. This documents the disease.
  assert.equal(switchesFromCompose("what do you mean what's his name?"), true);
});

test('the measured verdict OVERRIDES the buggy seed — the repair stays in compose', () => {
  // routeStance fuses the seed (baseline) and the warm verdict (createMetaRouter). Even though the
  // seed drives the baseline to null, the compose-settling read wins → 'compose'. This is the fix.
  const router = createMetaRouter({ speech: REPAIR_READ, fold: composeFold });
  assert.equal(router.warm, true);
  assert.equal(routeStance("what do you mean what's his name?", composeFold, { model: router }), 'compose');
});

test('a genuine switch mid-compose still LEAVES compose (the fusion is not a compose trap)', () => {
  const isoRouter = createMetaRouter({ speech: SWITCH_READ, fold: composeFold });
  assert.equal(routeStance('what is the capital of France?', composeFold, { model: isoRouter }), null,
    'an unrelated fresh question isolates out of the compose thread');
  const groundRouter = createMetaRouter({ speech: GROUND_READ, fold: composeFold });
  assert.equal(routeStance('what does the document say about that?', composeFold, { model: groundRouter }), 'ground',
    'a document question grounds out of the compose thread');
});

test('fallback parity: a cold/abstaining read leaves the seed-driven baseline byte-identical', () => {
  // No warm read (model down) → routeStance = markers → continuation → fresh-regex-seed, unchanged.
  const cold = createMetaRouter({ speech: '' });
  assert.equal(cold.warm, false);
  assert.equal(routeStance('make it shorter', composeFold, { model: cold }), 'compose', 'an anaphor continues');
  assert.equal(routeStance('what is 237 * 637?', composeFold, { model: cold }), null, 'a self-contained question switches');
  // An abstaining read (coheres toward nothing) also falls through to the baseline.
  const abstain = createMetaRouter({ speech: 'lovely weather in the mountains today', fold: composeFold });
  assert.equal(routeStance('make it shorter', composeFold, { model: abstain }), 'compose');
});

// ---------------------------------------------------------------------------
// §2 — The app-level fork (_continuesCompose), extracted from BOTH shipped copies.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a method's full source by balanced-brace matching (as research-relevance.test.js does).
const methodOf = (src, name) => {
  const at = src.indexOf(`\n  ${name}(`);
  assert.ok(at >= 0, `method ${name} not found`);
  let i = src.indexOf('{', at);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return src.slice(at + 1, i + 1);
};

// A harness carrying the app's real compose-continuation gate and its seed dependencies.
const harnessOf = (src) => {
  const body = ['_continuesCompose', '_switchesFromCompose', '_composeIntent', '_CK', '_CV']
    .map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H { ${body} }`)();
  return new Cls();
};

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: the compose fork is driven by the measured route, not the inline seed`, () => {
    // The fork now consults _continuesCompose(q,fold,read); the old single-decider inline fork
    // (…&&!this._switchesFromCompose(q)) is gone from sendChat.
    assert.match(src, /this\._continuesCompose\(q,\s*fold,\s*read\)/, `${page} does not wire the fork through _continuesCompose`);
    assert.doesNotMatch(src, /fold\.stance==='compose'&&!this\._researchIntent\(q\)&&!this\._switchesFromCompose\(q\)/,
      `${page} still decides the compose fork with the inline _switchesFromCompose regex`);
    // The compose + essay continuation paths REUSE the discourse bubble (and the read already taken).
    assert.match(src, /this\.composeArtifact\(q,\s*fold,\s*\{reuseId:id\}\)/, `${page} does not reuse the bubble for composeArtifact`);
    assert.match(src, /this\.runOrganEssay\(q,\s*undefined,\s*\{reuseId:id,\s*read\}\)/, `${page} does not reuse the bubble/read for runOrganEssay`);
  });

  test(`${page}: _continuesCompose — a warm read decides on its settled route`, () => {
    const h = harnessOf(src);
    const repair = "what do you mean what's his name?";
    // The buster repair: a warm compose read keeps it in compose even though the SEED says switch.
    assert.equal(h._switchesFromCompose(repair), true, 'the seed alone would leave compose (the bug)');
    assert.equal(h._continuesCompose(repair, composeFold, { route: 'compose', abstained: false }), true,
      'a warm compose read binds the repair back into the act');
    // A warm ground / research / isolate read is a genuine switch → leave.
    assert.equal(h._continuesCompose(repair, composeFold, { route: 'ground', abstained: false }), false);
    assert.equal(h._continuesCompose(repair, composeFold, { route: 'research', abstained: false }), false);
    assert.equal(h._continuesCompose(repair, composeFold, { route: 'isolate', abstained: false }), false);
  });

  test(`${page}: _continuesCompose — a cold/abstained read falls to the seed (fallback parity)`, () => {
    const h = harnessOf(src);
    const repair = "what do you mean what's his name?";
    // Cold (null) read → the seed decides, byte-identical to the pre-frame-binding behavior. On the
    // fixture the seed still misroutes the repair (Phase 1 relies on the warm read to close it).
    assert.equal(h._continuesCompose(repair, composeFold, null), false, 'cold → the seed still leaves compose');
    // Abstained read → the seed too.
    assert.equal(h._continuesCompose(repair, composeFold, { route: null, abstained: true }), false);
    // An anaphoric refinement continues offline; a self-contained question switches offline.
    assert.equal(h._continuesCompose('make it shorter', composeFold, null), true);
    assert.equal(h._continuesCompose('now one about the city', composeFold, null), true);
    assert.equal(h._continuesCompose('what is 237 * 637?', composeFold, null), false);
    // An explicit make-request stays compose even under a cold read.
    assert.equal(h._continuesCompose('write me another poem', composeFold, null), true);
  });
}
