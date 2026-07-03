import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  personalityDirection, projectPersonality, loadVoiceCartridge, cartridgeBias,
  PANTHEON, loadPantheon, mountPersonality, capNorm, orthogonality, defaultPantheonBank,
  STANCE, SITE_GRAIN, loadStanceBanks, stanceFamily, resolveOverlap,
  BAND_CELLS, bandToCell, bandOfCell, DIAL, dialMultipliers,
} from '../src/write/voice.js';

// Personality is the Horizon's DEPARTURE from σ projected to tokens. The load-bearing claim is
// mechanical: at ρ = σ (maximally mixed) every Born weight is 1/d, every coefficient (λ_i − 1/d)
// is zero, and the voice is characterless by construction.

const sigma = (d) => Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 / d : 0)));
const departed = [[0.8, 0, 0], [0, 0.1, 0], [0, 0, 0.1]];   // a Horizon that has committed
const conceptMap = { firstTokenOf: (l) => (l === 'grete' ? 13 : null) };

test('personalityDirection ≡ 0 at ρ = σ — characterless by construction', () => {
  const dir = personalityDirection(sigma(3));
  for (const x of dir) assert.ok(Math.abs(x) < 1e-9, 'no standing tilt at the ground');
});

test('personalityDirection ≠ 0 once ρ has departed σ', () => {
  const dir = personalityDirection(departed);
  assert.ok(dir.some(x => Math.abs(x) > 1e-3), 'a committed Horizon carries a tilt');
});

test('projectPersonality — empty at ρ = σ, lands a figure once departed', () => {
  const acts = new Map([['grete', [1, 0, 0]]]);
  assert.equal(projectPersonality({ rho: sigma(3), figureActivations: acts, conceptMap }).size, 0);
  const map = projectPersonality({ rho: departed, figureActivations: acts, conceptMap });
  assert.ok(map.has(13) && map.get(13) !== 0, 'the salient-to-ρ figure is biased on its token');
});

test('projectPersonality — a figure with no token is skipped', () => {
  const acts = new Map([['nobody', [1, 0, 0]]]);
  assert.equal(projectPersonality({ rho: departed, figureActivations: acts, conceptMap }).size, 0);
});

test('the contrastive cartridge loads to a finite token-bias map', () => {
  const cart = loadVoiceCartridge({ meta: { kind: 'demo' }, tokens: { '7': 0.5, '9': -0.3, 'x': 1 } });
  assert.equal(cart.size, 2, 'non-integer ids dropped');
  const bias = cartridgeBias(cart, 2);
  assert.equal(bias.get(7), 1.0);
  assert.equal(bias.get(9), -0.6);
});

// ── THE PANTHEON (spec-the-pantheon.md) ──────────────────────────────────────────────────
test('the roster is the corrected nine, with caps asymmetric by risk', () => {
  assert.deepEqual(Object.keys(PANTHEON), ['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC']);
  assert.equal(PANTHEON.NUL.god, 'Chaos');
  assert.equal(PANTHEON.REC.god, 'Mnemosyne');
  assert.ok(PANTHEON.SIG.cap < PANTHEON.DEF.cap, 'Apollo (claims most) capped tighter than Thoth (colors least)');
});

const bakedBank = () => loadPantheon({ gods: {
  DEF: { tokens: { '5': 3, '6': 4 } },   // Thoth, cap 1.0
  SEG: { tokens: { '5': 3, '6': 4 } },   // Terminus, cap 0.7
} });

test('mountPersonality — auto-mounts the cell\'s Act cartridge, Born-weighted under the cap', () => {
  const bank = bakedBank();
  const full = mountPersonality({ cell: { act: 'DEF' }, weights: { act: 1 }, bank, budget: 100 });
  assert.equal(full.bias.get(5), 3);                          // cap 1.0 × weight 1
  assert.equal(full.mounted[0].god, 'Thoth');
  const capped = mountPersonality({ cell: { act: 'SEG' }, weights: { act: 1 }, bank, budget: 100 });
  assert.ok(capped.bias.get(5) < full.bias.get(5), 'the tighter cap colors less for the same vector');
});

