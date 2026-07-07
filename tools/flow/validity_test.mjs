#!/usr/bin/env node
// ============================================================================
// validity_test.mjs — the EXTERNAL-validity test (docs/flow-validity.md).
//
// Does a flow flag track where prose reads badly? Score held-out documents COHERENT
// vs. three controlled degradations (section-shuffle, alien-splice, sentence-scramble)
// against a register-matched prior. Badness is externally imposed, so it is a real
// criterion — not the instrument judging itself.
//
//   node tools/flow/validity_test.mjs --prior expo-prior.json --test held-out.jsonl \
//        [--baseline data/flow-prior.json] [--eoreader .]
//
// --test is one {id,title,text} per line (the same corpus format), held out from the
// prior. Result on the 36-book bootstrap: negative — see docs/flow-validity.md.
// ============================================================================
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const here = dirname(fileURLToPath(import.meta.url));
const eoDir = resolve(String(flag('--eoreader', join(here, '..', '..'))));
const F = await import(pathToFileURL(join(eoDir, 'src', 'flow', 'index.js')).href);
const { parseText } = await import(pathToFileURL(join(eoDir, 'src', 'perceiver', 'parse', 'index.js')).href);

const prior = F.loadPrior(readFileSync(String(flag('--prior', 'expo-prior.json')), 'utf8'));
const baseline = flag('--baseline', null) ? F.loadPrior(readFileSync(String(flag('--baseline')), 'utf8')) : null;
const test = readFileSync(String(flag('--test', 'held-out.jsonl')), 'utf8').trim().split('\n').map(l => JSON.parse(l));

let seed = 987654321; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const paras = t => t.split(/\n+/).map(s => s.trim()).filter(p => p.length > 60);
const flagged = s => (s.deltaPercentile >= 90 || s.residualPercentile >= 95);
const pct = x => (100 * x).toFixed(0) + '%';

const score = (text, pr) => {
  const doc = parseText(text);
  const { steps, pos } = F.trajectoryFromDoc(doc, { segment: 'sections' });
  const r = F.scoreTrajectory(pr, steps, pos);
  return { r, doc, steps, pos, nSec: r.steps.length, flowScore: r.flowScore,
    arc: r.meanArcAdherence, resid: r.meanResidual, flagRate: r.steps.filter(flagged).length / r.steps.length };
};

const rows = []; let alien = [0, 0], native = [0, 0]; let satN = 0, satD = 0, bN = 0, bD = 0;
for (let ti = 0; ti < test.length; ti++) {
  const P = paras(test[ti].text); if (P.length < 6) continue;
  const g = score(test[ti].text, prior);
  satN += g.flagRate * g.nSec; satD += g.nSec;
  if (baseline) { const gb = score(test[ti].text, baseline); bN += gb.flagRate * gb.nSec; bD += gb.nSec; }
  const sh = score(shuffle(P).join('\n'), prior);
  const sents = test[ti].text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  const scr = score(shuffle(sents).join(' '), prior);
  // alien-splice + localization
  const donor = paras(test[(ti + 1) % test.length].text).filter(p => p.length > 120);
  const aliens = [donor[2 % donor.length], donor[5 % donor.length], donor[8 % donor.length]].filter(Boolean);
  const q = [0.25, 0.5, 0.75].map(f => Math.floor(P.length * f));
  const blocks = []; for (let i = 0; i < P.length; i++) { blocks.push(P[i]); const ai = q.indexOf(i); if (ai >= 0 && aliens[ai]) blocks.push(aliens[ai]); }
  const sp = score(blocks.join('\n'), prior);
  const alienSents = aliens.flatMap(a => a.split(/(?<=[.!?])\s+/));
  const mask = sp.doc.sentences.map(s => alienSents.some(a => { const h = a.slice(0, 45); return h.length > 20 && (s.includes(h) || a.includes(s.slice(0, 45))); }));
  const { sections } = F.trajectoryFromDoc(sp.doc, { segment: 'sections' });
  sections.forEach((sec, i) => { let al = 0, tot = 0; for (let s = sec.lo; s <= sec.hi; s++) { tot++; if (mask[s]) al++; }
    const bin = (tot > 0 && al / tot >= 0.5) ? alien : native; bin[0] += flagged(sp.r.steps[i]) ? 1 : 0; bin[1]++; });
  rows.push({ title: test[ti].title.slice(0, 22), g, sh, scr, sp });
}

const N = rows.length;
const w = (a, b, k) => rows.filter(r => r[b][k] > r[a][k]).length;
console.log(`EXTERNAL-VALIDITY TEST · ${N} held-out documents · prior=${flag('--prior')}\n`);
if (baseline) console.log(`saturation (good, flagged beats): baseline ${pct(bN / bD)} · register-matched ${pct(satN / satD)}\n`);
console.log('degraded scored WORSE than good (chance = N/2):');
console.log(`  section-shuffle   : arc ${w('g','sh','arc')}/${N} · resid ${w('g','sh','resid')}/${N} · flow ${w('g','sh','flowScore')}/${N}`);
console.log(`  sentence-scramble : arc ${w('g','scr','arc')}/${N} · resid ${w('g','scr','resid')}/${N} · flow ${w('g','scr','flowScore')}/${N}`);
console.log(`  alien-splice      : arc ${w('g','sp','arc')}/${N} · resid ${w('g','sp','resid')}/${N} · flow ${w('g','sp','flowScore')}/${N}`);
console.log(`\nlocalization: P(flag|alien section) ${pct(alien[0] / Math.max(1, alien[1]))} (${alien[0]}/${alien[1]}) vs P(flag|native) ${pct(native[0] / Math.max(1, native[1]))} (${native[0]}/${native[1]})`);
