// The fold holon: spans → notes. The unit of evidence the model sees.

export { foldNote }        from './integral.js';
export { impressionQuery } from './impression.js';

// The reading substrate (rich-notes §2·§3): the typed open-world graph the notes
// project from, and the membrane that crosses it to the talker as plain groups.
export {
  buildSubstrate, detectTensions, substrateToEOT, substrateToJSONLD, renderLines, readReflections,
} from './substrate.js';
export { projectNotes, projectGroupedNote, assertNotesNoLeak } from './project.js';

// Deep reading (fold/deep-reading.js): when the model is not otherwise busy, surf to the place
// of most interest, fold it, and deposit a reflection on the graph — an enacted EVA at band
// void, reafferent (canWitness false — the firewall). The pure engine + the governed idle loop.
export {
  deepReading, createDeepReader, buildReflection, seededRng,
  RESTING, READING, REFLECTION_ENACTMENT,
} from './deep-reading.js';
// The significance-reflection prompt (the model voice for `reflect`): first-person,
// surprise-oriented, plus the output discipline a small model needs (reflect-prompt.js).
export {
  SIGNIFICANCE_REFLECT_SYSTEM, significanceReflectMessages, reflectionInput, REFLECT_DECODE, cleanReflection,
} from './reflect-prompt.js';
