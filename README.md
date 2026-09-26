# Handshake v2

Handshake is a contract-first GenLayer semantic agreement and authorization primitive:

PARTY A POSITION + PARTY B POSITION -> GENLAYER SYNTHESIS -> DUAL ACCEPTANCE -> CAPABILITY ACTIVE

It turns two bounded immutable positions into a provenance-grounded proposal, then issues a deterministic authorization only when both declared parties accept the exact persisted synthesis. An incompatible negotiation issues no active capability.

## Architecture

- create_negotiation commits exactly two distinct non-zero addresses and one immutable authorization definition: capability ID, action, resource, scope, usage mode and configured consumer.
- submit_position lets only the declared sender submit one bounded immutable position. Each term has a unique term_id, category, natural-language requirement, and importance of HARD or PREFERENCE.
- synthesize is available only after both positions exist. GenLayer runs a leader synthesis and an independent semantic validator in the nondeterministic block.
- Deterministic contract validation independently checks exact schemas, enums, bounds, duplicate IDs, source references, complete source coverage, hard-term protection, numeric/ownership HARD conflicts and lifecycle binding.
- Every synthesized item cites real source terms with explicit party and term IDs. A conflicting HARD pair cannot be returned as COMPATIBLE; the model cannot define or alter the capability.
- accept_synthesis requires a declared party and the exact persisted synthesis fingerprint. Two distinct acceptance flags are required before activation.
- consume_capability is the concrete downstream consequence. It is restricted to the configured consumer. SINGLE_USE moves to CONSUMED and rejects replay; REUSABLE remains ACTIVE.
- Failed synthesis raises before persistence, so a READY negotiation remains READY. Persisted synthesis and capability definitions are immutable.

The installed Studio Dev SDK exposes gl.evm.contract_interface for EVM ABI calls, but no proven typed GenLayer-to-GenLayer interface. Handshake therefore keeps the consequential authorization gate in one contract rather than inventing an unsupported companion IC.

## Lifecycle

OPEN -> READY -> PENDING_ACCEPTANCE -> ACTIVE -> CONSUMED

- OPEN: zero or one position exists.
- READY: both immutable positions exist and no synthesis is persisted.
- PENDING_ACCEPTANCE: a non-incompatible synthesis is persisted; both parties may accept its exact fingerprint.
- ACTIVE: both distinct parties accepted; the bound capability is actionable.
- CONSUMED: a SINGLE_USE capability was executed once; terminal.
- INCOMPATIBLE: an incompatible synthesis is persisted; terminal and never activatable.

## Public methods

Writes:

- create_negotiation(negotiation_id, party_a, party_b, capability_id, action, resource, scope, mode, consumer) -> negotiation fingerprint
- submit_position(negotiation_id, terms) -> position fingerprint
- synthesize(negotiation_id) -> strict synthesis
- accept_synthesis(negotiation_id, synthesis_fingerprint) -> state
- consume_capability(negotiation_id) -> ACTIVE or CONSUMED

Views:

- get_negotiation(negotiation_id)
- get_position_fingerprint(negotiation_id, party)
- get_synthesis(negotiation_id)
- get_synthesis_fingerprint(negotiation_id)
- get_capability(negotiation_id)
- is_capability_active(negotiation_id)

## Synthesis schema

The model must return exactly four top-level keys: compatibility, proposed_terms, conflicts and unresolved_items. Every source term is accounted for by an explicit party and term ID. Proposed categories must be present in their source terms. All synthesis IDs are globally unique. COMPATIBLE cannot contain conflicts or unresolved items; INCOMPATIBLE must name a conflict; PARTIAL must identify a conflict or unresolved item. A synthesized item cannot invent a material obligation unsupported by the source positions.

## Fingerprints

Fingerprints are SHA-256 over canonical JSON using sorted keys, compact separators and UTF-8:

