import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROUTE_ALPHABET, ROUTE_EXEMPLARS, FORM_EXEMPLARS, KIND_EXEMPLARS, LENGTH_EXEMPLARS,
  REGISTER_EXEMPLARS, CLARIFY_EXEMPLARS, REVISE_EXEMPLARS, REVISE_OP_EXEMPLARS,
  buildBases, defaultBases, speechCurrents, relaxRoute, formKindOf, steerKindOf,
  lengthDemandOf, developDrive, registerDemandOf, creativeDrive,
  clarifyDemandOf, clarifyDrive, reviseDemandOf, reviseDrive, reviseOpOf,
  metaRoute, createMetaRouter, discoursePrompt, leadsOf,
} from '../src/turn/meta-route.js';
import { routeStance, isExplicitCompose } from '../src/core/conversation-fold.js';
import { proposeWebSearch, searchAnnouncement } from '../src/turn/propose.js';
import { tok } from '../src/perceiver/parse/index.js';

// The fixtures are METACOGNITION speech — the model's own plain-language read of the
// discourse — not user utterances. The whole design point: the model re-speaks the turn in
// its native vocabulary, and the measurement runs on that speech (docs/discourse-routing.md).

const composeFold = { stance: 'compose', focus: { kind: 'poem', subject: 'the sea' }, warm: [] };
const groundFold  = { stance: 'ground', focus: null, warm: [{ ref: 'doc:1', weight: 1 }] };

// ---------------------------------------------------------------------------
// The bases — crosstalk nulls hold the directions apart.

test('every route direction and form kind gets a finite crosstalk null', () => {
  const bases = defaultBases();
  for (const dir of Object.keys(ROUTE_EXEMPLARS)) {
    const b = bases.route.get(dir);
    assert.ok(b, dir + ' basis exists');
    assert.ok(Number.isFinite(b.null), dir + ' null is finite (background is not thin)');
  }
  for (const kind of Object.keys(FORM_EXEMPLARS)) {
    assert.ok(Number.isFinite(bases.form.get(kind).null), kind + ' form null is finite');
  }
});

