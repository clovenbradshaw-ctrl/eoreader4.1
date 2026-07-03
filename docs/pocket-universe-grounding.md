# Grounded propositions — pocket universes and the four axes

> A proposition is not a fact. "Freddie is a council member" cannot be asserted
> because it appears once: he is not that forever, and he was never that in Salt
> Lake City. Every assertion the engine makes must be grounded — on identity,
> space, time, and corroboration — before it is stated as a fact. This is the
> contract the whole reader answers to.

## Pocket universes — identity across documents

Each document is a **pocket universe**. Inside it, every span of "Frank Smith"
resolves to ONE referent that carries *that universe's* relationships — its own
internal physics. Within-document coreference (the γ-decayed referent field) is
what builds it.

Across pocket universes, "Frank Smith" in document A and "Frank Smith" in document
B are **distinct referents**. We may **assert** they are the same — a `same_as`
bridge between universes — but the assertion is **defeasible**, and the
relationships **stay in their home universe**. This is the ontological split: we
never collapse A's Frank Smith and B's Frank Smith into one node; we bridge them
and keep the provenance.

The bridge is earned by the **same physics** that resolves identity inside a
document, never by the name:

- **convergence** — the referents share discriminators (relationships that travel
  with a person: geography, employer, tenure, a co-attesting source) → promote the
  bridge.
- **conflict** — a *functional* discriminator is filled by disjoint values → fork:
  the evidence says two people.
- **open** — neither → the bridge is unestablished and held as a question.

The name is excluded as evidence — it is the thing in question and cannot be its
own proof. The **differing relationships across universes are the evidence**: the
relationships among the Frank-Smith spans in A versus the relationships among them
in B are exactly what convergence/conflict reads.

(Implementation reuses the engine's `evaluateSameAs` / discriminator machinery
— this document renames that construct, in our vocabulary, the **pocket universe**.)

## The four axes a claim is grounded on

| Axis | Contract |
|---|---|
| **Identity** | The pocket-universe referent + the defeasible `same_as` bridge above. Never a surname match. |
| **Space** | A role is bound to its **jurisdiction**. A Nashville council seat is not a Salt Lake City one; a Salt Lake City mention can never corroborate a Nashville seat; a role placed where the sources never place it is a wrong-place flag. |
| **Time** | A role is true over an **interval** — `current` vs `former`, read at the cursor that carries it — and judged **relative to now** (see the surfer, below). |
| **Corroboration** | ≥2 **meaningfully-different** supports from **different pocket universes**. A witness is a (source · text) pair; verbatim/syndicated republication collapses to one. One witness is `single-source` — a hedge and a trigger to seek a second, never a flat fact. |

## The crux — time and space gate the identity fork

Office is a *functional* discriminator, so a naïve oracle would split "council
member" from "mayor" and tear O'Connell into two people. Time and space gate it:

- a **former** office vs a **current** office (same person, same place) is
  **succession** — one referent, bridged. O'Connell [council member · former ·
  Nashville] and [mayor · current · Nashville] stay ONE person.
- two **current** exclusive offices, or the same office in **two jurisdictions**,
  is a genuine **fork** — two people. A current Nashville mayor and a current Salt
  Lake City council member named Smith are two Smiths.

So identity, space, and time are one physics, not three checks.

## The surfer

The surfer is the organ that reads and reasons over the documents. Two standing
requirements:

- **Position-aware.** The surfer always knows *where it is* — which pocket
  universe (document) and which **cursor** (sentence / span) — as it reviews.
  Every reading and every grounding is stamped with its locus, so a claim is
  checked against the source reading that *governs it*, never a bag of text pooled
  across the corpus. This is the "correct cursor", made standing.
- **Date-aware.** The surfer always knows **now** (the current date/time).
  Temporal grounding is relative to now: a 2022 source's "is the mayor" is a claim
  about 2022, re-dated against the clock, not assumed true today. A role's
  still-current-ness and a source's freshness are judged against now.

## Flag-and-tell

As with the edge veto, none of this refuses or rewrites an answer. It grounds,
scopes, and — where the claim outruns its grounding — corrects beside the answer
with its citation. The answer is the user's to read; the grounding is shown.

## Build state

- **Landed (engine, tested — `src/factcheck/propositions.js`):**
  - **Identity** — `personClusters`: the pocket universes are the composite's part
    documents; same-name referents bridge only on `evaluateSameAs` PROMOTE (earned
    convergence of discriminators), never the name; the time/space-gated office oracle
    keeps O'Connell (council member → mayor) one person and forks two same-name people
    in different jurisdictions. A claim binds to a source person by name + its *other*
    relationships (`bindClaim`), so a stale office never forks a person from himself.
  - **Space** — jurisdiction binding + wrong-place.
  - **Time** — current/former at the cursor → superseded / stale.
  - **Corroboration** — ≥2 meaningfully-different sources, syndication collapse.
  - **Time, dated** — each pocket universe carries its publication year; a current office
    whose freshest witness predates `now` by more than `STALE_YEARS` is re-dated `dated`
    (current *as of* that year, not asserted-now). The surfer's clock (`ctx.now`) drives
    it; absent a clock the axis is inert. A hedge, never fired. `admitWebSource` now carries
    a `published` date.
- **Next:**
  - **Date-aware identity fork** — feed the per-universe date into the clustering oracle so
    an old source's present-tense "is a council member" is re-dated former and bridges as
    succession instead of forking (the engine knows the date now; the oracle does not yet
    read it).
  - **Position-awareness** — carry the (source · universe-local cursor) on every citation,
    not just the composite index, so "where it is" is fully addressed.
  - **Active loop** — a `single-source` / superseded claim fetches a second, meaningfully-
    different witness, then re-verifies.
  - **Reader → engine** — route the reader through `auditPropositions`.
