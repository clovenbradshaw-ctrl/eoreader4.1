// tools/cursor/probe-replay.mjs — the golden-parity anchor for the reason/cursor work
// (CURSOR_REV). Two read-only gates against the real walk:
//
//   Gate A, replay (weak form): the walk is a pure function of the seeded log — same
//   seed, same steps, byte-identical result across two independent runs.
//
//   Gate A, strong form (needs readGraph exported — Step 0): the fold over events with
//   seq <= k deep-equals the graph the walk read entering step k. Checked in
//   tests/reason-cursor.test.js once the export exists; this probe captures the
//   per-step graphs via the propose hook so the baseline carries them.
//
//   --write   overwrite tools/cursor/golden-walk.json with this run — the baseline the
//             golden test pins every cursor step against. Written ONCE against the
//             pre-cursor walk; only rewrite it on a deliberate, explained re-baseline.
//
// The corpus is the fixture from tests/reason-walk.test.js — the existing gate.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createLog } from '../../src/core/log.js';
import { walkReasoning, seedCorpus } from '../../src/reason/index.js';

const GOLDEN = fileURLToPath(new URL('./golden-walk.json', import.meta.url));

export const CORPUS = [
  { op: 'INS', id: 'a', label: 'Acme' },
  { op: 'INS', id: 'b', label: 'Bob' },
  { op: 'INS', id: 'c', label: 'Corp' },
  { op: 'INS', id: 'd', label: 'Dana' },
  { op: 'INS', id: 'e', label: 'Eve' },
  { op: 'CON', src: 'a', dst: 'b', via: 'employs' },
  { op: 'CON', src: 'c', dst: 'd', via: 'employs' },
  { op: 'CON', src: 'a', dst: 'c', via: 'partners' },
];

// A graph snapshot, JSON-safe and order-stable (Maps → sorted entries).
const snapGraph = (g) => ({
  figures: [...g.figures.values()].map((f) => ({ ...f })),
  bonds: g.bonds.map((b) => ({ ...b })),
  grains: [...g.grains].sort((x, y) => x - y),
  eventCount: g.events.length,
});

// One deterministic walk over the fixture, capturing the graph the walk read at each
// step through the propose hook (which returns null → the walk's own choice stands).
export const runBaseline = async () => {
  const log = createLog({ docId: 'cursor-golden' });
  seedCorpus(log, CORPUS);
  const corpusLen = log.length;
  const graphs = [];
  const result = await walkReasoning(log, {
    epsilon: 0.02, maxSteps: 24,
    propose: (cands, { graph }) => { graphs.push(snapGraph(graph)); return null; },
  });
  return {
    corpusLen,
    steps: result.steps.map((s) => ({ ...s })),
    saturationTrace: result.saturationTrace,
    gradeCounts: result.gradeCounts,
    groundedFraction: result.groundedFraction,
    quiesced: result.quiesced,
    graphsSeen: graphs,
    logEvents: log.snapshot().map((e) => ({ ...e, t: 0 })),   // t is wall-clock; zeroed (never folded)
  };
};

const main = async () => {
  const a = await runBaseline();
  const b = await runBaseline();
  const same = JSON.stringify(a) === JSON.stringify(b);
  console.log(`replay determinism (weak Gate A): ${same ? 'HOLDS ✓' : 'BROKEN ✗'}`);
  console.log(`steps: ${a.steps.length} · quiesced=${a.quiesced} · grades=${JSON.stringify(a.gradeCounts)}`);
  for (const s of a.steps) console.log(`  ${s.i}. [${s.op}] ${s.note} (${s.grade}, bits ${s.bits})`);

  if (process.argv.includes('--write')) {
    mkdirSync(fileURLToPath(new URL('.', import.meta.url)), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(a, null, 2));
    console.log(`\ngolden baseline written → ${GOLDEN}`);
  } else {
    try {
      const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
      const match = JSON.stringify(a) === JSON.stringify(golden);
      console.log(`\nagainst golden baseline: ${match ? 'PARITY ✓' : 'DIVERGED ✗'}`);
      if (!match) process.exit(1);
    } catch {
      console.log('\n(no golden baseline yet — run with --write to capture one)');
    }
  }
  if (!same) process.exit(1);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