test("crosstalk: no other direction's own exemplars clear a basis's null", () => {
  const bases = defaultBases();
  // The null is the CEILING of exactly this ensemble (the α→0 extreme-value line), so no
  // off-direction phrase may clear it — the vocabulary the directions share by chance is
  // structurally nulled, which is what holds near-degenerate bases apart.
  for (const [dir, b] of bases.route) {
    for (const [other, phrases] of Object.entries(ROUTE_EXEMPLARS)) {
      if (other === dir) continue;
      for (const p of phrases) {
        const w = speechCurrents(p, bases).weights[dir];
        assert.ok(w <= b.null, dir + ' null cleared by ' + other + ' exemplar "' + p + '" (' + w + ' > ' + b.null + ')');
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The ESSAY-KIND grain — the finer form measurement under compose/essay. Near-degenerate
// (every kind is an essay), so the guarantee is self-recovery + abstention on generic
// essay-talk, not the stricter cross-null that holds the route directions apart.

test('every essay kind gets a finite crosstalk null', () => {
  const bases = defaultBases();
  for (const k of Object.keys(KIND_EXEMPLARS)) {
    assert.ok(bases.kind && bases.kind.get(k), k + ' kind basis exists');
    assert.ok(Number.isFinite(bases.kind.get(k).null), k + ' kind null is finite');
  }
});

test('essay-kind self-recovery: a metacognition naming a kind\'s distinctive move steers to it', () => {
  // Model speech (not user speech) describing what the user wants, in the engine's own terms.
  const samples = {
    argument:   'The user wants me to argue a position and defend the claim against objections.',
    explainer:  'The user wants a clear explanation that walks through how it works step by step.',
    narrative:  'The user wants the ideas carried on a story, with scenes and people over time.',
    review:     'The user wants me to judge it against criteria and land a verdict, weighing strengths and weaknesses.',
    reflection: 'The user wants me to reflect in the first person, a personal meditation on what it means.',
  };
  for (const [kind, speech] of Object.entries(samples)) {
    assert.equal(steerKindOf(speech), kind, kind + ' speech should steer to ' + kind);
  }
});

test('essay-kind abstains on generic essay-talk (no distinctive move named)', () => {
  assert.equal(steerKindOf('the user wants an essay, a piece of structured prose in paragraphs'), '');
  assert.equal(steerKindOf(''), '');
  assert.equal(steerKindOf(null), '');
});

test('steerKindOf tolerates bases with no kind group (older buildBases) → abstain', () => {
  const legacy = { route: new Map(), form: new Map() }; // no `kind`
  assert.equal(steerKindOf('argue the claim and rebut objections', legacy), '');
});

test('metaRoute exposes steerKind only when the form settles on essay', () => {
  const essay = metaRoute('The user wants me to write a structured essay that argues a position and defends the claim in paragraphs, meeting objections.', null);
  assert.equal(essay.route, 'compose');
  assert.equal(essay.kind, 'essay');
  assert.equal(essay.steerKind, 'argument');
  // A poem is compose too, but carries no essay sub-kind.
  const poem = metaRoute('The user is asking me to put together a few stanzas about her garden, a short lyric poem in verse.', null);
  assert.equal(poem.kind, 'poem');
  assert.equal(poem.steerKind, '');
});

// ---------------------------------------------------------------------------
// The LENGTH grain — the development demand, orthogonal to the route. Replaces the
// _longformIntent keyword cliff: measured off the metacognition's own speech, not the
// user's adverbs, so "explain this in detail" no longer auto-summons an essay.

test('every length demand gets a finite crosstalk null', () => {
  const bases = defaultBases();
  for (const k of Object.keys(LENGTH_EXEMPLARS)) {
    assert.ok(bases.length && bases.length.get(k), k + ' length basis exists');
    assert.ok(Number.isFinite(bases.length.get(k).null), k + ' length null is finite');
  }
});

test('length self-recovery: developed vs brief speech reads the demand it names', () => {
  const develop = 'The user wants a long, developed treatment explored in depth across several sections.';
  const brief   = 'The user just wants a short, direct answer — a quick reply in a sentence or two.';
  assert.equal(lengthDemandOf(develop), 'develop');
  assert.equal(lengthDemandOf(brief), 'brief');
});

test('length abstains on length-neutral speech (no demand named)', () => {
  assert.equal(lengthDemandOf('The user is asking a factual question about the document.'), '');
  assert.equal(lengthDemandOf(''), '');
  assert.equal(lengthDemandOf(null), '');
});

test('lengthDemandOf tolerates bases with no length group (older buildBases) → ""', () => {
  const legacy = { route: new Map(), form: new Map(), kind: new Map() }; // no `length`
  assert.equal(lengthDemandOf('a long developed piece in many sections', legacy), '');
  assert.equal(developDrive('a long developed piece in many sections', legacy), 0);
});

// ---------------------------------------------------------------------------
// The REGISTER grain — invention vs the checked reading, orthogonal to the route.
// Replaces the composer's last regex-decided setting (the speculative word list in
// the reader's _read): measured off the metacognition's own speech, so a paraphrased
// invitation to speculate needs no trigger word — and "imagine my surprise when the
// treaty failed" no longer flips a grounded ask into free writing.

test('every register direction gets a finite crosstalk null', () => {
  const bases = defaultBases();
  for (const k of Object.keys(REGISTER_EXEMPLARS)) {
    assert.ok(bases.register && bases.register.get(k), k + ' register basis exists');
    assert.ok(Number.isFinite(bases.register.get(k).null), k + ' register null is finite');
  }
});

test('register self-recovery: creative vs grounded speech reads the demand it names', () => {
  const creative = 'The user wants me to make something up — an invented, imagined scenario written freely, not looked up.';
  const grounded = 'The user wants what the sources actually say, an answer checked against the reading and anchored to the documents.';
  assert.equal(registerDemandOf(creative), 'creative');
  assert.equal(registerDemandOf(grounded), 'grounded');
});

test('register abstains on register-neutral speech (no demand named)', () => {
  assert.equal(registerDemandOf('The user is asking when the bridge was completed.'), '');
  assert.equal(registerDemandOf(''), '');
  assert.equal(registerDemandOf(null), '');
});

test('registerDemandOf tolerates bases with no register group (older buildBases) → ""', () => {
  const legacy = { route: new Map(), form: new Map(), kind: new Map(), length: new Map() }; // no `register`
  assert.equal(registerDemandOf('make something up, invented freely', legacy), '');
  assert.equal(creativeDrive('make something up, invented freely', legacy), 0);
});

test('registerDemand rides out of metaRoute on any route', () => {
  // A GROUND turn that also asks for invention: the route settles where it settles,
  // and the register demand rides out regardless — the composer's register reads it.
  const speech = 'A question about the loaded document, but they want me to dream up a hypothetical continuation, invented from imagination rather than the sources.';
  const m = metaRoute(speech, groundFold);
  assert.equal(m.registerDemand, 'creative');
  assert.ok(m.creativeDrive > 0, 'the graded creative current is exposed regardless of the winner');
  const factual = metaRoute('A factual question about the document; report what the reading holds, checked against the sources.', groundFold);
  assert.equal(factual.registerDemand, 'grounded');
});

// ---------------------------------------------------------------------------
// The CLARIFY grain — the USER-gap, orthogonal to the route. The complement of
// `research` ("the world has to answer"): the ask is underspecified in a way only the
// user can resolve, so the turn should ASK a clarifying question instead of guessing.
// Closes the loop the metacognition opens when it says it would need to learn from the
// user but nothing ever asked.

test('every clarify direction gets a finite crosstalk null', () => {
  const bases = defaultBases();
  for (const k of Object.keys(CLARIFY_EXEMPLARS)) {
    assert.ok(bases.clarify && bases.clarify.get(k), k + ' clarify basis exists');
    assert.ok(Number.isFinite(bases.clarify.get(k).null), k + ' clarify null is finite');
  }
});

test('clarify self-recovery: ambiguous vs actionable speech reads the demand it names', () => {
  const ambiguous  = 'The request is ambiguous — only the user can say which of the two they mean; I would have to ask them to clarify what they intend.';
  const actionable = 'The request is clear and specific; I already know what they want and can act on it as it stands.';
  assert.equal(clarifyDemandOf(ambiguous), 'clarify');
  assert.equal(clarifyDemandOf(actionable), 'actionable');
});

test('clarify abstains on clarify-neutral speech (no ambiguity named)', () => {
  assert.equal(clarifyDemandOf('The user is asking a factual question about the loaded document.'), '');
  assert.equal(clarifyDemandOf(''), '');
  assert.equal(clarifyDemandOf(null), '');
});

test('clarifyDemandOf tolerates bases with no clarify group (older buildBases) → ""', () => {
  const legacy = { route: new Map(), form: new Map(), kind: new Map(), length: new Map(), register: new Map() }; // no `clarify`
  assert.equal(clarifyDemandOf('which one do they mean — ambiguous, I would have to ask them', legacy), '');
  assert.equal(clarifyDrive('which one do they mean — ambiguous, I would have to ask them', legacy), 0);
});

test('clarifyDrive is a graded current, exposed on any route', () => {
  // A GROUND turn (a document question) that is ALSO underspecified: the route settles ground,
  // and the clarify demand rides out regardless — the ask-the-user fork reads it.
  const speech = 'A question about the loaded document, but it is ambiguous which chapter they mean; only the user can say, so I would have to ask them to clarify.';
  const m = metaRoute(speech, groundFold);
  assert.equal(m.route, 'ground');
  assert.equal(m.clarifyDemand, 'clarify', 'the clarify demand rides out on a ground route');
  assert.ok(m.clarifyDrive > 0, 'the graded clarify current is exposed regardless of the winner');
  // A clear ground turn carries no clarify demand — a definite ask is never questioned back.
  const clear = metaRoute('A factual question about the document; the intent is plain and I can answer it directly.', groundFold);
  assert.equal(clear.route, 'ground');
  assert.notEqual(clear.clarifyDemand, 'clarify');
  assert.equal(clear.clarifyDrive, 0);
});

test('clarify survives dilution: a localized caveat in a content-full read is not washed out', () => {
  // The reported miss ("write me an essay about dolphins doesn't trigger questions"): the read
  // spends most of its tokens describing the subject and names the clarify need in one closing
  // clause. Measured over the WHOLE paragraph, bornSalience normalizes by the term count and the
  // caveat sinks below its (single-clause-calibrated) null → clarifyDemand was ''. Read per
  // sentence — the grain the caveat is spoken at — it clears on its own clause.
  const read = 'The user is requesting an essay about dolphins, which implies they want a written '
    + 'piece covering various aspects such as behavior, habitat, social structures and conservation '
    + 'status. However, I would need to clarify what specific aspects of dolphins the user is '
    + 'interested in, as the request is quite broad.';
  assert.equal(clarifyDemandOf(read), 'clarify', 'the closing caveat is measured at the sentence grain, not diluted away');
  assert.ok(clarifyDrive(read) > 0, 'the graded clarify current survives the surrounding content');
  const m = metaRoute(read, null);
  assert.equal(m.route, 'compose', 'the read still routes compose (an essay is a make-this)');
  assert.equal(m.clarifyDemand, 'clarify', 'clarify rides out orthogonally to a compose route');
  // A well-specified compose ask, same length, is NOT questioned back — no caveat clause to clear.
  const clearCompose = 'The user wants an essay on the causes of the First World War. That is a '
    + 'clear, self-contained request about a well-defined subject, and I can write it directly '
    + 'without asking them anything.';
  assert.notEqual(clarifyDemandOf(clearCompose), 'clarify', 'a definite compose ask reads actionable, never clarify');
});

test('developDrive is a graded current, exposed on any route', () => {
  // A GROUND turn (a document question) that ALSO asks for a developed treatment: the route
  // settles ground, and the length demand rides out regardless — the longform gate reads it.
  const speech = 'A factual question about the loaded document, but the user wants it developed at length across several sections, thoroughly.';
  const m = metaRoute(speech, groundFold);
  assert.equal(m.route, 'ground');
  assert.equal(m.lengthDemand, 'develop', 'the develop demand rides out on a ground route');
  assert.ok(m.developDrive > 0, 'the graded develop current is exposed regardless of the winner');
  // A short-answer ground turn carries no develop demand.
  const brief = metaRoute('A factual question about the document; the user just wants the one fact, briefly.', groundFold);
  assert.equal(brief.route, 'ground');
  assert.notEqual(brief.lengthDemand, 'develop');
  assert.equal(brief.developDrive, 0);
});

// ---------------------------------------------------------------------------
// The measurement — model speech settles the route the regexes miss.

test('paraphrase compose: "a few stanzas" re-spoken by the model routes to compose/poem', () => {
  // The user said "could you put together a few stanzas about her" — no compose VERB+KIND
  // pair, so the regex seed misses it entirely:
  assert.equal(isExplicitCompose('could you put together a few stanzas about her'), false);
  // …but the metacognition re-speaks it, and the measurement settles:
  const speech = 'The user wants a short poem about the sister — a few playful stanzas in verse. Nothing needs to be looked up.';
  const m = metaRoute(speech, null);
  assert.equal(m.abstained, false);
  assert.equal(m.route, 'compose');
  assert.equal(m.verdict, 'COMPOSE');
  assert.equal(m.kind, 'poem');
});

test('ground: speech about answering from the loaded reading routes to ground', () => {
  const speech = 'They are asking a factual question about the document; the answer should sit in the text of the reading we loaded.';
  const m = metaRoute(speech, null);
  assert.equal(m.route, 'ground');
  assert.equal(m.verdict, 'GROUND');
});

test('research: speech naming a world-gap raises researchDrive and maps to GROUND', () => {
  const speech = 'The document cannot answer this — it is about recent news, so the answer has to be found on the web.';
  const m = metaRoute(speech, groundFold);
  assert.ok(m.researchDrive > 0, 'research current fired');
  assert.equal(m.verdict, 'GROUND', 'research maps to the GROUND verdict — reaching out is the proposer’s move');
});

test('researchDrive is exposed even when another direction wins', () => {
  // A paragraph can settle on ground AND say the reading cannot close it.
  const speech = 'A factual question about the document and the passage we loaded — but the text cannot answer it; the answer would have to be found on the web, in recent news.';
  const m = metaRoute(speech, groundFold);
  assert.ok(m.researchDrive > 0, 'the research current rides along regardless of the winner');
});

test('continuation: pure keep-going speech flows to the incumbent stance', () => {
  const speech = 'The same activity as before — keep going, the next iteration of the same ongoing work.';
  const asCompose = metaRoute(speech, composeFold);
  assert.equal(asCompose.abstained, false);
  assert.equal(asCompose.verdict, 'COMPOSE', 'continue current flows to a compose incumbent');
  const asGround = metaRoute(speech, groundFold);
  assert.equal(asGround.verdict, 'GROUND', 'the same speech flows to a ground incumbent');
});

test('continuation with NO incumbent has nothing to continue and abstains', () => {
  const speech = 'The same activity as before — keep going, more of the same.';
  const m = metaRoute(speech, null);
  assert.equal(m.abstained, true);
  assert.equal(m.verdict, 'CONTINUE');
});

test('abstention: speech that coheres toward no direction yields CONTINUE', () => {
  const speech = 'The weather in the mountains is lovely at this time of year.';
  const m = metaRoute(speech, composeFold);
  assert.equal(m.abstained, true);
  assert.equal(m.verdict, 'CONTINUE', 'abstain degrades to the baseline, never guesses');
  assert.equal(m.kind, '');
});

test('empty / null speech abstains', () => {
  assert.equal(metaRoute('', composeFold).abstained, true);
  assert.equal(metaRoute(null, null).abstained, true);
});

// ---------------------------------------------------------------------------
// The relaxation — incumbency is a resting potential, not a rule.

test('incumbent inertia: a weak off-stance pull does not flip the stance', () => {
  // Currents below the incumbent's resting potential lose the relaxation.
  const settled = relaxRoute({ currents: { compose: 0.2 }, incumbent: 'ground' });
  assert.equal(settled.route, 'ground');
});

test('a strong transition current out-competes the incumbent', () => {
  const settled = relaxRoute({ currents: { compose: 1.2 }, incumbent: 'ground' });
  assert.equal(settled.route, 'compose');
});

test('seeds inform but do not decide: a seed alone cannot wake a dead measurement', () => {
  const settled = relaxRoute({ currents: {}, incumbent: null, seed: { compose: true } });
  assert.equal(settled.abstained, true, 'no live current → abstain before any seed');
});

test('a seed tips a near-tie between live currents', () => {
  const tied = { compose: 0.6, ground: 0.6 };
  assert.equal(relaxRoute({ currents: tied, seed: { ground: true } }).route, 'ground');
  assert.equal(relaxRoute({ currents: tied, seed: { compose: true } }).route, 'compose');
});

test('the winner is always a member of the route alphabet', () => {
  const m = metaRoute('write a poem about anything', null);
  assert.ok(m.route === null || ROUTE_ALPHABET.includes(m.route));
});

// ---------------------------------------------------------------------------
// Form: the kind read off the same speech, null-gated, fallback ''.

test('form: essay-shaped speech reads essay; nothing legible reads ""', () => {
  assert.equal(formKindOf('a structured argumentative essay in prose, a thesis developed in paragraphs'), 'essay');
  assert.equal(formKindOf('the mountains are lovely'), '');
});

// ---------------------------------------------------------------------------
// The routeStance seam — the adapter plugs into opts.model UNCHANGED.

test('createMetaRouter overrides the baseline through the existing opts.model seam', () => {
  const speech = 'They want a short poem made — verse, a few stanzas.';
  const router = createMetaRouter({ speech, fold: groundFold });
  assert.equal(router.warm, true);
  const stance = routeStance('could you put together a few stanzas about her', groundFold, { model: router });
  assert.equal(stance, 'compose', 'the measured verdict overrides a ground baseline');
});

test('an abstaining metacognition leaves the baseline untouched (fallback contract)', () => {
  const router = createMetaRouter({ speech: 'lovely weather in the mountains', fold: composeFold });
  const stance = routeStance('and the meadows too', composeFold, { model: router });
  assert.equal(stance, 'compose', 'CONTINUE falls through to continuation-by-default');
});

test('a cold metacognition (no speech) is not warm and is never consulted', () => {
  const router = createMetaRouter({ speech: '' });
  assert.equal(router.warm, false);
  assert.equal(router.measure, null);
});

// ---------------------------------------------------------------------------
// The prompt — free speech, no format contract.

test('discoursePrompt carries the stance and message but demands NO format', () => {
  const p = discoursePrompt('now one about the city', composeFold, { exchange: 'user: write me a poem\nassistant: (a poem)' });
  assert.ok(p.includes('composing a poem'), 'the carried stance is described');
  assert.ok(p.includes('now one about the city'));
  assert.ok(!/exactly one word|json|answer with|respond with|format|label/i.test(p),
    'no format contract — the speech is measured, not parsed');
});

test('discoursePrompt names the loaded reading so a book-scoped first turn is not "isolated"', () => {
  const label = '“Governable Spaces” · 13197 propositions read';
  const p = discoursePrompt('summarize this book', null, { scope: label });
  assert.ok(p.includes('Right now: reading ' + label), 'the loaded reading replaces the isolated-chat stance');
  assert.ok(!p.includes('an isolated assistant chat'), 'a scoped chat is never reported as isolated');
  assert.ok(/not unspecified/.test(p) && /which book or document/.test(p), 'the read is told the document is in scope, not underspecified');
  // No scope → byte-identical to the pre-scope prompt (isolated first turn is unchanged).
  const p0 = discoursePrompt('summarize this book', null, {});
  assert.ok(p0.includes('an isolated assistant chat'), 'no scope → the isolated-chat stance still stands');
  assert.ok(!p0.includes('already loaded into this chat'), 'no scope → no in-scope line');
});

test('discoursePrompt anchors the read in time when given a now', () => {
  const now = new Date('2026-07-02T15:30:00');
  const p = discoursePrompt('what is the weather?', null, { now });
  assert.ok(/It is now .*2026/.test(p), 'a Date is formatted into the prompt');
  const ps = discoursePrompt('what is the weather?', null, { now: 'Thursday, July 2, 2026, 3:30 PM' });
  assert.ok(ps.includes('It is now Thursday, July 2, 2026, 3:30 PM.'), 'a preformatted string rides verbatim');
  const p0 = discoursePrompt('what is the weather?', null, {});
  assert.ok(!p0.includes('It is now'), 'no now → no time line, prompt unchanged');
});

// ---------------------------------------------------------------------------
// The web-proposer seam — the discourse gap joins the measured reading gaps.

const groundedCtx = (extra = {}) => ({
  route: 'grounded', task: 'answer', question: 'who won the election last week?',
  doc: { id: 'd1' }, sources: [{ ref: 's1' }], bound: [{ citation: true }], vetoes: [],
  ...extra,
});

test('propose: researchDrive > 0 raises a proposal on an otherwise-sound grounded turn', () => {
  // Without the discourse measure this ctx proposes nothing (grounded, cited, no flags):
  assert.equal(proposeWebSearch(groundedCtx()), null);
  // With it, the discourse-level gap alone is a reason:
  const p = proposeWebSearch(groundedCtx({ discourse: { researchDrive: 0.7 } }));
  assert.ok(p, 'the discourse gap proposes');
  assert.equal(p.trigger, 'gap');
  assert.ok(p.rationale.includes('asks past the reading'));
  assert.ok(searchAnnouncement(p).includes('asks past'), 'the announcement names the discourse gap');
});

test('propose: a zero researchDrive changes nothing (opt-in, byte-identical)', () => {
  assert.equal(proposeWebSearch(groundedCtx({ discourse: { researchDrive: 0 } })), null);
});

// ---------------------------------------------------------------------------
// Leads — the metacognition deposits mass; it never formulates a query.

test('leadsOf returns the novel content terms, minus the known thread and basis scaffold', () => {
  const speech = 'We would have to find out about the Grampian by-election results from Thursday.';
  const known = 'who won the election last week?';
  const leads = leadsOf(speech, { known });
  assert.ok(leads.includes('grampian'), 'the novel figure is a lead');
  assert.ok(leads.includes('by-election') || leads.includes('thursday'), 'novel specifics survive');
  assert.ok(!leads.includes('election'), 'terms already in the thread are not leads');
  for (const t of leads) assert.ok(!defaultBases().vocab.has(t), 'basis scaffold vocabulary is excluded');
});

test('leadsOf tokenizes through the one tokenizer (no drift)', () => {
  const leads = leadsOf('Zanzibar!', { known: '' });
  assert.deepEqual(leads, tok('Zanzibar!'));
});

// ---------------------------------------------------------------------------
// REVISION — the edit-in-place demand (revise ⟂ fresh), Born-measured like the
// other orthogonal demands. The router recognizes "edit the standing piece" so
// the caller can revise the document instead of researching afresh.

test('revise/fresh each get a finite crosstalk null', () => {
  const bases = defaultBases();
  for (const dir of Object.keys(REVISE_EXEMPLARS)) {
    const b = bases.revise.get(dir);
    assert.ok(b && Number.isFinite(b.null), dir + ' has a finite null');
  }
});

test('reviseDemandOf reads edit-in-place speech as revise', () => {
  const speech = 'The user wants to rework the essay we already wrote — reorganize what is there into clearer sections, not start a new piece.';
  assert.equal(reviseDemandOf(speech), 'revise');
});

test('reviseDemandOf reads a from-scratch ask as fresh', () => {
  const speech = 'They want a brand-new essay written from scratch on a different subject; there is no earlier draft to edit.';
  assert.equal(reviseDemandOf(speech), 'fresh');
});

test('reviseDrive is positive on revise speech and zero on unrelated speech', () => {
  const rev = 'They want to edit the existing draft in place, restructuring what is already written.';
  assert.ok(reviseDrive(rev) > 0);
  assert.equal(reviseDrive('The user is asking what the capital of France is.'), 0);
});

test('crosstalk: no route or clarify exemplar reads as revise', () => {
  const bases = defaultBases();
  for (const [group, exemplars] of [['route', ROUTE_EXEMPLARS], ['clarify', CLARIFY_EXEMPLARS]]) {
    for (const [dir, phrases] of Object.entries(exemplars)) {
      for (const p of phrases) {
        assert.notEqual(reviseDemandOf(p, bases), 'revise', group + '.' + dir + ' "' + p + '" must not read as revise');
      }
    }
  }
});

test('revise self-recovery: each revise exemplar reads revise, each fresh reads fresh', () => {
  for (const p of REVISE_EXEMPLARS.revise) assert.equal(reviseDemandOf(p), 'revise', p);
  for (const p of REVISE_EXEMPLARS.fresh) assert.equal(reviseDemandOf(p), 'fresh', p);
});

test('reviseOpOf picks the edit family — structural vs cut', () => {
  assert.equal(reviseOpOf('reorganize it into clearer sections with headings'), 'structural');
  assert.equal(reviseOpOf('remove the part about the football team; it wandered off topic'), 'cut');
});

test('metaRoute surfaces reviseDemand / reviseDrive / reviseOp', () => {
  const m = metaRoute('They want to restructure the essay we wrote into better sections with headings.');
  assert.equal(m.reviseDemand, 'revise');
  assert.ok(m.reviseDrive > 0);
  assert.ok(['structural', 'cut', 'add', 'tone', ''].includes(m.reviseOp));
});

test('discoursePrompt states the standing-document fact only when one is in scope', () => {
  const withDoc = discoursePrompt('do it again with better sections', null, { standing: 'Dolphins' });
  assert.ok(withDoc.includes('standing document'), 'names the standing document');
  assert.ok(withDoc.includes('Dolphins'), 'names the piece');
  const without = discoursePrompt('do it again with better sections', null, {});
  assert.ok(!without.includes('standing document'), 'omitted when no piece is in scope');
});

test('revise accessors tolerate legacy bases without a revise group', () => {
  const legacy = { route: new Map(), vocab: new Set() };
  assert.equal(reviseDemandOf('rework the draft', legacy), '');
  assert.equal(reviseDrive('rework the draft', legacy), 0);
  assert.equal(reviseOpOf('reorganize into sections', legacy), '');
});
