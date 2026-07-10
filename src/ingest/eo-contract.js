// EO contracts for the ingest holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/ingest/eot-emit.js': contract({ ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'], note: 'inverse renderer: log -> EOT surface' }),
  'src/ingest/eot.js': contract({ ops: ['INS', 'SIG', 'DEF'], targets: ['Field'], products: ['Entity', 'Network'], stances: ['Making', 'Binding', 'Dissecting'], note: 'EOT ingester: surface -> tuples/log' }),
  'src/ingest/gutenberg.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'Project Gutenberg library — whole books' }),
  'src/ingest/index.js': contract({ ops: ['SIG', 'INS', 'SEG', 'NUL'], targets: ['Void', 'Field', 'Network'], products: ['Entity', 'Field', 'Network', 'Void'], stances: ['Binding', 'Making', 'Clearing'], note: 'barrel' }),
  'src/ingest/opfs-store.js': contract({ ops: ['NUL'], targets: ['Void'], products: ['Void'], stances: ['Tending'], note: 'raw web-content store (OPFS binary)' }),
  'src/ingest/read.js': contract({ ops: ['EVA', 'SYN'], targets: ['Network'], products: ['Network', 'Lens'], stances: ['Tracing', 'Composing'], note: 'read a doc into layered EoT' }),
  'src/ingest/webfetch.js': contract({ ops: ['SIG', 'SEG', 'INS'], targets: ['Void', 'Field'], products: ['Field', 'Entity'], stances: ['Binding', 'Clearing', 'Making'], note: 'live fetch/search client over CORS proxy' }),
  'src/ingest/websource.js': contract({ ops: ['SIG', 'INS'], targets: ['Void'], products: ['Entity', 'Atmosphere'], stances: ['Binding', 'Making'], note: 'admit web pages as groundable sources' }),
  'src/ingest/wikimedia.js': contract({ ops: ['SIG', 'SEG'], targets: ['Void'], products: ['Field'], stances: ['Binding', 'Dissecting'], note: 'Wikimedia reference shelf + Wikidata' }),
});
