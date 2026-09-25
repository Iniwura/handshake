# Handshake

Handshake is a contract-first semantic negotiation primitive:

PARTY A POSITION + PARTY B POSITION -> GENLAYER SYNTHESIS -> PROPOSED AGREEMENT -> DUAL ACCEPTANCE -> SEALED

The project contains the Intelligent Contract, Direct Mode suite, live Studio Dev evidence, and a small editorial frontend. It does not deploy anywhere outside Studio Dev and it does not include a frontend-side source of truth.

## Architecture

- create_negotiation commits exactly two distinct non-zero EVM addresses and a deterministic negotiation fingerprint.
- submit_position lets only the declared sender submit one bounded, canonical position. A position is an immutable list of unique terms with term_id, category, requirement, and importance (HARD or PREFERENCE).
- synthesize is available only after both positions exist. A leader synthesis and an independent validator execute in the GenLayer nondeterministic block. The deterministic validator checks schema, enums, bounds, duplicate IDs, source references, complete source coverage, hard-term protection, state binding and numeric/ownership HARD conflicts.
- The persisted synthesis is immutable and bound into its fingerprint with the negotiation and both position fingerprints.
- accept_synthesis requires a declared party and the exact persisted synthesis fingerprint. Two distinct acceptance flags are required; SEALED is terminal.
- Failed synthesis raises before lifecycle mutation, so a READY negotiation remains READY.

## Lifecycle

OPEN -> READY -> PENDING_ACCEPTANCE -> SEALED

- OPEN: zero or one position.
- READY: both positions exist and no synthesis is persisted.
- PENDING_ACCEPTANCE: a synthesis is persisted; parties may accept the exact synthesis fingerprint.
- SEALED: both distinct parties accepted; terminal.
- INCOMPATIBLE: terminal result for a persisted incompatible synthesis.

## Public methods

Writes:

- create_negotiation(negotiation_id, party_a, party_b) -> negotiation fingerprint
- submit_position(negotiation_id, terms) -> position fingerprint
- synthesize(negotiation_id) -> structured synthesis
- accept_synthesis(negotiation_id, synthesis_fingerprint) -> state

Views:

- get_negotiation(negotiation_id)
- get_position_fingerprint(negotiation_id, party)
- get_synthesis(negotiation_id)
- get_synthesis_fingerprint(negotiation_id)

## Synthesis schema

The model must return exactly four top-level keys:

JSON:
{
  "compatibility": "COMPATIBLE | PARTIAL | INCOMPATIBLE",
  "proposed_terms": [
    {
      "synthesis_id": "payment",
      "category": "payment",
      "agreement": "bounded proposed agreement",
      "source_terms": [{"party": "A", "term_id": "..."}]
    }
  ],
  "conflicts": [
    {
      "synthesis_id": "conflict-1",
      "description": "bounded conflict",
      "source_terms": [{"party": "A", "term_id": "..."}, {"party": "B", "term_id": "..."}]
    }
  ],
  "unresolved_items": []
}

Every source term must be accounted for by an explicit party and term ID. Proposed categories must be present in their source terms. All synthesis IDs are globally unique. COMPATIBLE cannot contain conflicts or unresolved items; INCOMPATIBLE must name a conflict; PARTIAL must identify a conflict or unresolved item. A synthesized item cannot invent a material obligation unsupported by the source positions.

## Fingerprints

Fingerprints are SHA-256 over canonical JSON using sorted keys, compact separators and UTF-8:

- HANDSHAKE-NEGOTIATION-V1: negotiation ID and ordered party address keys.
- HANDSHAKE-POSITION-V1: negotiation ID, party label/address and canonical sorted terms.
- HANDSHAKE-SYNTHESIS-V1: negotiation fingerprint, both position fingerprints and normalized synthesis.

## Local verification

The pinned local Direct Mode dependencies are in requirements.txt. Run:

PYTHONPATH=. .venv/bin/pytest -q
GENVMROOT=/tmp/handshake-genvmroot GENVM_VERSION=vstudio-dev .venv/bin/genvm-lint check contracts/handshake.py
GENVMROOT=/tmp/handshake-genvmroot GENVM_VERSION=vstudio-dev .venv/bin/genvm-lint validate --json contracts/handshake.py
GENVMROOT=/tmp/handshake-genvmroot GENVM_VERSION=vstudio-dev .venv/bin/genvm-lint schema --json contracts/handshake.py
PATH="$PWD/.venv/bin:$PATH" GENVM_VERSION=vstudio-dev .venv/bin/genvm-lint typecheck contracts/handshake.py --json

The full local suite has 38 tests. It covers bounds, identity, positions, synthesis schema and grounding, hard constraints, failure atomicity, immutability, acceptance and terminal-state behavior.

The installed genvm-linter 0.11.0 still imports the legacy genlayer.py path for validate/schema. The final gates passed using a disposable GENVMROOT compatibility shim that points the linter at the pinned current Studio Dev SDK and exposes that legacy import; the contract header and deployed runner hash remain unchanged.

Frontend checks:

cd frontend
npm run typecheck
npm run build

If the npm registry is unavailable, use the already-installed matching local genlayer-js dependency set only for local verification. Do not commit node_modules or dist.

## Deployment facts

- Network: GenLayer Studio Devnet, chain 61997.
- Contract: 0x5bF5F1BAE94563ecc64e41C7c28F6A4040A0CA18.
- Deployment transaction: 0xcd9f2c30e2970fd7012e17432ae7fa1f812768cbbc7ab54e40c1bfd34cfd2d9e.
- Contract source SHA-256: d9d916a276ac00b2d37420727917fe0ebc15b182d23eedc751a989cc388c231f.
- Runner dependency: py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng.

## Live evidence

evidence/STUDIO_DEV_LIVE_TEST_REPORT.json records the compatible and incompatible Studio Dev lifecycles plus negative live writes. It intentionally distinguishes transaction-backed writes from resumed authoritative state checks and never fabricates missing transaction IDs.

## Frontend

The Vite/React frontend is in frontend/. It is an editorial interface for creating negotiations, submitting positions, reading synthesis provenance and accepting exact fingerprints. The contract remains authoritative. Routes include:

- /
- /app
- /app/new
- /app/negotiations/:id
- /app/negotiations/:id/position
- /app/demo
- /compare
- /synthesis
- /contract

No frontend or deployment was made for Converge.
