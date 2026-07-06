// progress — how far along the output is toward its skeleton, as a pure fold
// (docs/paragraph-at-a-time.md). Message 1's "how far along," under the essay
// doc's discipline: workspace-state, NEVER a percentage bar ("Progress is not a
// bar … Show the workspace, not a percentage"). A beat is COVERED when an accepted
// paragraph cites its anchor span; the rest are PENDING. The fold is pure on
// (skeleton, accepted) and re-projects identically. "3 of 5" is honest here in a
// way it is not inside the essay organ — the denominator is the user's own stated
// demand, fixed unless they change it, so it does not move mid-walk.

// progressAgainst — fold the accepted paragraphs onto the skeleton. `accepted` are
// the paragraph records the composer keeps ({ beat, sources, closes, … }).
export const progressAgainst = (skeleton = null, accepted = []) => {
  if (!skeleton) return null;
  const cited = new Set((accepted || []).flatMap(p => p.sources || []));
  const beats = skeleton.beats.map(b => Object.freeze({
    id: b.id, topic: b.topic, kind: b.kind,
    state: cited.has(b.idx) ? 'covered' : 'pending',
  }));
  const covered = beats.filter(b => b.state === 'covered').length;
  const landed = (accepted || []).some(p => p.closes);
  return Object.freeze({
    planned: skeleton.planned,
    covered,
    remaining: Math.max(0, skeleton.planned - covered),
    // The workspace, not a bar: the topics still owed, named — a visible debt.
    pending: Object.freeze(beats.filter(b => b.state === 'pending').map(b => b.topic)),
    beats: Object.freeze(beats),
    landed,
    // The honest-floor read carried from the skeleton, so a caller can say "the
    // sources cover 3 of the 5 you asked for" rather than pad to five.
    short: skeleton.short,
    shortfall: skeleton.shortfall,
    // Shape-aware "done": every planned beat covered. This is the completion the
    // emergent loop lacks — a stop against the demand, not just local saturation.
    complete: skeleton.planned > 0 && covered >= skeleton.planned,
  });
};
