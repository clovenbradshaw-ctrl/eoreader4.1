// doc/index.js — EO change tracking: a written document as a grounded projection
// over an append-only edit log.
//
// The log (events.js) is the one fact; the document (project.js) is projectDoc(log);
// the grounding check (ground.js) is the standard every edit passes through; the
// surface (surface.js → render.js) is a Google-Docs-style page that mounts into any
// DOM element and docks in the reader. Prior art: ProseMirror's "changes are
// first-class values" and Google Docs' suggesting mode — here the value is an event
// on the log, so it survives reload, export, and audit like everything else.

export { DKIND, CHANGE_KINDS, docCreate, blockAdd, changePropose, changeAccept, changeReject } from './events.js';
export { groundText, blockGrounding, contentWords } from './ground.js';
export { projectDoc } from './project.js';
export { renderDocFragment, docStatLine, DOC_CSS } from './render.js';
export { mountDocSurface } from './surface.js';
