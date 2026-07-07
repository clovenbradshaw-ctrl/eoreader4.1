import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The clarifying-question loop must CONVERGE without a hard cap. Once the ask-back fork started
// firing (docs/discourse-routing.md, "Asking back"), every follow-up got re-read as "still broad"
// and re-clarified forever — there is always some residual ambiguity if you look for it. The fix
// makes convergence physics, not a counter: the "just answer" stance gains a resting potential
// (REST_CLARIFY) per clarifying question already asked in the run (_consecutiveClarify), so a
// re-ask must out-compete an ever-higher bar; a PUNT (_clarifyPunt) ends it outright. This pins
// both the pure helpers and the gate wiring, in the source AND the built index.html.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a method's full source by balanced-brace matching (as frame-bind.test.js does).
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

const harnessOf = (src) => {
  const body = ['_consecutiveClarify', '_clarifyPunt', 'norm'].map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H { ${body} }`)();
  return new Cls();
};

// A completed clarify turn (stance-less, groundKind 'clarify') vs a real answer (a ground turn).
const clarify = () => ({ role: 'asst', groundKind: 'clarify' });
const answer = () => ({ role: 'asst', groundKind: 'ground' });
const user = (t) => ({ role: 'user', text: t });

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: _clarifyPunt catches deferrals, not substantive answers`, () => {
    const h = harnessOf(src);
    for (const q of ['anywhere', 'any', 'whatever', 'either', 'you choose', "doesn't matter",
      'up to you', 'surprise me', 'no preference', 'all of them', 'both', 'Anywhere.', 'you decide'])
      assert.equal(h._clarifyPunt(q), true, `"${q}" is a punt`);
    for (const q of ["let's learn about their conservation efforts", 'their intelligence',
      'a specific coastal region with a rescue program', 'the causes of the war', 'anywhere in the Pacific with a sanctuary'])
      assert.equal(h._clarifyPunt(q), false, `"${q}" is a substantive answer, not a punt`);
  });

  test(`${page}: _consecutiveClarify counts the unbroken trailing run, resets on a real answer`, () => {
    const h = harnessOf(src);
    assert.equal(h._consecutiveClarify({ messages: [] }), 0, 'empty thread → 0');
    // one question asked, awaiting its answer
    assert.equal(h._consecutiveClarify({ messages: [user('essay about dolphins'), clarify()] }), 1);
    // two questions in a row (each with the user's answer between)
    assert.equal(h._consecutiveClarify({ messages: [
      user('essay about dolphins'), clarify(), user('conservation'), clarify()] }), 2);
    // a real answer BREAKS the run — a later question starts fresh at 1
    assert.equal(h._consecutiveClarify({ messages: [
      user('essay about dolphins'), clarify(), user('intelligence'), answer(),
      user('now whales'), clarify()] }), 1);
    // the run is only the TRAILING clarifies — a real answer at the tail → 0
    assert.equal(h._consecutiveClarify({ messages: [
      user('essay about dolphins'), clarify(), user('intelligence'), answer()] }), 0);
  });

  test(`${page}: the ask-back gate converges by a growing resting potential + a punt short-circuit`, () => {
    // The fork out-competes an ever-higher bar (REST_CLARIFY · the consecutive-clarify count) and
    // short-circuits on a punt — not a fixed counter.
    assert.match(src, /const REST_CLARIFY=0\.2;/, `${page} dropped the clarify resting potential`);
    assert.match(src, /this\._consecutiveClarify\(cur\)/, `${page} does not count the clarify run`);
    assert.match(src, /clarifyGap>REST_CLARIFY\*kClar&&!this\._clarifyPunt\(q\)/,
      `${page} gate is not gated by the growing bar + punt short-circuit`);
  });
}

// The convergence arithmetic itself: the exact gate expression, exercised over the reported chain
// and the stubborn-ambiguity edge, so a change to REST_CLARIFY or the comparison fails here.
test('convergence: the dolphins chain asks once then answers; strong ambiguity is bounded, not capped', () => {
  const REST_CLARIFY = 0.2;
  const src = readFileSync(join(root, 'src/reader/app.dc.js'), 'utf8');
  const h = harnessOf(src);
  // fires(read, kClar, q) mirrors the sendChat gate's clarify condition
  const fires = (read, kClar, q) => !!(read && read.clarifyDemand === 'clarify'
    && (read.clarifyDrive - read.researchDrive) > REST_CLARIFY * kClar && !h._clarifyPunt(q));

  // The reported chain: a normal (~0.07) clarify drive each turn. k=0 asks; k=1's bar (0.2) is
  // already above the drive, so the second answer proceeds — one question, then answer.
  const weak = (d = 0.07) => ({ clarifyDemand: 'clarify', clarifyDrive: d, researchDrive: 0 });
  assert.equal(fires(weak(), 0, 'write me an essay about dolphins'), true, 'first question is free');
  assert.equal(fires(weak(), 1, "let's learn about conservation efforts"), false, 'converges after one ask');
  assert.equal(fires(weak(), 0, 'anywhere'), false, 'a punt never asks, at any depth');

  // A strongly-voiced ambiguity (~0.31) earns a second ask but is bounded — k=2's bar (0.4)
  // exceeds it. No fixed cap: the number of asks is set by the drive vs the bar, not a counter.
  const strong = { clarifyDemand: 'clarify', clarifyDrive: 0.31, researchDrive: 0 };
  assert.equal(fires(strong, 0, 'compare them'), true);
  assert.equal(fires(strong, 1, 'the two of them'), true, 'a strong ambiguity earns a second ask');
  assert.equal(fires(strong, 2, 'you know which'), false, 'and is bounded by the third bar');

  // A genuine world-gap never enters this fork even at k=0 (research dominates the clarify current).
  assert.equal(fires({ clarifyDemand: 'clarify', clarifyDrive: 0.05, researchDrive: 0.4 }, 0, 'latest news'), false);
});