- HANDSHAKE-NEGOTIATION-V2: negotiation ID, ordered party address keys and the immutable authorization definition.
- HANDSHAKE-POSITION-V2: negotiation ID, negotiation fingerprint, party label/address and canonical sorted terms.
- HANDSHAKE-SYNTHESIS-V2: negotiation fingerprint, both position fingerprints and normalized synthesis.
- HANDSHAKE-CAPABILITY-V1: negotiation identity, authorization definition, both position fingerprints, synthesis fingerprint and normalized synthesis.

## Verified v2 deployment

- Network: GenLayer Studio Devnet.
- Chain ID: 61997.
- Contract: 0xd0cB30DCd57e2395c4CAb2451fa06Ad574241ACE.
- Deployment transaction: 0x9896fa2a9231a014c27370f20a98dab0d6d0d5f81be33ebc27da507b4e00506.
- Contract source SHA-256: 2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7.
- Runner dependency: py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng.
- On-chain schema: 11 methods, 6 views, 5 writes; exact schema is emitted by genlayer schema.

The deployment receipt lookup endpoint did not return the envelope by hash after the accepted deployment response; the CLI deployment response itself recorded the accepted transaction hash and contract address. No other network was used.

## Local verification

The pinned local Direct Mode dependencies are in requirements.txt. Run:

PYTHONPATH=. /home/ini/groundshift/.venv/bin/pytest -q
GENVMROOT=/tmp/handshake-genvmroot GENVM_VERSION=vstudio-dev /home/ini/groundshift/.venv/bin/genvm-lint check contracts/handshake.py
GENVMROOT=/tmp/handshake-genvmroot GENVM_VERSION=vstudio-dev /home/ini/groundshift/.venv/bin/genvm-lint validate --json contracts/handshake.py
GENVMROOT=/tmp/handshake-genvmroot GENVM_VERSION=vstudio-dev /home/ini/groundshift/.venv/bin/genvm-lint schema --json contracts/handshake.py
PATH="/home/ini/groundshift/.venv/bin:$PATH" GENVM_VERSION=vstudio-dev /home/ini/groundshift/.venv/bin/genvm-lint typecheck contracts/handshake.py --json
cd frontend && npm run typecheck && npm run build

Current result: 54 Direct Mode tests passed; lint passed; validation passed; schema extraction passed; typecheck passed with zero diagnostics; frontend typecheck and production build passed. Vite reports only the existing large-main-chunk warning.

The installed genvm-linter 0.11.0 still imports the legacy genlayer.py path for validation/schema, while the pinned Studio Dev SDK exposes the current package layout. The final validation/schema gates use the documented disposable GENVMROOT compatibility shim. The contract header and deployed runner hash remain the pinned Studio Dev values.

## Fresh live proof

The committed report is evidence/STUDIO_DEV_LIVE_TEST_REPORT.json and was run against the v2 address.

- Compatible/migration negotiation: handshake-v2-compatible-20260926-r1.
- Capability: docs-migration-authorization.
- Action: AUTHORIZE_MIGRATION.
- Resource: docs-production.
- Both exact parties accepted the synthesis; authoritative state reached ACTIVE.
- Active capability fingerprint: a38f327a7ba9bfde3d68528811f5e719c3840f7e2bc7f339b077c82b4ddd6900.
- Configured consumer executed the single-use capability; authoritative state then became CONSUMED, and replay was rejected.
- Incompatible negotiation: handshake-v2-incompatible-20260926-r1.
- Its authoritative synthesis was INCOMPATIBLE; capability fingerprint stayed empty and active stayed false.
- The report contains 25 live write assertions: 15 successful and 10 expected failures, plus 13 authoritative assertions.

The live scenarios use two configured Studio Dev party wallets and a separate configured consumer. Private keys and wallet passwords are never stored or printed.

## Public links

- GitHub: https://github.com/Iniwura/handshake
- Frontend: https://handshake-lake.vercel.app

The frontend is an editorial reader and transaction surface; the contract remains authoritative. Routes include /, /app, /app/new, /app/negotiations/:id, /app/negotiations/:id/position, /app/demo, /compare, /synthesis, and /contract.

No Portal submission was made automatically. No deployment or file change was made for Converge.