test('mountPersonality — Born weight scales the contribution', () => {
  const bank = bakedBank();
  const hi = mountPersonality({ cell: { act: 'DEF' }, weights: { act: 1.0 }, bank, budget: 100 }).bias.get(5);
  const lo = mountPersonality({ cell: { act: 'DEF' }, weights: { act: 0.5 }, bank, budget: 100 }).bias.get(5);
  assert.ok(lo < hi, 'a subordinate coordinate only colors');
});

test('the budget caps the summed personality vector (the degeneracy cliff)', () => {
  const v = new Map([[1, 6], [2, 8]]);                        // L2 = 10
  capNorm(v, 5);
  assert.ok(Math.abs(Math.hypot(v.get(1), v.get(2)) - 5) < 1e-9, 'norm clamped to the ceiling');
});

test('NUL-on-VOID — Chaos mounts locked', () => {
  const bank = loadPantheon({ gods: { NUL: { tokens: { '3': 2 } } } });
  const m = mountPersonality({ cell: { act: 'NUL', locked: true }, weights: { act: 1 }, bank, budget: 100 });
  assert.equal(m.mounted[0].god, 'Chaos');
  assert.equal(m.mounted[0].locked, true, 'the governance lock is recorded on the mount');
});

test('register-orthogonality — the REC vs Stance-defeat independence gate', () => {
  assert.ok(Math.abs(orthogonality(new Map([[1, 1], [2, 1]]), new Map([[1, 1], [2, 1]])) - 1) < 1e-9);
  assert.equal(orthogonality(new Map([[1, 1]]), new Map([[2, 1]])), 0, 'disjoint cartridges are orthogonal');
});

test('defaultPantheonBank — empty vectors ⇒ λ is a no-op until baked', () => {
  const bank = defaultPantheonBank();
  assert.equal(bank.get('DEF').god, 'Thoth');
  assert.equal(bank.get('DEF').bias.size, 0);
  assert.equal(mountPersonality({ cell: { act: 'DEF' }, weights: { act: 1 }, bank }).bias.size, 0);
});

// ── Stance (Track C) + Site (Track D) ────────────────────────────────────────────────────
test('Stance Mode — the projective Generate stance is capped tightest', () => {
  assert.ok(STANCE.mode.Generate.cap < STANCE.mode.Differentiate.cap, 'Generate claims most → tightest cap');
  assert.equal(stanceFamily('Making'), 'Generate');
  assert.equal(stanceFamily('Clearing'), 'Differentiate');
  assert.equal(stanceFamily('???'), null);
});

test('Site grain — Figure has no cartridge (μ carries it); Ground/Pattern do', () => {
  assert.equal(SITE_GRAIN.Figure, undefined);
  assert.ok(SITE_GRAIN.Ground && SITE_GRAIN.Pattern);
});

test('multi-axis mount — Act + Mode + grain sum at the cell', () => {
  const banks = {
    act: loadPantheon({ gods: { DEF: { tokens: { '5': 4 } } } }),
    mode: loadStanceBanks({ mode: { Relate: { tokens: { '6': 2 } } } }).mode,
    grain: loadStanceBanks({}).resolution,   // empty, ignored
  };
  const m = mountPersonality({ cell: { act: 'DEF', mode: 'Relate' }, weights: { act: 1, mode: 1 }, banks, budget: 100 });
  assert.ok(m.bias.get(5) > 0 && m.bias.get(6) > 0, 'both coordinates contributed');
  assert.equal(m.mounted.length, 2);
});

test('register-orthogonality gate — collapses Stance-defeat into Act-REC when too aligned', () => {
  const act = loadPantheon({ gods: { REC: { tokens: { '1': 1, '2': 1 } } } });
  const stance = loadStanceBanks({ resolution: { defeat: { tokens: { '1': 1, '2': 1 } } } });   // identical → cos 1
  const r = resolveOverlap(act, stance, { threshold: 0.6 });
  assert.equal(r.collapsed, true);
  assert.equal(stance.resolution.has('defeat'), false, 'the overlapping coordinate goes unbaked, not double-counted');
});

// ── BAND → CARTRIDGE: epistemic status made audible ──────────────────────────────────────
test('bandOfCell — read from provenance, not the model', () => {
  assert.equal(bandOfCell({ spans: [{ idx: 3 }], op: 'DEF' }), 'existence');     // one resolving span
  assert.equal(bandOfCell({ spans: [{ idx: 3 }, { idx: 9 }] }), 'structure');    // assembled across spans
  assert.equal(bandOfCell({ spans: [{ idx: 3 }], op: 'CON' }), 'structure');     // carried by a relation
  assert.equal(bandOfCell({ spans: [] }), 'significance');                        // a reading, no resolving span
});

