# LIMNER — SVG Output Organ for eoreader4

> **Status:** Implemented (Mode A grounded pipeline; deterministic projector).
> **Scope:** Output faculty that renders graph and reading state as deterministic SVG.
> **Trigger:** `/svg [kind] [focus]` in the chat composer.
> **Code:** `src/organs/out/limner/` · **Tests:** `tests/limner.test.js`

---

## 1. Rationale

eoreader4's invariant is that every assertion traces to an archived span. A naive
"draw me an SVG" organ violates this twice: it asks a small browser model to do
blind spatial math (the regime where 1–7B models fail), and it produces
coordinates that nothing in the event log can validate — a hallucination surface
bolted onto a system built to have none.

LIMNER avoids both by never letting the model emit geometry. The model emits a
**typed view spec** whose every node and edge carries a `ref` back into the event
log; a **deterministic layout engine** computes geometry; a **template** stamps
SVG. The hard part (spatial composition) lives in code. The model's only job is
selection and labeling — an easy task that a 1.5–3B model does reliably under
constrained decoding.

This relocation is the whole design. It is why the organ can run in-browser at
small model sizes without quality collapse.

> **As built:** the model path is the documented *seam*, not yet active — no
> backend exposes grammar-constrained decoding today (`src/model/interface.js`
> has only `phrase`/`propose`). The **deterministic projector** (§5, Phase 0)
> builds the ViewSpec straight from the subgraph, where it is grounded *by
> construction*, and that is what `/svg` runs through now. The model only ever
> improves labeling; it is never required for a correct render.

---

## 2. Position in EO

LIMNER is a read-and-project faculty, not a mutation. Its internal pipeline maps
to operators as follows:

| Stage | Operator | Meaning |
|-------|----------|---------|
| Select scope from the graph | `SEG` | segment the graph into a renderable subgraph |
| Read structure of the subgraph | `SIG` | signify existing nodes/edges/regions |
| Materialize the rendered view as an artifact | `INS` | instantiate a view node in the log |
| Reader clicks/edits a rendered element | `EVA` | reader contribution, per existing span-edit model |
| Offline render during consolidation | `REC` | dreaming invokes LIMNER over the consolidated graph |

LIMNER emits exactly one new event per render (an `INS` of a view artifact). It
never writes graph content; it projects what is already there. The view INS is
tagged `kind: 'view'` and **skipped by the graph fold** (`src/core/project.js`),
so a render never appears as a figure in the document it draws. Edge `operator`
fields in the spec are *labels carried over* from the underlying CON/SYN/DEF
events — LIMNER reports them, it does not author them.

---

## 3. Architecture

```
graph snapshot ──▶ SCOPE (SEG)  ──▶ subgraph
                                       │
                                       ▼
                            SPEC SYNTHESIS (deterministic projector; model seam)
                                       │  emits ViewSpec body
                                       ▼
                            HOST STAMPS PROVENANCE (view_id, source)
                                       │
                                       ▼
                            GROUNDING CHECK (refs ⊆ subgraph)  ──▶ strip on fail
                                       │
                                       ▼
                            LAYOUT (deterministic) ──▶ geometry
                                       │
                                       ▼
                            RENDER (SVG template) ──▶ <svg>
                                       │
                                       ▼
                            EMIT INS event (content-addressed by render_hash)
```

Four properties fall out of this shape:

1. **The model never sees a coordinate.** Geometry is a property of the layout engine.
2. **Grounding is structural.** Refs are lifted from the subgraph SEG admitted; a
   ref that does not resolve is illegal (and, under a future grammar path,
   impossible to decode).
3. **Renders are reproducible.** Same spec + same layout config ⇒ byte-identical
   SVG, so the output is content-addressable and archivable (`render_hash`).
4. **The organ composes.** REC can call the same pipeline offline with no UI.

---

## 4. The ViewSpec format

The intermediate representation — the contract between the model (or projector)
and everything downstream. Built and frozen by `src/organs/out/limner/spec.js`.

```jsonc
ViewSpec {
  view_id:   string,                  // assigned by HOST, not the model
  source: {
    log_cursor:     string,           // event-log position the view is true as of
    snapshot_hash:  string            // hash of the subgraph fed to synthesis
  },
  kind: "graph" | "path" | "timeline" | "void_map",
  nodes: [
    { id, ref, label, salience, role }   // ref MUST resolve; salience 0..1
  ],
  edges: [
    { source, target, operator, weight, label }   // operator reported, not authored
  ],
  regions: [
    { id, members, label, kind }         // cluster | void | frontier
  ],
  annotations: [
    { target, text, ref }                // ref MUST resolve
  ],
  layout_hint: "force" | "layered" | "radial" | "temporal"
}
```

**Grounding lives in the `ref` fields.** Every `node.ref` / `annotation.ref`
resolves to a real entity id (or `seq:N` for a void/edge witness). `view_id` and
`source` are filled by the host (`src/organs/out/limner/index.js`), not the
model — the model cannot forge provenance.

---

## 5. Constrained decoding (the structural grounding seam)

WebLLM ships XGrammar; wllama exposes llama.cpp's GBNF engine. Both mask logits
per token to guarantee the output conforms to a grammar. `spec.js` exposes the
hook:

- **Level 1 — schema validity.** `viewSpecSchema()` compiles to a grammar so the
  model can only emit structurally valid ViewSpec.
- **Level 2 — dynamic ref binding.** `viewSpecSchema({ refEnum })` regenerates
  the schema per request so the `ref` field is an `enum` of exactly the
  event/span ids in the current subgraph. The model then *cannot decode a
  reference to a node that does not exist* — hallucinated provenance becomes
  structurally impossible.

