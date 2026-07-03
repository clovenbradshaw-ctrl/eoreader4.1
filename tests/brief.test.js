import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { phraserBrief, realizationPrompt, talkThenVerify } from '../src/write/index.js';

// The phraser → talker hand-off: this engine determines the grounded propositions (content);
// an LLM talker only rewords them, behind a propositional veto that strips its drift.

const DOC = () => parseText('Gregor saw Grete. Gregor trusted Grete. Grete brought Gregor milk.', { docId: 's' });

test('phraserBrief emits the determined propositions and a grounded draft', () => {
  const b = phraserBrief(DOC(), { genders: { Gregor: 'm', Grete: 'f' } });
  assert.ok(b.propositions.length >= 2, 'the facts are determined, not left to the talker');
  assert.ok(b.propositions.every(p => p.subj && p.verb), 'each fact has a subject and a relation');
  assert.equal(typeof b.draft, 'string');
});

test('the prompt feeds the impression and trusts the talker — no caveat list (the veto enforces)', () => {
  const p = realizationPrompt(phraserBrief(DOC(), { genders: { Gregor: 'm', Grete: 'f' } }));
  assert.match(p.system, /impression|scene|into words|voice/i, 'feeds the scene as an impression to voice');
  assert.doesNotMatch(p.system, /MUST NOT|forbidden|do not add|will be removed/i, 'no heavy prohibition list — grounding is enforced after the fact, not by nagging the prompt');
  assert.match(p.user, /Gregor/, 'the talker is given the content to form into words');
});

test('a faithful talker passes the veto; a drifting talker has its invented proposition stripped', async () => {
  const doc = DOC();
  const brief = phraserBrief(doc, { genders: { Gregor: 'm', Grete: 'f' } });
  const faithful = { async phrase() { return 'Gregor saw Grete and trusted her.'; } };
  const drifting = { async phrase() { return 'Gregor saw Grete, trusted her, and married Klamm.'; } };
  assert.equal((await talkThenVerify(brief, faithful, { doc })).clean, true, 'rewording the facts passes');
  const d = await talkThenVerify(brief, drifting, { doc });
  assert.equal(d.clean, false, 'the invented relation is caught');
  assert.ok(d.drift.some(p => p.via === 'married' || (p.obj || '').includes('klamm')), 'the fabricated proposition is the drift');
});