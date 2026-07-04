import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestAudio } from '../src/organs/in/audio.js';
import {
  toSrt, toVtt, toText, toParagraphsJson, toSentencesJson, toWordsJson, toProcessTrace,
  buildFormat, hasTranscript, srtTime, vttTime, FORMATS,
} from '../src/reader/transcript-export.js';

// A heard clip: two breath groups, a stutter that folds to one referent, a coref merge,
// and a long pause between the utterances (a paragraph break). The same fixture shape
// organs/in/audio.js ingests — so the exporters run against a real organ doc.
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
      { text: 'the', start: 3.6, end: 3.7 },
      { text: 'budget', start: 3.8, end: 4.4 },
    ] },
  ],
  merges: [{ a: 'darcy', b: 'darcey', via: 'coref' }],
};

const doc = () => ingestAudio(TRANSCRIPT);

test('timestamp formatting is millisecond-precise and in each format’s separator', () => {
  assert.equal(srtTime(3.7), '00:00:03,700');   // SRT: comma before millis
  assert.equal(vttTime(3.7), '00:00:03.700');   // VTT: dot before millis
  assert.equal(srtTime(3661.234), '01:01:01,234');
  assert.equal(srtTime(0), '00:00:00,000');
});

test('SRT — one 1-based cue per breath group, HH:MM:SS,mmm ranges, blank-line separated', () => {
  const srt = toSrt(doc());
  const blocks = srt.trim().split('\n\n');
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /^1\n00:00:00,000 --> 00:00:02,000\nDarcy opened the meeting$/);
  assert.match(blocks[1], /^2\n00:00:03,000 --> 00:00:06,000\nDarcy the the budget$/);
});

test('VTT — WEBVTT header, dot stamps, and a valid inline timestamp before every word after the first', () => {
  const vtt = toVtt(doc());
  assert.match(vtt, /^WEBVTT\n\n/);
  // The first word carries the cue start; each later word gets its own <ts> tag.
  assert.match(vtt, /\nDarcy <00:00:00\.500>opened <00:00:01\.000>the <00:00:01\.200>meeting\n/);
  // Every inline tag is a spec-shaped WebVTT timestamp.
  for (const m of vtt.matchAll(/<(\d\d:\d\d:\d\d\.\d\d\d)>/g)) assert.match(m[1], /^\d\d:\d\d:\d\d\.\d\d\d$/);
});

test('plain text splits into paragraphs on the reading’s own long pause', () => {
  const txt = toText(doc());
  assert.equal(txt, 'Darcy opened the meeting\n\nDarcy the the budget');
});

test('word-level JSON — a stamp on every word, in time order, relisten flag kept', () => {
  const w = JSON.parse(toWordsJson(doc()));
  assert.equal(w.unit, 'word');
  assert.equal(w.words.length, 8);
  assert.deepEqual(w.words[0], { text: 'Darcy', start: 0, end: 0.4 });
  assert.equal(w.words.map(x => x.text).join(' '), 'Darcy opened the meeting Darcy the the budget');
  // the second "Darcy" was re-heard by the ear
  assert.equal(w.words[4].relisten, true);
});

test('sentence JSON carries per-utterance spans and their words', () => {
  const s = JSON.parse(toSentencesJson(doc()));
  assert.equal(s.sentences.length, 2);
  assert.deepEqual([s.sentences[0].start, s.sentences[0].end], [0, 2]);
  assert.equal(s.sentences[0].words.length, 4);
  assert.equal(s.sentences[1].text, 'Darcy the the budget');
});

test('paragraph JSON groups breath groups by the pause', () => {
  const p = JSON.parse(toParagraphsJson(doc()));
  assert.equal(p.paragraphs.length, 2);          // the 1s gap between utterances splits them
  assert.equal(p.witness, 'whisper · wasm');
});

test('full-process trace shows the pass, the SEG, the SYN, and the raw operator log', () => {
  const md = toProcessTrace(doc());
  assert.match(md, /How this transcript was read/);
  assert.match(md, /first pass/i);
  assert.match(md, /breath group/i);
  assert.match(md, /```eot/);           // the raw operator log is embedded
  assert.match(md, /INS/);              // and it carries real operators
  assert.match(md, /SYN/);              // the coref merge shows up as a SYN
  assert.match(md, /darcey/);           // the merged surface is named
  assert.match(md, /heard 2×/);         // the repeated "the"/"Darcy" folds to one referent
});

test('buildFormat returns a downloadable payload with a safe filename', () => {
  const out = buildFormat(doc(), 'srt', 'My Meeting/2026');
  assert.equal(out.ext, 'srt');
  assert.equal(out.mime, 'text/plain;charset=utf-8');
  assert.equal(out.filename, 'My_Meeting_2026.srt');
  assert.match(out.text, /00:00:00,000/);
  assert.equal(buildFormat(doc(), 'nope'), null);          // unknown id
  assert.equal(buildFormat({}, 'srt'), null);              // no transcript
});

test('every advertised FORMAT builds a non-empty string', () => {
  const d = doc();
  assert.ok(hasTranscript(d));
  for (const f of FORMATS) {
    const s = f.build(d);
    assert.equal(typeof s, 'string');
    assert.ok(s.length > 0, `${f.id} built empty`);
  }
});

test('exporters tolerate a flat-words doc (no utterances kept)', () => {
  const flat = ingestAudio({ name: 'flat', words: [
    { text: 'hello', start: 0, end: 0.5 },
    { text: 'world', start: 0.6, end: 1.0 },
  ] });
  assert.match(toSrt(flat), /hello world/);
  assert.equal(JSON.parse(toWordsJson(flat)).words.length, 2);
});
