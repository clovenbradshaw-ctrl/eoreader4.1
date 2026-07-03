import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/index.js';
import {
  calibrateReader, enactedReadingTo,
  DEFAULT_CONFIRM_BAND, DEFAULT_THRESHOLDS,
} from '../src/enact/index.js';

// docs/bayesian-surprise.md — the Level-3 surprise the surfer and the loop ride is
// BAYESIAN surprise (D_KL posterior‖prior over the figure field), not surprisal.

const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. ' +
              'Gregor coughed. Gregor waited. Otto Stein knocked. Otto left.';

// The opening is zero, with no guard — renormalising the prior over the posterior
// support makes the first line fall to KL = 0 on its own (it violates no model that
// yet existed).
test('the opening is exactly zero — no guard, by construction', () => {
  const doc = parseText(STORY, { docId: 'b' });
  assert.equal(readingAt(doc, 0).bayes, 0, 'the first figure splits the reserve and lands in it');
  assert.equal(readingAt(doc, 0).bayesBits, 0);
});

// Two channels, and bayes is the one that clusters low (it answers "how far did belief
// move," not "how improbable"). Both finite and in range.
test('bayes is a second channel, in [0,1), clustering well below surprisal', () => {
  const doc = parseText(STORY, { docId: 'b' });
  const S = (doc.units || doc.sentences).length;
  let sumB = 0, sumS = 0;
  for (let c = 0; c < S; c++) {
    const r = readingAt(doc, c);
    assert.ok(r.bayes >= 0 && r.bayes < 1, `bayes in [0,1): ${r.bayes}`);
    assert.equal(typeof r.bayesBits, 'number');
    sumB += r.bayes; sumS += r.surprise;
  }
  assert.ok(sumB / S < sumS / S, 'bayes clusters below surprisal (the TV-snow correction)');
});

// bayes follows belief-SHIFT, not improbability: a newcomer (the cast changed) moves
// the distribution; a confirming recurrence barely does.
test('bayes follows belief-shift: a newcomer moves it more than a confirming recurrence', () => {
  const doc = parseText('Ada Long spoke. Ada Long spoke. Ben Cole arrived.', { docId: 'b' });
  const recur = readingAt(doc, 1).bayes;     // Ada recurs — belief barely moves
  const newc  = readingAt(doc, 2).bayes;     // Ben enters — belief moves
  assert.ok(newc > recur, `a newcomer (${newc}) shifts belief more than a recurrence (${recur})`);
});

// The newcomer's protention phenomenology: the SAME admitted newcomer costs MORE
// entering a committed cast (the reserve's share has shrunk — a violation of a
// confident expectation) than entering a thin early field (half-expected).
test('the same newcomer costs more entering a committed cast than a thin field', () => {
  const thin = parseText('Ada Long spoke. Ada paused. Ben Cole entered.', { docId: 'thin' });
  const committed = parseText(
    'Ada Long spoke. Ada paused. Ada Long spoke. Ada paused. Cara Mell waited. ' +
    'Cara Mell waited. Dan Pike watched. Dan Pike watched. Ben Cole entered.', { docId: 'committed' });
  const tb = readingAt(thin, (thin.units || thin.sentences).length - 1).bayes;
  const cb = readingAt(committed, (committed.units || committed.sentences).length - 1).bayes;
  assert.ok(cb > tb, `committed (${cb}) > thin (${tb}) — the protention atom shrank`);
});

// calibrateReader fits the scale to the text: band = median, thresholds = 3·/8·step,
// preserving the "higher layer holds harder" 8:3 ratio under any rescaling.
test('calibrateReader fits the band to the median and the thresholds to the step (8:3)', () => {
  const xs = [0, 0.02, 0.03, 0.04, 0.05, 0.2, 0.25, 0.3];
  const cal = calibrateReader(xs);
  assert.ok(cal.fitted, 'a real distribution fits');
  const s = [...xs].sort((a, b) => a - b);
  assert.ok(Math.abs(cal.confirmBand - (s[3] + s[4]) / 2) < 1e-9, 'band is the median');
  assert.ok(Math.abs(cal.thresholds.document / cal.thresholds.proposition - 8 / 3) < 1e-9,
    'the document threshold is ~3× the proposition threshold');
});

test('calibrateReader falls back to the static defaults when the distribution is too thin', () => {
  assert.equal(calibrateReader([]).fitted, false, 'no data → fallback');
  assert.equal(calibrateReader([0.1, 0.1, 0.1]).fitted, false, 'fewer than a handful → fallback');
  const flat = calibrateReader([0, 0, 0, 0, 0]);
  assert.equal(flat.fitted, false, 'no excess to measure → fallback');
  assert.equal(flat.confirmBand, DEFAULT_CONFIRM_BAND);
  assert.deepEqual(flat.thresholds, { ...DEFAULT_THRESHOLDS });
});

// REC liveness: the loop now reads `bayes`, which clusters far below the surprisal-era
// band — so without the per-text calibration the frame goes NUMB. With it, a cast
// turnover fires a proposition REC; with the old static band on the bayes scale it
// fires none. This is the bug calibrateReader fixes.
test('the calibrated cheap loop stays live on bayes where the static band goes numb', () => {
  const TURN = 'Ada Long spoke. Ada Long spoke. Ada Long spoke. Ben Cole arrived. ' +
               'Ben Cole arrived. Cara Mell entered. Cara Mell entered. Dax Pell came. ' +
               'Dax Pell came. Eve Roan stood. Eve Roan stood.';
  const doc = parseText(TURN, { docId: 'b' });
  const end = (doc.units || doc.sentences).length - 1;

  const live = enactedReadingTo(doc, end);   // calibrated per doc (the default path)
  assert.ok(live.stats.proposition.recs >= 1, 'a cast turnover restructures the proposition frame');

  const numb = enactedReadingTo(doc, end, { confirmBand: DEFAULT_CONFIRM_BAND, thresholds: DEFAULT_THRESHOLDS });
  assert.equal(numb.stats.proposition.recs, 0, 'the surprisal-era band on the bayes scale never breaks');
});