Neither backend wires a schema hook yet, so this is the ready seam, not the live
path. Until one does, the **deterministic projector** (`synthesize.js`) builds
the ViewSpec directly from the subgraph: every ref is lifted from a real entity,
so the spec is grounded by construction and the post-hoc check (§6) always
passes.

---

## 6. Grounding / veto integration

After synthesis, before layout (`src/organs/out/limner/ground.js`):

1. **Ref resolution.** Every `ref` resolves against the subgraph. (Guaranteed by
   the projector; re-checked defensively.)
2. **Label support.** A `checkLabel(label, ref)` hook veto-checks a label against
   its span — inert for the projector (labels are the spans' own), wired for a
   future model path. Unsupported ⇒ strip the label.

Failure path: `stripUnsupported` drops the flagged labels (and any node whose ref
does not resolve), so the organ degrades to **structurally correct but sparse**,
never to **confidently wrong**.

---

## 7. Event-log integration

LIMNER emits one event per successful render (`src/organs/out/limner/emit.js`),
adapted to this log's append shape (ad-hoc fields beside `op`):

```jsonc
{
  op: "INS",
  kind: "view",                        // skipped by the graph fold — not a figure
  site: <view_target>,                 // where the view attaches (query/doc/session)
  resolution: {
    spec_hash:   <hash of ViewSpec>,
    render_hash: <hash of SVG bytes>,  // content address of the output
    kind:        <ViewSpec.kind>,
    log_cursor:  <ViewSpec.source.log_cursor>
  }
}
```

Because the render is deterministic, `render_hash` is a stable content address —
the SVG can be stored to OPFS and (optionally) mirrored to archive on the same
path NPJ media takes, with the event log holding the pointer.

---

## 8. Layout engine

Deterministic, no model involvement (`src/organs/out/limner/layout.js`). One
engine per kind:

| `kind` | engine | notes |
|--------|--------|-------|
| `graph` (force) | seeded spring/charge relaxation | seeded PRNG from node ids; fixed iteration count |
| `graph` (layered) | BFS columns | DAG-shaped subgraphs |
| `path` | serpentine polyline | a traversal drawn as a route |
| `timeline` | x = first-appearance, y = lane | the event log over reading order |
| `void_map` | radial + convex-hull frontier | determinate absence as shaped negative space |

**Determinism:** every layout is a pure function of (spec, config). No
`Date.now`/`Math.random`; randomness (where force needs it to break symmetry)
comes from a seeded PRNG; coordinates are quantized to 2 decimals so float-format
drift cannot change the bytes. This is what makes `render_hash` meaningful.

---

## 9. Rendering

SVG template, themed via CSS variables, no model involvement
(`src/organs/out/limner/render.js`). Node size ← `salience`; edge stroke ←
`weight`; `operator` ← stroke color; `region.kind` ← fill treatment (cluster hull
vs. void frontier outline). Output is a single self-contained `<svg>` string,
ready for inline display, OPFS storage, or archival. Every text node is escaped
at the source; no model string reaches markup raw.

---

## 10. Modes

**Mode A — Grounded projection (primary, implemented).** Renders internal state:
the EO graph, a traversal path, the event timeline, void maps. Fully grounded and
veto-checked.

**Mode B — Figurative illustration (out of scope).** Free-hand SVG for "illustrate
this passage." Deliberately not built: it lives outside the grounded pipeline so
figurative requests can't leak in and corrupt the grounding guarantee. `limn()`
throws on `mode !== 'grounded'`.

---

## 11. Interfaces

```js
// Public organ entry point — src/organs/out/limner/index.js
limn({
  doc,            // a doc (provides projectGraph + log); OR
  graph, log,     // a projected graph + log directly (headless / REC)
  scope,          // ScopeSelector for SEG: { cap, focus, minWeight, frame }
  kind,           // "graph" | "path" | "timeline" | "void_map"  (default "graph")
  layoutHint,     // "force" | "layered" | "radial" | "temporal"
  theme,          // CSS-var overrides
  mode,           // "grounded" (default; "figurative" throws)
  checkLabel,     // (label, ref) → boolean — the label-support hook
}) => Promise<{ svg, spec, eventId, vetoed }>;

// Internal stages (each independently testable)
selectScope(graph, scope)        // SEG
synthesizeSpec(subgraph, opts)   // SIG (deterministic; model seam)
checkGrounding(spec, subgraph)   // veto report
layout(spec, config)             // deterministic geometry
render(geometry, theme)          // SVG string
emitRender(log, spec, svg)       // INS
```

## 12. Usage

In the chat composer (`chat.html`):

```
/svg                     graph of the active document
/svg timeline            the event log over reading order
/svg void_map            carved absences as shaped negative space
/svg gregor              graph centred on the figure "gregor" and its neighbours
/svg timeline grete      a timeline focused on "grete"
```

The grounded document is the first of the selected (chip-tagged) set, falling
back to the open document.

## 13. Open questions

1. **Document-content illustration** would pull toward Mode B and the small-model
   ceiling; deliberately deferred.
2. **Storage** — mirror renders to archive (NPJ media path) or keep OPFS-only?
3. **Naming** — LIMNER (to limn: to draw, to illuminate a manuscript).
4. **SURFER coupling** — should `path` views read SURFER's live traversal trace
   directly, so navigation is watchable as it happens? (`limn` already accepts an
   `order` hook for this.)
