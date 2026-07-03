// Smoke test: assemble the valid env, run one grounded turn, dump the surfaces the
// battery keys on — answer, citations, veto flags, the fold's significance column,
// the audit steps. If this prints a real answer with bound citations and a lit
// significance column, the harness is sound and the suites can run.
import { makeEnv, setupDoc } from './harness.mjs';
import { runTurn } from '../../src/turn/pipeline.js';
import { createAuditLog } from '../../src/audit/index.js';
import { projectGraph } from '../../src/core/index.js';

const DOC = `One morning Gregor Samsa woke from troubled dreams to find himself transformed in his bed into a monstrous vermin.
He lay on his armour-hard back and saw his many thin legs waving helplessly before his eyes.
He had been a travelling salesman, and the sample case of cloth still stood by the wall.
His sister Grete left bowls of food inside the door each day and took the empty ones away.`;

const env = await makeEnv();
const doc = setupDoc(DOC, 'gregor');
const audit = createAuditLog();

const r = await runTurn({
  question: "What is the name of Gregor's sister?",
  doc, model: env.model, embedder: env.embedder,
  geometricEmbedder: env.geometricEmbedder, classifier: env.classifier,
  centroids: env.centroids, auditLog: audit, history: [],
});

console.log('\n=== ANSWER ===\n', r.answer);
console.log('\n=== route ===', r.route);
console.log('=== sources (sentence idx) ===', r.sources);
console.log('=== flags ===', r.flags.map(f => f.id));
console.log('=== bound claims ===', (r.bound || []).map(b => ({ text: String(b.text||'').slice(0,60), cite: b.citation })));
console.log('=== edge verdicts ===', (r.verdicts || []).map(v => v.verdict));

const steps = r.turn.steps;
const fold = steps.find(s => s.name === 'fold')?.data;
console.log('\n=== fold.surf significance column ===');
console.log(JSON.stringify(fold?.surf, null, 2));

const graph = projectGraph(doc.log);
console.log('\n=== graph: entities/edges ===', graph.entities?.length ?? (graph.entities?.size), Object.keys(graph));
console.log('=== audit step names ===', steps.map(s => s.name));
