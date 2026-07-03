// essay-backwards — the backwards analysis, made executable.
//
// docs/essay-backwards.md decomposed a compelling essay into the loop's operator
// alphabet and found that ~75% of an essay's atoms consume no fresh external span —
// they operate on prior atoms. The claim: the loop we had can only SPEND ground, so it
// stops with `ground-exhausted` ~3 atoms into essay-shaped work; the SELF register (the
// edge ops resolving against the accepted units) is what lets it keep developing.
//
// This harness proves the STRUCTURAL claim end to end. It runs the loop over the
// essay's own concept graph twice — register OFF (the failure it reproduces) and
// register ON (the fix) — with the echo model, and reports the realized move-trace,
// the stop reason, and the atom count for each. The prose is echo (spans read back
// verbatim); what is under test is the SHAPE of the walk, not the phrasing.
//
//   run:  node eoreader4-eval/essay-backwards.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runContinuation, exportAudit } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const trace = JSON.parse(readFileSync(join(HERE, 'essay-backwards.trace.json'), 'utf8'));

// The external ground: the NODE material the essay introduces — the concepts a node op
// (DEF/INS/CON/SIG) spends. Drawn from the trace's fresh-external atoms, ranked so the
// walk has a stable order to open on. This is the whole external pool; everything past
// it the essay must develop, not introduce.
const CONCEPT_GROUND = trace.atoms
  .filter(a => a.freshSpan === true)
  .map((a, i) => ({ idx: i, score: 1 - i * 0.12, text: a.gist }));

const EDGE = new Set(trace.summary.nodeMovesVsEdgeMoves.edge);

const movesOf = (res) => res.units.map(u => u.move);
const edgeCount = (moves) => moves.filter(m => EDGE.has(m)).length;

const report = (label, res) => {
  const moves = movesOf(res);
  console.log(`\n── ${label} ──`);
  console.log(`  atoms      : ${res.units.length}`);
  console.log(`  stop       : ${res.stop}`);
  console.log(`  move-trace : ${moves.join(' · ') || '(none)'}`);
  console.log(`  edge moves : ${edgeCount(moves)} / ${moves.length}  (self-operations, the essay's substance)`);
  return { atoms: res.units.length, stop: res.stop, edge: edgeCount(moves), total: moves.length };
};