test('bandToCell — existence→DEF, structure→Pattern+CON, significance→SIG+EVA', () => {
  assert.equal(bandToCell('existence').act, 'DEF');
  assert.equal(bandToCell('structure').grain, 'Pattern');
  assert.deepEqual(bandToCell('significance').act, ['SIG', 'EVA']);
  assert.equal(bandToCell('absence').act, 'NUL');
});

test('band-mounted register separates the three levels (with baked vectors)', () => {
  // Existence bare (DEF), Structure assembled (CON+Pattern), Significance perspectival (SIG+EVA):
  // distinct token sets ⇒ the registers are distinguishable, the whole point of routing through
  // the band rather than the model's flat declarative.
  const banks = {
    act: loadPantheon({ gods: { DEF: { tokens: { '10': 3 } }, CON: { tokens: { '20': 3 } }, SIG: { tokens: { '30': 3 } }, EVA: { tokens: { '31': 3 } } } }),
    grain: (() => { const b = new Map(); b.set('Pattern', { label: 'Pattern', cap: 0.5, bias: new Map([[21, 2]]) }); return b; })(),
  };
  const reg = (band) => mountPersonality({ cell: { ...bandToCell(band), grain: band === 'structure' ? 'Pattern' : null }, weights: { act: 1, grain: 1 }, banks, budget: 100 }).bias;
  assert.ok(reg('existence').has(10) && !reg('existence').has(30), 'existence ⇒ Thoth, not Apollo');
  assert.ok(reg('structure').has(20) && reg('structure').has(21), 'structure ⇒ Harmonia + Pattern grain');
  assert.ok(reg('significance').has(30) && reg('significance').has(31), 'significance ⇒ Apollo + Themis');
});

// ── THE DIAL (Track E) ───────────────────────────────────────────────────────────────────
test('dialMultipliers — plain prefs combine into per-cartridge weight factors', () => {
  assert.equal(dialMultipliers(null).size, 0);
  const m = dialMultipliers({ terse: true, cautious: true });
  assert.equal(m.get('act:DEF'), DIAL.terse['act:DEF']);              // terse boosts Thoth
  assert.ok(Math.abs(m.get('act:SIG') - DIAL.terse['act:SIG'] * DIAL.cautious['act:SIG']) < 1e-9, 'overlapping factors multiply');
  assert.deepEqual(dialMultipliers(['concrete']).get('grain:Ground'), DIAL.concrete['grain:Ground']);
});

test('the dial scales the mounted weight as a standing preference', () => {
  const bank = loadPantheon({ gods: { DEF: { tokens: { '5': 4 } } } });
  const base = mountPersonality({ cell: { act: 'DEF' }, weights: { act: 1 }, bank, budget: 1e9 }).bias.get(5);
  const terse = mountPersonality({ cell: { act: 'DEF' }, weights: { act: 1 }, bank, budget: 1e9, dialMul: dialMultipliers({ terse: true }) }).bias.get(5);
  assert.ok(terse > base, 'terse dials Thoth up');
});

test('the dial can never override the NUL-on-VOID lock', () => {
  // A dial that would damp NUL must be ignored on a locked coordinate — you cannot dial abstention
  // into a confident register (the governance lock).
  const bank = loadPantheon({ gods: { NUL: { tokens: { '3': 2 } } } });
  const dialMul = new Map([['act:NUL', 0.1]]);
  const nodial = mountPersonality({ cell: { act: 'NUL', locked: true }, weights: { act: 1 }, bank, budget: 1e9 }).bias.get(3);
  const locked = mountPersonality({ cell: { act: 'NUL', locked: true }, weights: { act: 1 }, bank, budget: 1e9, dialMul }).bias.get(3);
  const open = mountPersonality({ cell: { act: 'NUL' }, weights: { act: 1 }, bank, budget: 1e9, dialMul }).bias.get(3);
  assert.equal(locked, nodial, 'the lock ignores the dial');
  assert.ok(open < locked, 'an unlocked coordinate would have been damped');
});
