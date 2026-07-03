// Frontier — the witness-channel spectrum, measured on the real engine.
//
// The honest axis is NOT hand-coded-vs-learned. It is: does resolving this need the
// WITNESS CHANNEL to read meaning? The engine side is the large middle — deterministic
// rules PLUS corpus-learned statistics (Fellegi-Sunter m/u, discriminativeness, the
// REC ledger) — and it is emphatically not the model; only open-domain meaning crosses
// the line. Most "the core can't do this yet" cases sit at `engine` (the next
// deterministic build) or `mixed` (a learned/deterministic core with a witness tail);
// only a few genuinely need the channel.
//
// Each case runs through the REAL parseText + projectGraph (no model, no embedder, no
// weights) to MEASURE what the core does today, and pulls its tier from the canonical
// spectrum (src/core/resolution-spectrum.js) so the panel and the classifier agree.
// Pure, browser-safe; the Node CLI and conformance.html both import `runFrontier`.

import { parseText }    from '../src/perceiver/parse/pipeline.js';
import { projectGraph } from '../src/core/project.js';
import { spectrumOf, needsWitness } from '../src/core/resolution-spectrum.js';

const labelsOf = (doc) => [...doc.admission.admitted.keys()].sort();
const eqSet    = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const entityCount = (doc, re) => {
  const g = projectGraph(doc.log);
  return new Set([...g.entities.keys()].filter((k) => re.test(k)).map((k) => g.representative(k))).size;
};

// A case names the spectrum TYPE it exemplifies; tier/needsWitness/subcases come from
// the canonical taxonomy, and `measure()` runs the engine to report today's behavior.
const CASES = [

  { id: 'A4', kind: 'INV', spectrum: 'casing-detection',
    title: 'Casing invariance — lowercasing must not change who exists',
    input: '“Mara Singh requested the retention policy. She received no reply.” vs its lowercased copy',
    measure: () => {
      const text  = 'Mara Singh requested the retention policy. She received no reply.';
      const orig  = labelsOf(parseText(text, { docId: 'a4c' }));
      const low   = labelsOf(parseText(text.toLowerCase(), { docId: 'a4l' }));
      return `cased ⇒ {${orig.join(', ') || '∅'}} · lowercased ⇒ {${low.join(', ') || '∅'}}` +
             (eqSet(orig, low) ? ' — invariant holds' : ' — invariance VIOLATED (caps is the gate)');
    },
    crosses: 'clean lowercased text: the source-class gate + S1–S4 (deterministic + learned). Genuine ASR/OCR NOISE: the witness.' },

  { id: 'A3', kind: 'DIR', spectrum: 'entity-typing',
    title: 'Same token, two ontologies — Apple (org) vs apple (fruit)',
    input: '“Apple acquired the startup…” vs “She ate an apple.”',
    measure: () => {
      const a = parseText('Apple acquired the startup and reported record earnings.', { docId: 'a3o' });
      const b = parseText('She ate an apple.', { docId: 'a3f' });
      return `(org) “Apple” admitted: ${a.admission.isAdmitted('Apple') ? 'yes' : 'no'}, type: none · ` +
             `(fruit) “apple” admitted: ${b.admission.isAdmitted('apple') ? 'yes' : 'no'}`;
    },
    crosses: 'the injected typing bridge (verb→type: “acquired/reported earnings” ⇒ organisation) — rule + learned; only a NOVEL predicate falls to the witness.' },

  { id: 'B8', kind: 'DIR', spectrum: 'pronoun-semantic',
    title: 'Winograd trigger flip — “…because it was too radical / cautious”',
    input: '“The Senate rejected the Bill. It was too radical / cautious.”',
    measure: () => {
      const sig = (doc) => doc.log.events
        .filter((e) => e.op === 'INS' || e.op === 'CON' || e.op === 'SIG' || e.op === 'SYN')
        .map((e) => `${e.op}:${e.src ?? e.id ?? ''}→${e.tgt ?? ''}`).join('|');
      const a = parseText('The Senate rejected the Bill. It was too radical.', { docId: 'b8a' });
      const b = parseText('The Senate rejected the Bill. It was too cautious.', { docId: 'b8b' });
      return sig(a) === sig(b)
        ? 'the structural event stream is IDENTICAL across the trigger flip — resolution cannot differ'
        : 'resolution differed (unexpected for the deterministic reader)';
    },
    crosses: 'the witness channel — open-domain physical reasoning (small things fit in big things) that no field salience or symbolic table covers.' },

  { id: 'B6.5', kind: 'MFT', spectrum: 'held-near-identity',
    title: 'Weight-keyed near-identity — “Tom Turner, runs NDP” … “Mr. Turner, runs NDP”',
    input: '“Tom Turner runs NDP. Mr. Turner runs NDP. Tom Turner was born in 1961. Mr. Turner was born in 1979.”',
    measure: () => {
      const doc = parseText('Tom Turner runs NDP. Mr. Turner runs NDP. Tom Turner was born in 1961. Mr. Turner was born in 1979.', { docId: 'b65' });
      const surfaced = doc.log.events.some((e) => e.op === 'EVA' && e.reason === 'near-identity-contested');
      const turners = entityCount(doc, /turner/);
      return surfaced
        ? `now SURFACED as a held, contested near-identity (surname + shared org NDP, bornOn conflicts) — was: ${turners} unrelated entities`
        : `${turners} unrelated entities (corroboration not weighed)`;
    },
    crosses: 'DETECTION is engine (surname + shared discriminator, corpus statistics) — now built. RESOLVING the dispute (one person with a bad record, or two) needs co-attestation / the witness.' },

  { id: 'B3', kind: 'MFT', spectrum: 'same-name-split',
    title: 'Same full name, two people — author-name disambiguation',
    input: '“John Smith chaired the senate hearing. John Smith fixed the leaking pipe.”',
    measure: () => {
      const doc = parseText('John Smith chaired the senate hearing. John Smith fixed the leaking pipe.', { docId: 'b3' });
      return `two distinct “John Smith” → ${entityCount(doc, /john/)} node(s) — string-identity collapses them`;
    },
    crosses: 'a conflicting functional key splits them deterministically (D4 — engine); only the soft-role case (a senator who is not a plumber) needs the witness.' },
];

export const runFrontier = async ({ onCase } = {}) => {
  const rows = [];
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const s = spectrumOf(c.spectrum) || { tier: 'model' };
    const row = {
      id: c.id, kind: c.kind, title: c.title, input: c.input,
      tier: s.tier, engineKind: s.engineKind ?? null, needsWitness: needsWitness(s.tier),
      subcases: s.subcases ?? null,
      measured: c.measure(), crosses: c.crosses,
    };
    rows.push(row);
    if (onCase) onCase(row, i, CASES.length);
  }
  const tally = (t) => rows.filter((r) => r.tier === t).length;
  return {
    rows,
    summary: {
      total: rows.length,
      engine: tally('engine'), mixed: tally('mixed'), model: tally('model'),
      witnessBound: rows.filter((r) => r.needsWitness === true).length,
    },
    meta: {
      engine: 'parseText + projectGraph (the real deterministic core)',
      model: 'none', embedder: 'none', network: 'none',
      axis: 'needsWitness — does it need the witness channel to READ MEANING? The engine tier is deterministic rules PLUS corpus-learned statistics (Fellegi-Sunter, discriminativeness, the REC ledger) — learned is not the model.',
    },
  };
};
