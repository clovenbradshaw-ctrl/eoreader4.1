// Prototype measurement — the stance layer as a fold, on the real corpus.
//
// The current loop calibrates its scale with `recalibrate()`: an expanding causal
// window (`seen[]`) refits the confirm band EVERY cursor, silently — the adjustment is
// not in the enacted log, cannot be replayed, and cannot be RECed. The stance-fold
// prototype (src/enact/stance-fold.js) makes that calibration an enacted layer: it
// holds a normal and RECs — discretely, in the log — only when the surprise stream's
// level genuinely shifts past the noise line.
//
// This probe runs both over the same real surprise stream (the live MiniLM meaning
// reading) and asks the falsifier the directive named: is the reading's calibration now
// carried by a SMALL, SETTLING set of logged recalibration RECs (the seat collapsed
// into the fold), or does the silent per-cursor drift still have to run alongside (a
// layer was added and the seat is still there)? It also demonstrates the headline
// claim: `replayFrames` reconstitutes the stance calibration at any cursor with no new
// code.

import { createMiniLM, setupDoc } from './mechanics/harness.mjs';
import { enactedReadingMeaning, calibrateReader, stanceFold } from '../src/enact/index.js';
import { replayFrames } from '../src/enact/replay.js';
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

// The current silent seat: the causal confirm band as it stands at each cursor, refit
// from surprises seen so far (what recalibrate() does every cursor). Count how many
// cursors it materially moves — the churn the log never records.
const causalBandTrajectory = (surprises) => {
  const band = [];
  for (let c = 1; c <= surprises.length; c++) {
    band.push(calibrateReader(surprises.slice(0, c)).confirmBand);
  }
  let moves = 0;
  for (let i = 1; i < band.length; i++) if (Math.abs(band[i] - band[i - 1]) > 1e-4) moves++;
  return { band, moves, final: band[band.length - 1] };
};

const run = async () => {
  const embedder = await createMiniLM();
  const ALPHAS = [0.05, 0.01];
  const line = '─'.repeat(78);
  console.log(line);
  console.log('STANCE LAYER AS A FOLD — recalibration as a logged, replayable REC');
  console.log(line);

  for (const { id, text } of CORPUS) {
    process.stderr.write(`\n[${id}] reading (MiniLM)…\n`);
    const doc = setupDoc(text, id);
    const units = doc.units || doc.sentences || [];
    if (!units.length) continue;
    const reading = await enactedReadingMeaning(doc, units.length - 1, { embedder });
    if (reading.reader !== 'meaning') { process.stderr.write(`  fell back to ${reading.reader}\n`); continue; }

    // The real surprise stream the loop rode: the proposition-layer EVA surprises.
    const surprise = new Array(units.length).fill(0);
    for (const e of reading.events) if (e.op === 'EVA' && e.frameLayer === 'proposition')
      surprise[e.cursor] = e.surprise;

    const silent = causalBandTrajectory(surprise);

    console.log(`\n${id}  (units=${units.length})`);
    console.log(`  SILENT SEAT (recalibrate): confirm band moves on ${silent.moves}/${units.length} cursors ` +
      `(${(100 * silent.moves / units.length).toFixed(0)}% — churn the log never records), final band=${silent.final.toFixed(3)}`);

    for (const alpha of ALPHAS) {
      const { events, calibrationAt } = stanceFold(surprise, { alpha });
      const recs = events.filter((e) => e.op === 'REC');
      const defs = events.filter((e) => e.op === 'DEF');
      // Convergence: are the gaps between recalibrations GROWING (settling), or churning?
      const cursors = recs.map((e) => e.cursor);
      const gaps = cursors.slice(1).map((c, i) => c - cursors[i]);
      const settling = gaps.length < 2 || gaps[gaps.length - 1] >= gaps[0];
      // Distinct normals — a thrash would flip between a few; a settling reading installs
      // few, monotone-ish normals.
      const distinct = new Set(defs.map((e) => `${e.frame.band}`)).size;
      console.log(`  STANCE FOLD α=${alpha}: recalibrations=${recs.length} at [${cursors.join(', ') || '—'}]  ` +
        `distinct normals=${distinct}  ${settling ? 'SETTLING' : 'churning'}`);
      // The headline: replayFrames reconstitutes the calibration at an arbitrary cursor
      // with NO new code — the same layer-agnostic fold used for proposition/document.
      const mid = Math.floor(units.length * 0.6);
      const folded = replayFrames(events, mid).frames.get('stance');
      const direct = calibrationAt(mid);
      const ok = folded && Math.abs(folded.band - direct.band) < 1e-9;
      console.log(`    replayFrames@${mid}: band=${folded ? folded.band : 'null'}  (matches module: ${ok})`);
    }
  }

  console.log('\n' + line);
  console.log('READING: a SETTLING handful of logged recalibrations (vs the silent per-cursor');
  console.log('churn) means the calibration can be SOURCED from the stance fold — the seat');
  console.log('collapses into the log. The end-to-end falsifier (delete recalibrate()/seen[],');
  console.log('drive thresholds off the folded stance × the noise-derived k≈8, hold parity) is');
  console.log('the next gated step; this shows the fold is well-formed and replayable.');
  console.log(line);
};

run().catch((e) => { console.error(e); process.exit(1); });
