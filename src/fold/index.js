// The fold holon: spans → notes. The unit of evidence the model sees.

export { foldNote }        from './integral.js';
export { impressionQuery } from './impression.js';

// The reading substrate (rich-notes §2·§3): the typed open-world graph the notes
// project from, and the membrane that crosses it to the talker as plain groups.
export {
  buildSubstrate, detectTensions, substrateToEOT, substrateToJSONLD, renderLines,
} from './substrate.js';
export { projectNotes, projectGroupedNote, assertNotesNoLeak } from './project.js';
