// doc/events.js — EO change tracking as an append-only log.
//
// A written document is not a mutable buffer; it is a fold of edit events, the
// same way the graph is a fold of the reading log and the deep-research report
// is a fold of the research log. Every edit — an inserted line, a rewrite, a
// deletion — is a CHANGE_PROPOSE event carrying its GROUNDING CHECK against the
// Record; accepting or rejecting it is another event. Nothing is silently
// mutated, so the document's whole history (who · when · what it grounds to) is
// replayable and auditable, and an edit that "leaves the record" can never be
// kept without being marked.
//
// This mirrors ProseMirror's "changes are first-class values" and Google Docs'
// suggesting mode, but the value is an event on the log, not an editor-internal
// object — so it survives reload, export, and audit like everything else here.

export const DKIND = {
  CREATE: 'DOC_CREATE',      // a document is opened
  BLOCK:  'BLOCK_ADD',       // a committed block (seeding, or a direct edit in Editing mode)
  PROPOSE: 'CHANGE_PROPOSE', // a tracked change, awaiting review (Suggesting mode)
  ACCEPT: 'CHANGE_ACCEPT',   // a change folded into the document
  REJECT: 'CHANGE_REJECT',   // a change dropped
};

// The kinds an edit can take — the three primitive document operations.
export const CHANGE_KINDS = ['insert', 'replace', 'delete'];

const ev = (kind, rest) => ({ kind, t: rest.t ?? 0, ...rest });

export const docCreate = ({ id, title, author = 'you', t = 0 }) =>
  ev(DKIND.CREATE, { docId: id, title: title || 'Untitled document', author, t });

// A committed block. `grounding` is a grounding-check result (see doc/ground.js):
// { kind:'source', span, srcId, host } when it binds to a recorded span, or
// { kind:'void' } when it is the writer's own words, marked so.
export const blockAdd = ({ id, docId, blockId, text, grounding, author = 'you', t = 0 }) =>
  ev(DKIND.BLOCK, { id, docId, blockId, text: String(text || ''), grounding: grounding || { kind: 'void' }, author, t });

// A tracked change. `kind` ∈ insert | replace | delete.
//   insert  — a new block placed after `afterId` (or at the end when null)
//   replace — `targetId`'s text becomes `text` (`before` keeps the old text)
//   delete  — `targetId` is removed (`before` keeps its text)
// `grounding` is the raw check result from groundText(text, record): it carries
// whether the change binds to the Record, and to which span.
export const changePropose = ({ id, docId, changeId, kind, targetId = null, afterId = null, blockId = null, text = '', before = '', grounding = null, author = 'you', when = '', t = 0 }) =>
  // `op` carries the change operation (insert/replace/delete); the event's own
  // `kind` field stays CHANGE_PROPOSE (do not name the operation `kind` — it would
  // shadow the event kind and the projection would never see the proposal).
  ev(DKIND.PROPOSE, { id, docId, changeId: changeId || id, op: kind, targetId, afterId, blockId: blockId || changeId || id, text: String(text || ''), before: String(before || ''), grounding: grounding || { grounded: false }, author, when, t });

export const changeAccept = ({ id, docId, changeId, t = 0 }) =>
  ev(DKIND.ACCEPT, { id, docId, changeId, t });

export const changeReject = ({ id, docId, changeId, t = 0 }) =>
  ev(DKIND.REJECT, { id, docId, changeId, t });
