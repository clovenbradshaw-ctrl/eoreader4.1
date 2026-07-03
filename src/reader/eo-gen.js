// eo-gen — the generation-side seam the chat app still uses (browser).
//
// The ESSAY pipeline that used to live here is GONE (docs/deep-research-log.md):
// it asked a small model to write confident long prose it could not ground, and
// the audit showed the citations severed from the claims they were meant to
// carry. The reader's long output is now DEEP RESEARCH — the grounded projection
// over an append-only log (src/research/, loaded by the app as its own module) —
// where every claim is tethered to an exact span at a pinned address and the
// model is confined to one bind-checked phrasing call per section.
//
// What remains here is the one seam grounded answers still need in the browser:
// reflectAnswer (ground/reflect.js) — parse a settled answer BACK into EOT,
// compare each proposition with the reading's graph, judge every claim by the
// diversity of the sources that witness it. The app calls this after each
// grounded turn.

import { reflectAnswer } from '../ground/reflect.js';

if (typeof window !== 'undefined') {
  window.eoGen = { reflectAnswer, version: 6 };
  window.dispatchEvent(new Event('eogen-ready'));
}

export { reflectAnswer };
