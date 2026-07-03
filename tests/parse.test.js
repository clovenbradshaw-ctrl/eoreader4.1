import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { isChrome } from '../src/perceiver/parse/chrome.js';
import { createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { segmentSentences } from '../src/perceiver/parse/sentences.js';
import { tok } from '../src/perceiver/parse/tokenize.js';
import { headVerb } from '../src/perceiver/parse/relations.js';
import { projectGraph } from '../src/core/project.js';

test('a determiner/quantifier at the clause head is never read as the verb — fail to silence', () => {
  // The dolphin-audit junk: a clause with no admitted subject ("All these families
  // belong to Odontoceti", "Several species…") fell to the inherited-subject fill and
  // its head walk took the leading quantifier as the relation, minting "X -> Y : All",
  // "X -> Y : Several", "X -> Y : Some", "X -> Y : including" bonds on an unrelated running figure.
  // A determiner heads a NOUN PHRASE, never a predicate, so headVerb must return null
  // (no bond) rather than name the quantifier the verb.
  for (const w of ['All these families belong to Odontoceti', 'Some species use tools',
                   'Several dolphins live here', 'Various porpoises hunt', 'Each calf nurses',
                   'including the families Monodontidae and Phocoenidae'])
    assert.equal(headVerb(w), null, `"${w.slice(0, 18)}…" must yield no head verb`);
  // ...while a genuine verb-initial continuation ("…, and belong to …") still reads.
  assert.equal(headVerb('belong to the parvorder Odontoceti')?.verb, 'belong');
  assert.equal(headVerb('use their teeth for grasping')?.verb, 'use');
});

test('chrome gate holds only degenerate structure — roles are semantic', () => {
  assert.ok(isChrome('III'));           // a bare roman numeral
  assert.ok(isChrome('---'));           // a separator rule
  assert.ok(isChrome('[12]'));          // a bracketed footnote marker — a ref, not a datum
  assert.ok(!isChrome('Page 12'));      // a heading is a semantic site role, not a list match
  assert.ok(!isChrome('Alice met Bob at the cafe.'));
  assert.ok(isChrome('Page 12', true)); // ...but a mini-LLM nudge can still hold it
});

test('a bare number is content, not chrome — data is never censored at parse time', () => {
  // A forecast/results table serialized to text lands each figure on its own line. Holding
  // those as chrome censored the very data "what are the numbers?" asks for, so a digit-bearing
  // line is content now — regardless of length.
  assert.ok(!isChrome('42'));           // a bare integer (was wrongly held as chrome)
  assert.ok(!isChrome('72'));           // a two-digit figure the length<3 rule used to sweep up
  assert.ok(!isChrome('66.9'));         // a decimal
  assert.ok(!isChrome('1,471'));        // a grouped figure
  assert.ok(!isChrome('72°'));          // a temperature with a unit
  assert.ok(!isChrome('$5'));           // a price the length<3 rule used to sweep up
  // ...but the genuinely contentless stays degenerate.
  assert.ok(isChrome('ok'));            // a stray non-numeric fragment
  assert.ok(isChrome(''));              // empty
});

test('segmentSentences splits on ?.!', () => {
  const out = segmentSentences('Hello world. Is it ok? Yes!');
  assert.equal(out.length, 3);
});

test('admission by gravity: an argument-position name admits on first sighting', () => {
  // A referent earns admission by behaving like one. "Cainan begat Mahalaleel":
  // Cainan is the subject, Mahalaleel the object of a predication — both have
  // referential gravity at once, no second sighting required.
  const a = createEntityAdmission();
  const r = a.observe('Cainan begat Mahalaleel.');
  assert.equal(r.find(o => o.label === 'Cainan').status, 'admit');
  assert.equal(r.find(o => o.label === 'Mahalaleel').status, 'admit');
});

test('admission by gravity: a clause-opener (incl. archaic KJV) never becomes a figure', () => {
  // "Behold" is a conventions `starter` — stripped before admission, like "Then" or
  // "He". The old count rule admitted it on the second sighting; now it is never
  // even a candidate, however often it recurs.
  const a = createEntityAdmission();
  a.observe('Behold, a wonder appeared.');
  a.observe('Behold, another sign came.');
  assert.ok(!a.isAdmitted('Behold'), 'an archaic clause-opener is not a referent');
});

test('a capitalised sentence-opener (determiner, interjection) is not admitted as a figure', () => {
  // Every sentence opens with a capital, so a common opener in subject position
  // ("Other salesmen…", "Please arrive…", "One morning…") is a stray capital, not a
  // character. These are conventions `starter`s — stripped before admission, like
  // "Behold" — while a real name in the same window still admits.
  const a = createEntityAdmission();
  a.observe('Other salesmen travel constantly.', 0);
  a.observe('Please arrive home soon.', 1);
  a.observe('One morning Gregor Samsa woke.', 2);
  assert.ok(!a.isAdmitted('Other'),  'a determiner is not a referent');
  assert.ok(!a.isAdmitted('Please'), 'an interjection is not a referent');
  assert.ok(!a.isAdmitted('One'),    'a quantifier is not a referent');
  assert.ok(a.isAdmitted('Gregor Samsa'), 'a real name still admits');
});

test('a framing/sequencing adverb at a sentence head is not admitted as a figure', () => {
  // The audit's recurring phantoms: "Originally the show followed…", "Roughly one third…",
  // "Initially the network…", "After graduating…" — each a capitalised opener the gravity
  // floor admitted off its segment-initial subject slot, then minted a junk predicate from
  // ("Originally followed Mulder", "Roughly speculatived fiction"). They are conventions
  // `starter`s now — stripped before admission — while a real name in the same window admits.
  const a = createEntityAdmission();
  a.observe('Originally the show followed Mulder.', 0);
  a.observe('Initially the network hesitated.', 1);
  a.observe('Roughly one third of the episodes aired.', 2);
  a.observe('After graduating, Coogler returned.', 3);
  assert.ok(!a.isAdmitted('Originally'), 'a framing adverb is not a referent');
  assert.ok(!a.isAdmitted('Initially'),  'a framing adverb is not a referent');
  assert.ok(!a.isAdmitted('Roughly'),    'a hedging adverb is not a referent');
  assert.ok(!a.isAdmitted('After'),      'a subordinator is not a referent');
});

test('a name never ends in a bare article: a welded heading fragment collapses, a real place name survives', () => {
  // Sentence segmentation can weld a heading onto the next clause ("Characters" + "The
  // X-Files stars…"), which the capitalised scan grabs as a two-word name "Characters The"
  // — and a multi-word name admits free. Trimming the trailing article collapses it to the
  // single heading token, which earns no gravity at a segment start. A genuine multi-word
  // name whose words are real ("New York") is untouched.
  const a = createEntityAdmission();
  a.observe('Characters The X-Files stars Duchovny.', 0);
  assert.ok(!a.isAdmitted('Characters The'), 'a name does not end in a bare article');
  assert.ok(!a.isAdmitted('Characters'),     'a bare heading word at a segment start is not a referent');

  const b = createEntityAdmission();
  b.observe('New York is a city.', 0);
  b.observe('They later met in New York.', 1);
  assert.ok(b.isAdmitted('New York'), 'a real multi-word place name still admits');
});

test('parseText emits INS from the first sighting when the name has gravity', () => {
  const doc = parseText('Cainan begat Mahalaleel.', { docId: 'd1' });
  const ids = doc.log.filter(e => e.op === 'INS').map(e => e.id);
  assert.ok(ids.includes('cainan'), 'the subject is admitted and INS\'d at once');
  assert.ok(ids.includes('mahalaleel'), 'the object too — a name spoken once still anchors the proposition');
});

test('admission by gravity: a prepositional object (a recipient) admits on first sighting', () => {
  // "unto Noah" — Noah is the object of a preposition, a participant in the
  // proposition, so it has gravity at once. The word-classes (preposition, function,
  // role) are read from the conventions ledger, not held in the parser.
  const a = createEntityAdmission();
  const r = a.observe('The Lord spake unto Noah that day.');
  assert.equal(r.find(o => o.label === 'Noah').status, 'admit');
});

test('parseText emits DEF for copular sentences on admitted entities', () => {
  const doc = parseText('Alice is a baker. Alice is a baker.', { docId: 'd1' });
  const defs = doc.log.filter(e => e.op === 'DEF');
  assert.ok(defs.length >= 1);
  assert.equal(defs[0].id, 'alice');
  assert.equal(defs[0].key, 'predicate');
});

test('tok drops stopwords and short tokens', () => {
  assert.deepEqual(tok('The quick brown fox.'), ['quick', 'brown', 'fox']);
});

test('parseText keeps text and sentences alongside the log', () => {
  const doc = parseText('One. Two. Three.', { docId: 'x' });
  assert.equal(doc.sentences.length, 3);
  assert.equal(doc.text, 'One. Two. Three.');
  assert.equal(doc.docId, 'x');
});

test('multi-word proper names admit on first sighting', () => {
  const doc = parseText('Project Gutenberg is great.', { docId: 'm' });
  assert.ok(doc.admission.isAdmitted('Project Gutenberg'));
});

test('name-containment is a SYN synthesis: "Gregor" folds into "Gregor Samsa"', () => {
  const doc = parseText('Gregor Samsa woke. Gregor dressed. Gregor ate.', { docId: 's' });
  const g = projectGraph(doc.log);
  assert.equal(g.entities.size, 1, 'one referent, not two');
  assert.ok(doc.log.filter(e => e.op === 'SYN' && e.kind === 'alias').length >= 1);
});

test('a lowercase connector never trails a name ("Grete the news" → "Grete")', () => {
  const doc = parseText('He told Grete the news. Grete waited. Grete left.', { docId: 'c' });
  assert.ok(doc.admission.isAdmitted('Grete'));
  assert.ok(!doc.admission.isAdmitted('Grete the'));
});

test('coreference is a weighted field: a pronoun subject bonds with a coupling weight', () => {
  const doc = parseText(
    'Grete Vale entered. Gregor Pike arrived. Gregor stood. Gregor paused. He greeted Grete Vale.',
    { docId: 'r' });
  const con = doc.log.filter(e => e.op === 'CON' && e.via === 'greeted')[0];
  assert.ok(con, 'pronoun subject produced a bond');
  assert.equal(con.src, 'gregor-pike');           // "He" resolved by the field
  assert.ok(con.w > 0 && con.w < 1, `coupling is a weight, got ${con.w}`);
});

test('kinship apposition resolves a pronoun owner through the field ("His sister Grete")', () => {
  // kinshipEdges calls coref.resolve for a possessive owner pronoun; the
  // pipeline now provides it (the strongest prior candidate). Gregor is hottest
  // before the last line, so "His" resolves to him and the kin bond fires.
  // Before the fix `resolve` was missing and this bond dropped silently.
  const doc = parseText(
    'Grete arrived. Grete waited. Gregor Samsa woke. Gregor stood. His sister Grete left.',
    { docId: 'k' });
  const con = doc.log.filter(e => e.op === 'CON' && e.via === 'sister')[0];
  assert.ok(con, 'pronoun-owned kinship apposition produced a bond');
  assert.equal(con.src, 'gregor-samsa');
  assert.equal(con.tgt, 'grete');
});

test('relation elements carry polarity and modality — negation and hedge are not dropped', () => {
  // "couldn't understand" used to log as `-> understand : couldn't`, dropping the
  // negation. Now the real verb is recovered and the sign and mood ride the element.
  const doc = parseText(
    'Gregor Samsa could not understand the words. Gregor told Grete. Gregor Samsa did not open the door.',
    { docId: 'pm' });
  const evs = doc.log.snapshot();
  const understand = evs.find(e => e.op === 'CON' && e.via === 'understand');
  assert.ok(understand, 'the real verb is recovered, not "couldn\'t"');
  assert.equal(understand.polarity, '−', 'negation survives as polarity');
  assert.equal(understand.modality, 'epistemic', 'the modal "could" sets the modality');
  const open = evs.find(e => e.op === 'CON' && e.via === 'open');
  assert.equal(open.polarity, '−', 'do-support negation survives');
  assert.equal(open.modality, undefined, 'do-support carries no modality');
  const told = evs.find(e => e.op === 'SIG' && e.via === 'told');
  assert.equal(told.polarity, undefined, 'a plain positive bond writes no polarity field');
});

test('a preposition or indefinite pronoun in the head slot yields no relation (no surface-word junk)', () => {
  // "Gregor -> awful : something" / "Gregor -> spoke : between" — the flat extractor's
  // junk. The head slot landing on a non-verb now produces silence, not a bond.
  const doc = parseText('Gregor Samsa something awful happened. Gregor Samsa between two rooms.', { docId: 'j' });
  const vias = doc.log.snapshot().filter(e => e.op === 'CON').map(e => e.via);
  assert.ok(!vias.includes('something'), 'an indefinite pronoun is not a relation');
  assert.ok(!vias.includes('between'), 'a preposition is not a relation');
});

test('speech verbs emit SIG, other transitive verbs emit CON', () => {
  const doc = parseText('Alice told Bob. Alice told Bob. Alice told Bob now.', { docId: 'g' });
  assert.ok(doc.log.filter(e => e.op === 'SIG' && e.via === 'told').length >= 1);
});

test('Pass 0 induces the document\'s attribution verbs as REC entries', () => {
  const doc = parseText('"Run!" shouted Alice. Alice waited. "Why?" pinged Bob.', { docId: 'p' });
  const recs = doc.log.filter(e => e.op === 'REC' && e.kind === 'attribution-verb');
  const tokens = recs.map(r => r.token);
  assert.ok(tokens.includes('shouted'));
  assert.ok(tokens.includes('pinged'), 'a document-specific verb is learned, not whitelisted');
});

test('parseText exposes a modality-neutral units list', () => {
  const doc = parseText('One. Two.', { docId: 'u' });
  assert.equal(doc.modality, 'text');
  assert.deepEqual(doc.units, doc.sentences);
});

test('compound subject: "A and B verb O" emits one bond per co-subject to the same object', () => {
  // "Vera and Malik attended the meeting" — both Vera (established in line 0) and
  // Malik (line 1) bond to the shared object. Prior context is needed so both names
  // are admitted before the compound clause is parsed.
  const doc = parseText(
    'Vera founded the organization.\nMalik joined the staff.\nVera and Malik attended the meeting.',
    { docId: 'cs1' });
  const evs = doc.log.snapshot();
  const atLine2 = evs.filter(e => e.sentIdx === 2 && (e.op === 'CON' || e.op === 'SIG'));
  const hasBoth = atLine2.some(e => e.src === 'vera') && atLine2.some(e => e.src === 'malik');
  assert.ok(hasBoth, 'both co-subjects emit a bond in the compound clause');
  const targets = atLine2.map(e => e.tgt);
  assert.ok(targets.filter(t => t === targets[0]).length >= 2 || new Set(targets).size === 1,
    'both bonds share the same object');
});

test('compound subject: each co-subject gets its own bond, objects do not cross', () => {
  // "Delgado and Reyes listed the address" — the shared object produces
  // CON(delgado, ...) AND CON(reyes, ...), not a cross-subject bond.
  const doc = parseText(
    'Delgado chaired the committee.\nReyes attended the sessions.\nDelgado and Reyes listed the address.',
    { docId: 'cs2' });
  const evs = doc.log.snapshot();
  const atReveal = evs.filter(e => e.sentIdx === 2 && (e.op === 'CON' || e.op === 'SIG'));
  const srcs = atReveal.map(e => e.src);
  assert.ok(srcs.includes('delgado'), 'Delgado bonds');
  assert.ok(srcs.includes('reyes'),   'Reyes bonds');
  assert.ok(!atReveal.some(e => e.src === 'delgado' && e.tgt === 'reyes'), 'no spurious cross-bond');
  assert.ok(!atReveal.some(e => e.src === 'reyes' && e.tgt === 'delgado'), 'no spurious cross-bond (rev)');
});

test('compound subject does not fire on a single-subject clause (no regression)', () => {
  // The fix must not change single-subject behavior.
  const doc = parseText('Alice met Bob. Alice left. Alice returned.', { docId: 'cs3' });
  const meets = doc.log.snapshot().filter(e => e.op === 'CON' && e.via === 'met');
  assert.equal(meets.length, 1, 'exactly one bond for a single-subject "met" clause');
  assert.equal(meets[0].src, 'alice');
  assert.equal(meets[0].tgt, 'bob');
});
