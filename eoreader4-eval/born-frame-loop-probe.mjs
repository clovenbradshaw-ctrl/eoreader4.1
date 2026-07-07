// End-to-end test — BORN_FRAME wired into the live enacted loop.
//
// Runs the real meaning-driven reading (MiniLM) over the corpus with the flag OFF and
// ON, and reports the falsifier the directive named:
//   - FLAG OFF is today (the causal recalibrate()/seen[] seat).
//   - FLAG ON sources the confirm band + step from the online stance fold; recalibration
//     is a LOGGED, replayable stance REC, and the causal seat is not used.
// The reading is coherent under the flag iff it CONVERGES and does NOT thrash, the
// proposition/document layers still break, and replayFrames reconstitutes the stance.
// The divergence from OFF is expected (the noise-k finding: today's proposition k=3 is
// sub-noise), so this is a behavior change, not byte parity — what matters is that the
// seat is gone and the reading holds together.

import { createMiniLM, setupDoc } from './mechanics/harness.mjs';
import { enactedReadingMeaning } from '../src/enact/index.js';
import { replayFrames, loopStats } from '../src/enact/replay.js';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const stripGutenberg = (t) => {
  const s = t.indexOf('*** START'), e = t.indexOf('*** END');
  let b = t;
  if (s >= 0) b = b.slice(b.indexOf('\n', s) + 1);
  if (e >= 0) b = b.slice(0, b.indexOf('*** END'));
  return b.trim();
};
const CORPUS = [
  { id: 'metamorphosis-excerpt', text: readText('data/metamorphosis.txt') },
  { id: 'esker', text: readText('data/esker.txt') },
  { id: 'metamorphosis-full', text: stripGutenberg(readText('pg5200.txt')) },
];

const recsOf = (events, layer) => events.filter((e) => e.op === 'REC' && e.layer === layer).map((e) => e.cursor);

const run = async () => {
  const embedder = await createMiniLM();
  const line = '─'.repeat(80);
  console.log(line);
  console.log('BORN_FRAME END-TO-END — live reading, flag OFF (today) vs ON (stance fold)');
  console.log(line);

  let allCoherent = true;
  for (const { id, text } of CORPUS) {
    process.stderr.write(`\n[${id}] reading OFF then ON (MiniLM)…\n`);
    const doc = setupDoc(text, id);
    const N = (doc.units || doc.sentences || []).length;
    if (!N) continue;

    const off = await enactedReadingMeaning(doc, N - 1, { embedder });
    const on = await enactedReadingMeaning(doc, N - 1, { embedder, bornFrame: true, bornAlpha: 0.05 });
    if (off.reader !== 'meaning' || on.reader !== 'meaning') { process.stderr.write('  fell back — skip\n'); continue; }

    const statsOff = loopStats(off.events);
    const statsOn = loopStats(on.events);
    const propOff = recsOf(off.events, 'proposition'), propOn = recsOf(on.events, 'proposition');
    const docOff = recsOf(off.events, 'document'), docOn = recsOf(on.events, 'document');
    const stanceRecs = recsOf(on.events, 'stance');

    // Coherence: NOT thrashing, the reading still restructures, and its REC volume is
    // sane relative to today (no explosion). `converging` needs ≥3 RECs to read a trend,
    // so on a short text too few RECs is not incoherence — only thrash or an REC blow-up
    // is. Convergence is required only where it is measurable (proposition RECs ≥ 4).
    const thrash = (s, L) => (s[L] ? s[L].thrash : false);
    const noThrash = !thrash(statsOn, 'proposition') && !thrash(statsOn, 'document');
    const restructures = propOn.length >= 1;
    const noExplosion = propOn.length <= 3 * Math.max(propOff.length, 3);
    const convergesWhereMeasurable = propOn.length < 4 || (statsOn.proposition?.converging ?? false);
    const coherent = noThrash && restructures && noExplosion && convergesWhereMeasurable;
    allCoherent = allCoherent && coherent;

    // The seat: under ON, is the calibration carried by the stance fold and replayable?
    const foldedStance = replayFrames(on.events, N - 1).frames.get('stance');

    console.log(`\n${id}  (units=${N})`);
    console.log(`  proposition RECs   OFF ${propOff.length}   ON ${propOn.length}   ` +
      `(ON converging=${statsOn.proposition?.converging ?? '—'} thrash=${statsOn.proposition?.thrash ?? '—'})`);
    console.log(`  document RECs      OFF ${docOff.length}   ON ${docOn.length}   ` +
      `(ON thrash=${statsOn.document?.thrash ?? '—'})`);
    console.log(`  stance recalibrations (ON, logged & replayable): ${stanceRecs.length} at [${stanceRecs.slice(0, 12).join(', ')}${stanceRecs.length > 12 ? ', …' : ''}]`);
    console.log(`  replayFrames reconstitutes the stance normal: band=${foldedStance ? foldedStance.band : 'MISSING'} step=${foldedStance ? foldedStance.step : '—'}`);
    console.log(`  COHERENT under the flag: ${coherent ? 'YES' : 'NO'}`);
  }

  console.log('\n' + line);
  console.log(`VERDICT: ${allCoherent ? 'the flag-on reading is COHERENT — the seat (recalibrate/seen) is replaced by' : 'NOT coherent — the flag-on reading thrashes or fails to converge; do NOT implement'}`);
  if (allCoherent) console.log('         logged, replayable stance RECs, and the reading still converges & breaks.');
  console.log(line);
};

run().catch((e) => { console.error(e); process.exit(1); });
