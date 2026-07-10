// EO: NUL·DEF(Entity,Field → Void, Clearing,Making) — model-free fold impression; a preview
// write/impression.js — the fold's impression, rendered model-free. (docs/streaming-answer.md)
//
// The talker is slow to speak — a local 3B model spends seconds on prompt-processing
// before its first token. But the SUBSTRATE has already read the passage by the time
// the model is warmed: `fold` ran the surfer over the retrieved subgraph and the plan
// resolver (write/plan.js) turned its stops into grounded cells. So there is something
// honest to show during the wait — not a spinner, but the impressionistic language of
// what is in the fold: the figures the reading settles on, the edges it draws, the
// turn it finds, what it holds open.
//
// This is the §2 plan rendered WITHOUT the model — the same cells the streaming answer
// loop would hand the talker, collapsed to surface by the substrate alone (the integral
// names, the typed edge, the frame's site). It is a PREVIEW, never the answer: the
// witness binds nothing here, no claim enters the graph. The real answer, when the
// talker finally speaks, replaces it. Same discipline as the stub renderer
// (write/spurt.js) — surface from the fold, no truth-bind — pointed at the live plan.

import { createFold } from './fold.js';
import { surfToPlan } from './plan.js';
import { frameAt } from './frame.js';
import { advanceFold } from './spurt.js';

// foldImpression — the model-free impression of the reading at this turn. Reads
// ctx.surf + ctx.doc (+ ctx.focus), builds the same plan the answer loop would, and
// renders each beat to one impressionistic phrase off the fold's integrals and the
// frame's site. Returns { phrases, text } — empty when there is no surfer path (a
// chat turn, or nothing retrieved), so the caller simply shows nothing extra.
export const foldImpression = (ctx = {}) => {
  const { doc, surf, focus = [] } = ctx;
  if (!doc || !surf || !(surf.stops || []).length) return { phrases: [], text: '' };

  const fold = createFold();
  const plan = surfToPlan(surf, doc, fold, { focus });
  if (!plan.length) return { phrases: [], text: '' };

  const phrases = [];
  for (let i = 0; i < plan.length; i++) {
    const cell = plan[i];
    const frame = frameAt(fold, surf, cell.stop, i, plan.length);  // before appear — mass reflects prior beats
    for (const h of cell.args) fold.appear(h);
    const phrase = renderImpression(cell, fold, frame, i === 0);
    if (phrase) phrases.push(phrase);
    advanceFold(fold, cell, cell.res);
  }
  return { phrases, text: phrases.join(' ') };
};

// Render one cell to an impressionistic phrase — the substrate's own gloss of the
// beat, shaped by the frame's site (write/frame.js) and the edge's band. Present
// tense, plain surface, the fold's heads — never a hashId, never an operator code.
const renderImpression = (cell, fold, frame, first) => {
  const subj = fold.headOf(cell.args[0]) || 'it';
  const obj  = cell.args[1] ? (fold.headOf(cell.args[1]) || null) : null;
  const verb = phraseVerb(cell.edge);

  if (cell.kind === 'orient' || !obj || !verb) {
    return first ? `The reading opens on ${subj}.` : `It stays with ${subj}.`;
  }
  if (cell.res === 'void') return `Whether ${subj} ${verb} ${obj} is left open.`;
  if (frame.site === 'Figure') return `The turn — ${subj} ${verb} ${obj}.`;
  if (frame.site === 'Pattern') return `It gathers: ${subj} ${verb} ${obj}.`;
  return first ? `The reading opens: ${subj} ${verb} ${obj}.` : `${subj} ${verb} ${obj}.`;
};

// The edge verb in plain surface: "not-understand" → "does not understand",
// "originated-in" → "originated in". Mirrors the plan's relLabel, read back out.
const phraseVerb = (edge) => {
  const e = String(edge || '').trim();
  if (!e) return null;
  if (e.startsWith('not-')) return `does not ${e.slice(4).replace(/-/g, ' ')}`;
  return e.replace(/-/g, ' ');
};
