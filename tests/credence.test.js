import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/index.js';
import {
  createCredenceBook, projectCredence, credence, CLASS, NUL_O,
  credenceEnabled, credenceReweight, credenceFlag,
} from '../src/credence/index.js';

// A deterministic LCG so every synthetic stream is reproducible — no Math.random,
// so the conformance runs are byte-stable (the spec's replay discipline, §7).
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; };

// The three synthetic sources, built on one book each, in one domain.
const seeker = (book, src = 'S', dom = 'news', n = 30) => {
  const rng = lcg(3);
  for (let i = 0; i < n; i++) book.observeCoherence(src, dom, 0.85 + 0.08 * (rng() - 0.5));
  for (let i = 0; i < n; i++) book.observeCorroboration(src, dom, 0.8 + 0.1 * (rng() - 0.5),
    { corroborators: [{ id: 'a' + i, w_indep: 1 }, { id: 'b' + i, w_indep: 1 }, { id: 'c' + i, w_indep: 1 }] });
  for (let i = 0; i < 12; i++) book.observeRevision(src, dom, 0.4 + 0.3 * rng());
};
const liar = (book, src = 'L', dom = 'news', n = 30) => {
  const rng = lcg(5);
  for (let i = 0; i < n; i++) book.observeCoherence(src, dom, 0.88 + 0.06 * (rng() - 0.5));
  for (let i = 0; i < n; i++) book.observeCorroboration(src, dom, 0.12 + 0.08 * (rng() - 0.5),
    { corroborators: [{ id: 'x' + i, w_indep: 1 }, { id: 'y' + i, w_indep: 1 }] });
  for (let i = 0; i < 12; i++) book.observeRevision(src, dom, -0.25 + 0.1 * (rng() - 0.5));
};
const bullshitter = (book, src = 'B', dom = 'news', n = 40) => {
  const rng = lcg(11);
  for (let i = 0; i < n; i++) book.observeCoherence(src, dom, 0.30 * rng());     // low, dispersed
  for (let i = 0; i < 15; i++) book.observeRevision(src, dom, 2 * rng() - 1);    // unstructured
};

// ── Conformance §5: independence guard ─────────────────────────────────────────

test('§5 independence guard: a sock-puppet cluster does not raise K like an independent set', () => {
  const sock = createCredenceBook();
  const indep = createCredenceBook();
  const against = { id: 'src', author: 'Y' };
  const sockC = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, author: 'X', feed: 'W' }));  // one voice
  const indC  = Array.from({ length: 5 }, (_, i) => ({ id: 'q' + i }));                            // five voices
  for (let i = 0; i < 20; i++) {
    sock.observeCorroboration('Z', 'news', 0.9, { against, corroborators: sockC });
    indep.observeCorroboration('Z', 'news', 0.9, { against, corroborators: indC });
  }
  const sk = sock.at('Z', 'news').evidence.corroboration_n;
  const ik = indep.at('Z', 'news').evidence.corroboration_n;
  assert.ok(ik > sk * 3, `independent K-evidence ${ik.toFixed(1)} ≫ sock-puppet ${sk.toFixed(1)}`);
});

// ── Conformance §6: interval honesty and no gag ────────────────────────────────

test('§6 every output is an interval, and the veto flags — it never gags', () => {
  const b = createCredenceBook(); bullshitter(b);
  const st = b.at('B', 'news');
  // The output is an interval, not a point.
  assert.ok(st.M.lo <= st.M.mean && st.M.mean <= st.M.hi, 'M is an interval');

  const rules = { credence: { enabled: true } };
  const flag = credenceFlag(st, rules);
  assert.ok(flag, 'a low-M source draws a flag');
  assert.equal(flag.refuses, false, 'the flag never gags — refuses is false');
  assert.ok(flag.message && flag.classification && flag.M, 'the flag carries its reason, class and M');

  // The reweight down-weights but never silences: a floor keeps it strictly > 0.
  const w = credenceReweight(1, st, rules);
  assert.ok(w > 0 && w < 1, `down-weighted to ${w.toFixed(3)} — flagged, not gagged`);
});

// ── Conformance §7: replay determinism ─────────────────────────────────────────

test('§7 projecting the same stream twice is identical (deterministic fold)', () => {
  const a = createCredenceBook(); seeker(a); liar(a); bullshitter(a);
  const b = createCredenceBook(); seeker(b); liar(b); bullshitter(b);
  const ser = (book) => JSON.stringify([...book.project()].map(([s, dm]) =>
    [s, [...dm].map(([d, st]) => [d, st.classification, st.M, st.O, st.evidence])]));
  assert.equal(ser(a), ser(b), 'two independent runs of the same stream agree byte-for-byte');
});

// ── Conformance §8: no closure on the asymptotic axis ──────────────────────────

test('§8 the O interval tightens with more independent probes but never closes', () => {
  const mk = (nCorr) => {
    const bk = createCredenceBook();
    for (let i = 0; i < 30; i++) bk.observeCoherence('S', 'news', 0.85);
    for (let i = 0; i < nCorr; i++) bk.observeCorroboration('S', 'news', 0.8,
      { corroborators: [{ id: 'a' + i, w_indep: 1 }, { id: 'b' + i, w_indep: 1 }] });
    for (let i = 0; i < 12; i++) bk.observeRevision('S', 'news', 0.5);
    return bk.at('S', 'news').O;
  };
  const few = mk(3), many = mk(80);
  const wFew = few.hi - few.lo, wMany = many.hi - many.lo;
  assert.ok(wMany < wFew, `O interval tightens ${wFew.toFixed(3)} → ${wMany.toFixed(3)}`);
  assert.ok(wMany > 0, 'but never closes to a point verdict');
});

