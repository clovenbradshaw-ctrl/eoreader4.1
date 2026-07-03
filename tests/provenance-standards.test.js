import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROVENANCE_STANDARDS, provenanceFlags, isProvenanceEnabled } from '../src/organs/out/publish/index.js';

// The provenance standards are capability toggles, one per corner, all OFF by default
// (the RULES_REV opt-in discipline). These pin the settings surface: default off, env and
// per-call override resolve, and every standard names a corner and its honest wiring status.

test('every standard ships OFF by default — the default path is byte-identical', () => {
  const flags = provenanceFlags();
  for (const id of Object.keys(PROVENANCE_STANDARDS)) assert.equal(flags[id], false, `${id} should default off`);
});

test('each registry entry names its corner, env var, and honest status', () => {
  for (const [id, spec] of Object.entries(PROVENANCE_STANDARDS)) {
    assert.equal(spec.id, id);
    assert.ok(spec.owns, `${id} must name the corner it owns`);
    assert.match(spec.envVar, /^EO_PROV_/);
    assert.ok(['planned', 'partial', 'wired'].includes(spec.status), `${id} status honest`);
  }
});

test('a per-call override flips one corner on without touching the rest', () => {
  const flags = provenanceFlags({ c2pa: true });
  assert.equal(flags.c2pa, true);
  assert.equal(flags.robustLinks, false);
  assert.equal(isProvenanceEnabled('c2pa', { c2pa: true }), true);
  assert.equal(isProvenanceEnabled('c2pa'), false);
});

test('an env var flips a corner on (RULES_REV-style truthiness)', () => {
  const prev = process.env.EO_PROV_ROBUST_LINKS;
  try {
    process.env.EO_PROV_ROBUST_LINKS = 'on';
    assert.equal(provenanceFlags().robustLinks, true);
    // A per-call override still wins over env.
    assert.equal(provenanceFlags({ robustLinks: false }).robustLinks, false);
  } finally {
    if (prev == null) delete process.env.EO_PROV_ROBUST_LINKS; else process.env.EO_PROV_ROBUST_LINKS = prev;
  }
});

test('an unknown standard is a loud error, not a silent false', () => {
  assert.throws(() => isProvenanceEnabled('nope'), /unknown provenance standard/);
});
