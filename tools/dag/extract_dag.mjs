#!/usr/bin/env node
// ============================================================================
// extract_dag.mjs — extract a DAG from a corpus, with two cursors (docs/dag-corpus.md).
//
//   (1) the discourse DAG — the flow of content WITHIN each document.
//   (2) the asserted DAG  — the causal graph the corpus is READ as asserting, sourced,
//       stance-typed, never upgraded, never collapsed into fact.
//
// Input is one JSON object per line (.jsonl) — the same corpus format as tools/flow
// (docs/flow-corpus.md): `text` required; `id`/`title` recommended.
//
//   node tools/dag/extract_dag.mjs corpus.jsonl
//   node tools/dag/extract_dag.mjs corpus.jsonl --json > dag.json
//   echo '{"id":"a","text":"The library reduced crime."}' | node tools/dag/extract_dag.mjs -
//
// It prints the asserted edges (with per-source stance tallies), the four complexities,
// the corpus disagreements, and Pearl's distinguishing question per disagreement. Nothing
// it prints is a fact — every edge is a reading, traced to the passage that proposed it.
// ============================================================================
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || ['--eoreader'].indexOf(args[i - 1]) < 0));
const asJson = args.includes('--json');
const here = dirname(fileURLToPath(import.meta.url));
const eoDir = resolve(String(flag('--eoreader', join(here, '..', '..'))));

const { parseText } = await import(pathToFileURL(join(eoDir, 'src', 'perceiver', 'parse', 'index.js')).href);
const DAG = await import(pathToFileURL(join(eoDir, 'src', 'dag', 'index.js')).href);

const src = positional[0] || '-';
const raw = src === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(src), 'utf8');
const rows = raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch { return { text: l }; }
});
if (!rows.length) { console.error('no documents on input'); process.exit(1); }

const docs = rows.map((r, i) => parseText(String(r.text || ''), { docId: r.id || r.title || `doc${i}`, totalRead: true }));

const corpus = DAG.corpusDag(docs);
const asserted = corpus.union;
const distinguishing = DAG.distinguishingEvidence(corpus);
const discourse = DAG.discourseDag(docs[0]);

if (asJson) {
  console.log(JSON.stringify({ asserted, corpus, distinguishing, discourse }, null, 2));
  process.exit(0);
}

const line = (s = '') => process.stdout.write(s + '\n');
line(`# DAG from ${docs.length} document(s) — a reading of claims, never facts.`);
line('');
line(`## Cursor (2) — the asserted causal DAG (${asserted.edges.length} edges, ${asserted.nodes.length} nodes)`);
line('   Each edge is what the corpus is READ as asserting; every claim traces to a passage.');
for (const e of asserted.edges) {
  const t = e.stanceTally;
  const stances = ['accidental', 'essential', 'generative'].filter((k) => t[k]).map((k) => `${k}:${t[k]}`).join(' ');
  const pol = e.polarity.null ? ` [+${e.polarity.positive}/null${e.polarity.null}]` : '';
  line(`   ${e.from} → ${e.to}   {${stances}}${e.contested ? ' CONTESTED' : ''}${pol}  by ${e.sources.join(',')}`);
  for (const c of e.claims) line(`        “${c.src.text.trim()}”  (${c.src.docId} s${c.src.sentIdx}, read-conf ${c.readerConfidence})`);
}
line('');
line('## The four complexities — surfaced and sourced, never removed');
for (const c of asserted.complexities.confounding) line(`   [confound] ${c.note}`);
for (const r of asserted.complexities.reverse) line(`   [reverse]  ${r.note}`);
for (const m of asserted.complexities.mechanism) line(`   [mechanism] ${m.note}`);
for (const k of asserted.complexities.construct) line(`   [construct] ${k.note}`);
if (!asserted.complexities.confounding.length && !asserted.complexities.reverse.length
  && !asserted.complexities.mechanism.length && !asserted.complexities.construct.length)
  line('   (none surfaced — a FLOOR: the corpus may still hide a confounder no source named.)');
line('');
line('## Disagreements + Pearl\'s distinguishing question');
if (!distinguishing.length) line('   (no structural disagreement surfaced.)');
for (const d of distinguishing) {
  line(`   ${d.edge}:`);
  for (const t of d.tests) line(`      Q: ${t.question}\n         corpus contains this evidence? ${t.corpusHas ? 'yes' : 'NO — silent'}`);
}
line('');
line(`## Cursor (1) — the discourse DAG of "${docs[0].docId}" (${discourse.nodes.length} sections)`);
line(`   The flow of content WITHIN the document — blind to the described world.`);
for (const l of discourse.links) line(`   [${l.type}] ${l.note} (s${l.sentIdx})`);
if (!discourse.links.length) line('   (spine only; no inter-proposition discourse relations read.)');