test('§8 a DEF verdict is emitted only for the bullshitter — O never gets one', () => {
  const s = createCredenceBook(); seeker(s); s.flushVerdicts();
  const l = createCredenceBook(); liar(l); l.flushVerdicts();
  const b = createCredenceBook(); bullshitter(b); b.flushVerdicts();

  const defs = (book) => book.log.snapshot().filter(e => e.op === 'DEF' && e.kind === 'credence_verdict');
  assert.equal(defs(s).length, 0, 'a SEEKER never gets a DEF');
  assert.equal(defs(l).length, 0, 'a LIAR never gets a DEF');
  assert.equal(defs(b).length, 1, 'the BULLSHITTER call is asserted');
  assert.equal(defs(b)[0].verdict, CLASS.BULLSHITTER);
  // No DEF anywhere carries an orientation-axis verdict.
  for (const book of [s, l, b]) {
    for (const e of defs(book)) {
      assert.notEqual(e.verdict, CLASS.SEEKER);
      assert.notEqual(e.verdict, CLASS.LIAR);
      assert.notEqual(e.verdict, CLASS.MODELFUL_UNRESOLVED);
    }
  }
});

// ── Conformance §9: domain separation ──────────────────────────────────────────

test('§9 one source is a seeker in one domain and a bullshitter in another, no cross-contamination', () => {
  const book = createCredenceBook();
  seeker(book, 'D', 'sports');
  bullshitter(book, 'D', 'news');
  const sports = book.at('D', 'sports');
  const news = book.at('D', 'news');
  assert.equal(sports.classification, CLASS.SEEKER);
  assert.equal(news.classification, CLASS.BULLSHITTER);
  assert.ok(sports.M.mean - news.M.mean > 0.5, 'the two domains hold distinct M with no bleed');
});

// ── Conformance §10: void distinctness ─────────────────────────────────────────

test('§10 never-set, cleared, and observed-but-uncertain are three distinct states', () => {
  // never-set: only the NUL init marker touched the cell.
  const neverLog = createLog();
  neverLog.append({ op: 'NUL', kind: 'credence_init', source_id: 'A', domain: 'd', cursor: 0 });
  const neverSet = credence(projectCredence(neverLog), 'A', 'd').classification;

  // a (source,domain) the log never mentions at all is also NUL-never-set.
  const untouched = credence(projectCredence(neverLog), 'NOPE', 'x').classification;

  // observed-but-uncertain: a couple of coherence probes, not enough to call.
  const fewLog = createLog();
  for (let i = 0; i < 3; i++) fewLog.append({ op: 'EVA', kind: 'coherence_obs', source_id: 'A', domain: 'd', x: 0.5, weight: 1, cursor: i });
  const uncertain = credence(projectCredence(fewLog), 'A', 'd').classification;

  // cleared: a regime ran, then a changepoint reset it with nothing observed since.
  const clrLog = createLog();
  for (let i = 0; i < 10; i++) clrLog.append({ op: 'EVA', kind: 'coherence_obs', source_id: 'A', domain: 'd', x: 0.9, weight: 1, cursor: i });
  clrLog.append({ op: 'SEG', kind: 'changepoint', source_id: 'A', domain: 'd', channel: 'coherence', cursor: 10 });
  const clearedState = credence(projectCredence(clrLog), 'A', 'd');
  const cleared = clearedState.classification;

  assert.equal(neverSet, CLASS.NUL, 'never-set is NUL');
  assert.equal(untouched, CLASS.NUL, 'an unmentioned cell is NUL');
  assert.equal(uncertain, CLASS.INDETERMINATE, 'observed-but-thin is INDETERMINATE');
  assert.equal(cleared, CLASS.CLEARED, 'reset-but-unobserved is CLEARED');
  assert.ok(clearedState.prior_regime, 'CLEARED carries the regime before the break');
  // The three never collapse to one.
  assert.equal(new Set([neverSet, uncertain, cleared]).size, 3);
});

test('the confident BULLSHITTER call needs real coherence probes — absence is INDETERMINATE', () => {
  // Corroboration without a single coherence probe: M is 0 by ABSENCE, not by
  // measurement. That must read as observed-but-uncertain, never a bullshitter.
  const book = createCredenceBook();
  for (let i = 0; i < 20; i++) book.observeCorroboration('C', 'news', 0.5,
    { corroborators: [{ id: 'a' + i, w_indep: 1 }] });
  const st = book.at('C', 'news');
  assert.equal(st.classification, CLASS.INDETERMINATE, 'no coherence evidence → not assertable as bullshitter');
  assert.equal(book.flushVerdicts().length, 0, 'and no DEF is emitted');
});

// ── The integration gate (§9, §12): off by default, the live paths unchanged ───

test('§12 the integration points are gated OFF by default — reweight is identity, flag is null', () => {
  const b = createCredenceBook(); bullshitter(b);
  const st = b.at('B', 'news');
  assert.equal(credenceEnabled({}), false, 'no rules → disabled');
  assert.equal(credenceEnabled({ credence: {} }), false, 'present but not enabled → disabled');
  assert.equal(credenceReweight(0.7, st, {}), 0.7, 'gated off → the prior is untouched');
  assert.equal(credenceFlag(st, {}), null, 'gated off → no flag');
});

test('a never-probed source carries no opinion even with the gate on', () => {
  const rules = { credence: { enabled: true } };
  const nul = credence(projectCredence(createLog()), 'ghost', 'd');
  assert.equal(credenceReweight(0.5, nul, rules), 0.5, 'NUL never-set → prior unchanged');
  assert.equal(credenceFlag(nul, rules), null, 'NUL never-set → no flag (held distinct from a low score)');
});
