import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bandPull, bandCentroids } from '../src/classify/index.js';

// A toy 3-D meaning space: Ground=[1,0,0], Figure=[0,1,0], Pattern=[0,0,1]. Names
// carry Ground, the verb carries Figure. Removing an element drops similarity to
// its own band most — which is exactly what band-pull reads. Proves the mechanism
// without the model (the sandbox can't fetch the production embedder).
const SIG = { Darcy: [1, 0, 0], Elizabeth: [1, 0, 0], admired: [0, 1, 0] };
const toy = {
  measuresMeaning: true,
  embed: async (t) => {
    const v = [0, 0, 0];
    for (const w of t.split(/\s+/)) { const s = SIG[w]; if (s) for (let i = 0; i < 3; i++) v[i] += s[i]; }
    const L = Math.hypot(...v) || 1;
    return v.map((x) => x / L);
  },
};
const BANDS = { Ground: [1, 0, 0], Figure: [0, 1, 0], Pattern: [0, 0, 1] };

// §3 — each element is drawn to the band the structure predicts; the band-pull
// confirms the structural position (or would flag a divergence as signal).
test('band-pull draws the verb to Figure and the endpoints to Ground', async () => {
  const elements = { subject: { text: 'Darcy' }, verb: { text: 'admired' }, object: { text: 'Elizabeth' } };
  const r = await bandPull('Darcy admired Elizabeth', elements, { embedder: toy, bands: BANDS });
  assert.equal(r.live, true);
  assert.equal(r.elements.verb.drawn, 'Figure', 'the verb pulls Figure (the act)');
  assert.equal(r.elements.subject.drawn, 'Ground', 'the subject pulls Ground (a grounded existent)');
  assert.equal(r.elements.object.drawn, 'Ground', 'the object pulls Ground');
  assert.ok(r.elements.verb.confirms && r.elements.subject.confirms && r.elements.object.confirms,
    'all three confirm the structural position');
});

// The firewall: meaning-only. Under the hash organ a spelling-delta lands nowhere.
test('band-pull holds at no-commit under a non-measuring embedder', async () => {
  const hash = { measuresMeaning: false, embed: async () => [1, 0, 0] };
  const r = await bandPull('Darcy admired Elizabeth', { verb: { text: 'admired' } }, { embedder: hash, bands: BANDS });
  assert.equal(r.live, false, 'no-commit — type-consistency is real only in a meaning space');
});

// Band centroids are the mean of each band's cell centroids — built from the
// existing whole-phrase bundle, no rebuild. Keys are OP_Stance_Site.
test('bandCentroids averages each band from the existing centroid bundle', () => {
  const centroids = { vectors: {
    INS_Making_Entity: [1, 0], NUL_Holding_Field: [0.8, 0.2],      // Ground
    DEF_Dissecting_Lens: [0, 1], SIG_Behold_Entity: [0.2, 0.9],     // Figure
    CON_Binding_Link: [-1, 0],                                      // Pattern
  } };
  const b = bandCentroids(centroids);
  assert.ok(b.Ground && b.Figure && b.Pattern, 'a centroid per non-empty band');
  assert.equal(b.Ground.length, 2, 'in the bundle’s dimensionality');
  assert.equal(bandCentroids({ vectors: {} }), null, 'no vectors → null (no-commit upstream)');
});
