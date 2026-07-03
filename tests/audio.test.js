import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestAudio } from '../src/organs/in/audio.js';
import { readingAt } from '../src/perceiver/index.js';

// The audio adapter ingests a speech model's transcript — utterances of timed words —
// and emits the same operators onto the same spine text does. These pin what the
// front-end (transcribe.html) hands over: repeated words are one referent, the reading
// line is time, the ear's unifications become SYN merges, and every unit keeps its clock.

const TRANSCRIPT = {
  name: 'meeting.m4a', duration: 6, device: 'wasm',
  utterances: [
    { start: 0, end: 2, words: [
      { text: 'Darcy', start: 0.0, end: 0.4 },
      { text: 'opened', start: 0.5, end: 0.9 },
      { text: 'the', start: 1.0, end: 1.1 },
      { text: 'meeting', start: 1.2, end: 1.8 },
    ] },
    { start: 3, end: 6, words: [
      { text: 'Darcy', start: 3.0, end: 3.4, relisten: true },
      { text: 'the', start: 3.5, end: 3.6 },
      { text: 'the', start: 3.6, end: 3.7 },   // a stutter — one referent, not two
      { text: 'budget', start: 3.8, end: 4.4 },
    ] },
  ],
  merges: [{ a: 'darcy', b: 'darcey', via: 'coref' }],
};

test('audio adapter emits onto the same spine — utterances are units, words are referents', () => {
  const doc = ingestAudio(TRANSCRIPT);
  assert.equal(doc.modality, 'audio');
  assert.equal(doc.units.length, 2);
  // Distinct forms: darcy, opened, the, meeting, budget — repeats of "Darcy"/"the" fold.
  assert.equal(doc.projectGraph().entities.size, 5);
});

test('a repeated word is one referent, accumulating mass across utterances', () => {
  const doc = ingestAudio(TRANSCRIPT);
  assert.deepEqual(doc.mentions.get('darcy'), [0, 1]);   // sighted in both utterances
});

test('every unit keeps its clock — temporal grounding an EVA event can point at', () => {
  const doc = ingestAudio(TRANSCRIPT);
  assert.deepEqual(doc.timings[0], [0, 2]);
  assert.equal(doc.utteranceAt(3.5), 1);
  assert.deepEqual(doc.wordsInWindow(3, 4).map(w => w.text), ['Darcy', 'the', 'the', 'budget']);
});

test('the reading mode runs over a transcript with no change to the spine', () => {
  const doc = ingestAudio(TRANSCRIPT);
  const r = readingAt(doc, 1);
  assert.ok(typeof r.surprise === 'number');
});

test('a flat word list is cut into utterances on a long pause', () => {
  const doc = ingestAudio({ name: 'flat', words: [
    { text: 'one', start: 0, end: 0.3 },
    { text: 'two', start: 0.4, end: 0.7 },
    { text: 'three', start: 2.0, end: 2.3 },   // >0.9s gap → new utterance
  ] });
  assert.equal(doc.units.length, 2);
});

// A transcript is a READING, not the objective truth of the waveform. The record carries
// that: every word gets DEF attributes (when, whose hearing), a merge leaves a REC learned
// rule beside its SYN, and an alternate witness's divergence raises an EVA the audit walks.
test('every word carries DEF provenance — time and witness — on the log', () => {
  const doc = ingestAudio(TRANSCRIPT);
  const evs = doc.log.events;
  const darcyDefs = evs.filter(e => e.op === 'DEF' && e.id === 'darcy');
  assert.ok(darcyDefs.some(e => e.key === 'time'), 'a time DEF grounds when it was said');
  assert.ok(darcyDefs.some(e => e.key === 'witness'), 'a witness DEF records whose hearing it is');
  assert.equal(doc.witness, 'whisper · wasm');
});

test('a merge deposits a REC learned rule beside its SYN', () => {
  const doc = ingestAudio(TRANSCRIPT);
  const evs = doc.log.events;
  assert.ok(evs.some(e => e.op === 'SYN' && e.from === 'darcy' && e.to === 'darcey'));
  assert.ok(evs.some(e => e.op === 'REC' && e.token === 'darcy' && e.expansion === 'darcey'),
    'the unification the ear committed is recorded as a learned rule');
});

test('a second witness that hears a different word raises an auditable EVA', () => {
  const doc = ingestAudio({
    ...TRANSCRIPT,
    // The relisten heard "Marcy" where the first pass heard "Darcy" at 0.0–0.4s.
    alternates: [{ label: 'relisten', words: [{ text: 'Marcy', start: 0.0, end: 0.4 }] }],
  });
  const evas = doc.log.events.filter(e => e.op === 'EVA' && e.reason === 'contested-reading');
  assert.ok(evas.length >= 1, 'the divergence is evaluated, not silently overwritten');
  assert.equal(doc.audit.witnessCount, 2);
  assert.ok(doc.audit.contestedCount >= 1);
  assert.equal(doc.contestedAt(0.2).length, 1, 'the contested moment is addressable by time');
  assert.equal(doc.contestedAt(0.2)[0].alts[0].surface, 'Marcy');
});

test('a low-confidence hearing is flagged EVA — a shaky reading, not a fact', () => {
  const doc = ingestAudio({ name: 'c', words: [{ text: 'mumble', start: 0, end: 0.4, conf: 0.2 }] });
  assert.ok(doc.log.events.some(e => e.op === 'EVA' && e.reason === 'low-confidence-reading'));
  assert.equal(doc.audit.lowConfidence, 1);
});
