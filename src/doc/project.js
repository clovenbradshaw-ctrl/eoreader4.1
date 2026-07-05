// doc/project.js — the document as a fold of its edit log.
//
// projectDoc(log) replays the events into the current document: the committed
// blocks in order, the pending changes still awaiting review, and the honesty
// stats (how many blocks are grounded to the Record vs. the writer's own void).
// Pure and replay-stable — the same log always folds to the same document — so
// the document is never stored, only projected, exactly like the reader's graph
// and the deep-research report.

import { DKIND } from './events.js';
import { blockGrounding } from './ground.js';

export const projectDoc = (log) => {
  let id = null, title = 'Untitled document', author = 'you';
  const blocks = [];                 // committed blocks, in document order
  const changeMap = new Map();       // changeId → pending change
  const order = [];                  // change proposal order (stable listing)

  const indexOfBlock = (bid) => blocks.findIndex((b) => b.id === bid);

  const foldAccept = (ch) => {
    const grounding = blockGrounding(ch.grounding);
    if (ch.kind === 'insert') {
      const at = ch.afterId ? indexOfBlock(ch.afterId) + 1 : blocks.length;
      const i = at > 0 ? at : blocks.length;
      blocks.splice(i, 0, { id: ch.blockId, text: ch.text, grounding, author: ch.author });
    } else if (ch.kind === 'replace') {
      const b = blocks.find((x) => x.id === ch.targetId);
      if (b) { b.text = ch.text; b.grounding = grounding; }
    } else if (ch.kind === 'delete') {
      const i = indexOfBlock(ch.targetId);
      if (i >= 0) blocks.splice(i, 1);
    }
  };

  for (const e of log || []) {
    switch (e.kind) {
      case DKIND.CREATE:
        id = e.docId; title = e.title; author = e.author; break;
      case DKIND.BLOCK:
        blocks.push({ id: e.blockId, text: e.text, grounding: e.grounding || { kind: 'void' }, author: e.author }); break;
      case DKIND.PROPOSE:
        changeMap.set(e.changeId, {
          id: e.changeId, kind: e.op, targetId: e.targetId, afterId: e.afterId, blockId: e.blockId,
          text: e.text, before: e.before, grounding: e.grounding || { grounded: false },
          author: e.author, when: e.when, status: 'pending',
        });
        order.push(e.changeId);
        break;
      case DKIND.ACCEPT: {
        const ch = changeMap.get(e.changeId);
        if (ch) { foldAccept(ch); changeMap.delete(e.changeId); }
        break;
      }
      case DKIND.REJECT:
        changeMap.delete(e.changeId);
        break;
      default: break;
    }
  }

  const changes = order.map((cid) => changeMap.get(cid)).filter(Boolean);
  const grounded = blocks.filter((b) => b.grounding && b.grounding.kind === 'source').length;
  const stats = {
    blocks: blocks.length,
    grounded,
    void: blocks.length - grounded,
    pending: changes.length,
    // how much of the document stands on the Record (0..1)
    boundFrac: blocks.length ? grounded / blocks.length : 0,
  };
  return deepFreeze({ id, title, author, blocks, changes, stats });
};

// Freeze the projection so no consumer can mutate what a re-projection would not
// reproduce (same discipline as research/project.js).
const deepFreeze = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const k of Object.keys(x)) deepFreeze(x[k]);
  }
  return x;
};
