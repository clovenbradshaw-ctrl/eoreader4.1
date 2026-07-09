// significance-physics.mjs — does promoting the reader's INFERRED connections (the significance it
// reads, not stated in the text) actually move the physics WITHOUT touching the record?
//
//   node eoreader4-eval/significance-physics.mjs            # built-in samples
//   node eoreader4-eval/significance-physics.mjs a.txt b.md # your own documents
//
// Three things measured per document, model-free:
//   CONNECTIONS  the connections inferred off the witnessed structure — contradicts (a tension the
//                text never resolves), connects (two figures sharing a neighbour, never directly
//                related), corroborates (the same bond from two places). None is in any sentence.
//   IMPACT       the graph gains those edges (surf / retrieval / the provenance graph read them),
//                and the surf's Bayesian ATTENTION field shifts (L1) — the reading MOVES.
//   FIREWALL     the WITNESSED edge set is byte-unchanged (factsAdded 0); the connections ride as a
//                reafferent overlay (inferredAdded N), every edge canWitness false. Impact, no laundering.

import { readFile } from 'node:fs/promises';
import { weaveSignificance, readSignificance, firewallAudit } from '../src/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { projectGraph, canWitness } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const SAMPLES = [
  { name: 'affirm-and-deny', expect: 'a contradiction + a common-neighbour link, neither stated',
    text: 'Alice trusts Bob. Carol trusts Bob. Bob helped Alice. Bob did not help Alice.' },
  { name: 'convergence', expect: 'the convergent-evolution reading — three figures bound by a shared trait',
    text: 'Dolphins use echolocation. Bats use echolocation. Whales use echolocation. Dolphins live in oceans. Bats live in caves.' },
  { name: 'alliances', expect: 'latent alliances — figures linked through a common adversary',
    text: 'Carthage opposed Rome. Gaul opposed Rome. Egypt supplied Rome. Rome defeated Carthage. Rome did not defeat Egypt.' },
];

const fieldOf = (doc) => surfFold(doc, 0, {}).field.map((f) => f.bayes);
const witnessed = (g) => g.edges.filter((e) => canWitness(e.prov ?? null) !== false).length;

const loadFile = async (p) => ({ name: p.replace(/^.*\//, ''), expect: 'your document', text: await readFile(p, 'utf8') });
const docs = files.length ? await Promise.all(files.map(loadFile)) : SAMPLES;

const rows = [];
for (const s of docs) {
  const doc = parseText(s.text, { docId: s.name, genderCoref: true });
  const g0 = projectGraph(doc.log, {});
  const f0 = fieldOf(doc);
  const w = weaveSignificance(doc);
  const g1 = projectGraph(doc.log, {});
  const f1 = fieldOf(doc);
  const fw = firewallAudit(doc);
  let l1 = 0; for (let i = 0; i < f0.length; i++) l1 += Math.abs((f1[i] ?? 0) - (f0[i] ?? 0));

  console.log('\n' + '─'.repeat(74));
  console.log(`${s.name}  ·  ${s.expect}`);
  for (const c of readSignificance(doc)) console.log(`   • [${c.kind}] ${c.body}`);
  console.log(`  IMPACT    graph edges ${g0.edges.length} → ${g1.edges.length} (+${w.count})  ·  attention field L1 shift ${l1.toFixed(3)}`);
  console.log(`  FIREWALL  witnessed record ${witnessed(g0)} → ${witnessed(g1)} (facts added ${fw.factsAdded})  ·  inferred overlay ${fw.inferredAdded}  ·  intact ${fw.intact}`);
  rows.push({ name: s.name, kinds: w.kinds, added: w.count, l1: +l1.toFixed(3), factsAdded: fw.factsAdded, inferredAdded: fw.inferredAdded, intact: fw.intact });
}

console.log('\n' + '═'.repeat(74));
console.log('SUMMARY');
const cols = ['doc', 'contra', 'connect', 'corrob', 'edges+', 'field L1', 'facts+', 'infer+', 'firewall'];
const w = [18, 7, 8, 7, 7, 9, 7, 7, 8];
const fmt = (c) => c.map((x, i) => String(x).padEnd(w[i])).join(' ');
console.log(fmt(cols));
for (const r of rows) console.log(fmt([r.name.slice(0, 17), r.kinds.contradicts, r.kinds.connects, r.kinds.corroborates, r.added, r.l1, r.factsAdded, r.inferredAdded, r.intact ? 'intact' : 'BREACH']));
const anyBreach = rows.some((r) => !r.intact) || rows.some((r) => r.factsAdded !== 0);
console.log('\n' + `across ${rows.length} documents: ${anyBreach ? 'BREACHED' : 'INTACT'} — the reader added ${rows.reduce((s, r) => s + r.inferredAdded, 0)} connections to the physics and ${rows.reduce((s, r) => s + r.factsAdded, 0)} facts to any record (must be 0).`);