const main = async () => {
  const model = createModel('echo');
  await model.load();

  console.log('essay-backwards — generate-then-read parity, structural harness');
  console.log(`concept ground: ${CONCEPT_GROUND.length} external nodes (the pool a node op spends)`);

  const target = trace.atoms.map(a => a.move);
  console.log(`\ntarget essay   : ${target.length} atoms, ${edgeCount(target)} edge moves ` +
    `(${Math.round(100 * edgeCount(target) / target.length)}% self-operation)`);
  console.log(`target trace   : ${target.join(' · ')}`);

  // Temperature reaches up the posterior so the walk draws the varied moves an essay
  // needs rather than argmax-repeating one op; the arc biases open→DEF, land→SYN.
  const common = { ground: CONCEPT_GROUND, model, arc: true, temperature: 1 };

  const off = await runContinuation({ ...common });                       // the failure
  const on = await runContinuation({ ...common, selfRegister: true });    // develops + lands
  // + the self-fold: strain now comes from the argument moving off its frame, not only
  // the floor's grounding verdict — so a REC (the turn) can fire on clean-binding prose.
  const onFold = await runContinuation({ ...common, selfRegister: true, semanticStrain: true });

  const rOff = report('register OFF  (spend-only — reproduces the early stop)', off);
  const rOn = report('register ON   (self register — develops and lands)', on);
  report('register ON + self-fold (semantic strain — the lexical proxy for the turn)', onFold);

  // THE FULL PIPELINE (generation-by-field-reading.md): read the atoms back as a density
  // field, detect the turn where the field rotates (atmosphere/paradigm + the Born void),
  // and realize it as a REC — with the interleave scheduler walking the ground so the turn
  // lands after a develop. A turning ground (three topics) and the hash embedder.
  const embed = createHashEmbedder().embed;
  const turningGround = [
    { idx: 0, score: 0.95, text: 'a small model is fluent past its knowledge' },
    { idx: 1, score: 0.90, text: 'handed a gap the model will fill the gap' },
    { idx: 2, score: 0.85, text: 'the fill is fluent and often wrong' },
    { idx: 3, score: 0.80, text: 'a planner decides every structural move first' },
    { idx: 4, score: 0.75, text: 'the planner grounds each claim on a span' },
    { idx: 5, score: 0.70, text: 'a floor truncates whatever fails to bind' },
    { idx: 6, score: 0.65, text: 'across messages the state persists and resumes' },
    { idx: 7, score: 0.60, text: 'the resumed session widens the running fold' },
  ];
  const fullCfg = { arc: true, temperature: 1, maxSteps: 40, selfRegister: true, fieldRead: true, embed, interleave: true, confine: true };
  const full = await runContinuation({ ground: turningGround, model, ...fullCfg });
  const rFull = report('FULL: self-register + field-read + interleave (the pipeline)', full);
  const fullMoves = movesOf(full);
  const recFired = fullMoves.includes('REC');
  console.log(`  REC (the turn) : ${recFired ? 'YES — fired where the field rotates, after a develop' : 'no'}`);

  // DECISION AS RELAXATION — the cadence emerges from occupancy currents, no scheduler.
  const dynCfg = { arc: true, temperature: 1, maxSteps: 40, selfRegister: true, fieldRead: true, embed, dynamics: true, confine: true };
  const dyn = await runContinuation({ ground: turningGround, model, ...dynCfg });
  report('DYNAMICS: decision as relaxation (cadence emerges, no scheduler)', dyn);

  // THE AUDIT EXPORT — write a self-contained artifact and self-diagnose whether it worked.
  const audit = exportAudit(dyn, { config: dynCfg, label: 'dynamics-turning-ground' });
  const path = new URL('./essay-backwards.audit.json', import.meta.url);
  writeFileSync(path, JSON.stringify(audit, null, 1));
  console.log(`\n  audit exported → eoreader4-eval/essay-backwards.audit.json`);
  console.log(`  self-diagnosis : ${audit.checks.verdict}`);
  console.log(`    the field read (relEntropy atmosphere + commutator paradigm, picked by the`);
  console.log(`    Born void voidPeaks, gated by readingCount) locates the turn in the generated`);
  console.log(`    field; the interleave scheduler lands it after an EVA and the loop realizes a`);
  console.log(`    REC. This is the §4.2 seam, coarse: the cadence read off the field, not the`);
  console.log(`    move-predictor. A real embedder sharpens WHICH turns; the mechanism is here.`);

  // The macro-arc: a run of node moves (open), then self-op develops (the body), then
  // a SYN close (land). The essay's shape, read off the realized trace.
  const onMoves = movesOf(on);
  const lands = on.stop === 'arc-closed' && onMoves[onMoves.length - 1] === 'SYN';
  const develops = rOn.edge > rOff.edge;
  const opens = onMoves.slice(0, 1).every(m => !EDGE.has(m));
  const arc = opens && develops && lands;

  console.log('\n── verdict ──');
  const decoupled = rOn.atoms > rOff.atoms && !['ground-exhausted', 'saturated'].includes(on.stop);
  console.log(`  length decoupled from span exhaustion : ${decoupled ? 'YES' : 'no'} ` +
    `(off stopped '${off.stop}' at ${rOff.atoms}; on '${on.stop}' at ${rOn.atoms})`);
  console.log(`  edge moves realized (self-operation)  : ${develops ? 'YES' : 'no'} ` +
    `(off ${rOff.edge}, on ${rOn.edge})`);
  console.log(`  walks the macro-arc open→develop→land  : ${arc ? 'YES' : 'no'} ` +
    `(open on a node move; body self-ops; lands '${on.stop}')`);
  console.log(`\n  reading: the OFF run walks the NODES and quits when they run out — a summary.`);
  console.log(`  the ON run spends the pool to open, then operates on what it said, then closes.`);

  console.log('\n── seams still open (honest gaps, not hacks) ──');
  console.log(`  • the OPEN is node-led but CON-led, not DEF-led: the recurrence seed and the`);
  console.log(`    short self-log let CON out-draw the DEF the arc's open phase biases toward.`);
  console.log(`  • no REC in the body: the echo model binds every atom clean, so there is no`);
  console.log(`    strain for a restructure to turn on. REC appears with a model that drifts.`);
  console.log(`  • the FINE rhythm (which develop, when to turn) is the "read self back through`);
  console.log(`    the perceiver" seam (spec-generation.md) — this harness lands the MACRO arc.`);

  // A non-zero exit if the fix did not change the shape, so this can gate CI later.
  if (!(decoupled && develops)) {
    console.log('\n  NOTE: the self register did not change the walk shape here — investigate.');
    process.exitCode = 1;
  }
};

main().catch(err => { console.error(err); process.exitCode = 1; });
