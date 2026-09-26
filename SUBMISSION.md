# Handshake v2 submission record

## Public links

- GitHub: https://github.com/Iniwura/handshake
- Frontend: https://handshake-lake.vercel.app

## Verified contract deployment

| Fact | Value |
| --- | --- |
| Network | GenLayer Studio Devnet |
| Chain ID | 61997 |
| Contract | 0xd0cB30DCd57e2395c4CAb2451fa06Ad574241ACE |
| Deployment transaction | 0x9896fa2a9231a014c27370f20a98dab0d6d0d5f81be33ebc27da507b4e00506 |
| Contract source SHA-256 | 2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7 |
| Runner | py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng |
| On-chain schema | 11 methods / 6 views / 5 writes |

The deployment command returned accepted status with the address and transaction hash above. A later receipt lookup returned not-found from the Studio Dev endpoint, so this record does not claim a receipt body beyond the accepted deployment response.

## Architecture and state consequence

Handshake is a semantic agreement and authorization primitive. Two distinct parties submit one immutable structured position each. GenLayer produces a strict, source-grounded synthesis, and an independent validator checks semantic compatibility. The contract deterministically protects schemas, bounds, references, duplicates, HARD constraints and lifecycle transitions.

Creation also binds an immutable authorization definition: capability ID, action, resource, scope, usage mode and configured consumer. The definition is in the negotiation fingerprint. It cannot be changed by either party or by the model. Only both exact party acceptances of the persisted synthesis activate it.

Lifecycle:

OPEN -> READY -> PENDING_ACCEPTANCE -> ACTIVE -> CONSUMED

INCOMPATIBLE is terminal and never activates a capability. SINGLE_USE consumption is consumer-bound and replay-protected. The current runtime does not expose a proven typed GenLayer-to-GenLayer interface, so the downstream consequence is intentionally implemented as the deterministic in-contract consumer gate rather than an invented companion IC.

## Contract verification

- Direct Mode: 54 passed.
- genvm-lint check: passed.
- genvm-lint validate --json: passed.
- genvm-lint schema --json: passed.
- genvm-lint typecheck --json: passed with zero diagnostics.
- Frontend npm run typecheck: passed.
- Frontend npm run build: passed; Vite emitted only a chunk-size warning.

The v2 frontend is committed and locally verified, but the public Vercel alias still serves the historical pre-v2 bundle. The linked Vercel deployment attempt returned Not authorized and produced an Error deployment. Historical ready deployment ID dpl_2UYRNAvHDCYkQNjXEuBTRhCAXciL is retained only as historical evidence; no v2 deployment ID is claimed.

Tooling limitation: the installed genvm-linter 0.11.0 validator/schema path expects legacy genlayer.py; the pinned Studio Dev SDK uses the current package layout. Validation and schema use the documented disposable GENVMROOT shim.

## Fresh Studio Dev lifecycle proof

- Compatible/migration ID: handshake-v2-compatible-20260926-r1.
- Capability: docs-migration-authorization.
- Action/resource: AUTHORIZE_MIGRATION / docs-production.
- Dual acceptance reached authoritative ACTIVE.
- Active capability fingerprint: a38f327a7ba9bfde3d68528811f5e719c3840f7e2bc7f339b077c82b4ddd6900.
- Configured consumer executed the authorized single-use operation; capability became CONSUMED, and replay was rejected.
- Incompatible ID: handshake-v2-incompatible-20260926-r1.
- Incompatible synthesis fingerprint: e9cee5892914283afee43dcb5f18f97c85f574ad197f87afea3e27e88a3148c0.
- The incompatible negotiation retained an empty capability fingerprint and active: false.
- Live report: evidence/STUDIO_DEV_LIVE_TEST_REPORT.json.
- Live run: 25 writes, 15 successful, 10 expected failures, 13 assertions.

Negative live coverage includes outsider submission and acceptance, duplicate acceptance, pre-activation use, single-use replay, post-consumption mutation, duplicate position, pre-synthesis synthesis, and incompatible acceptance/consumption.

## Frontend

The frontend keeps the existing warm editorial visual identity and now makes the consequential story explicit:

POSITIONS -> SYNTHESIS -> DUAL ACCEPTANCE -> CAPABILITY ACTIVE

The negotiation detail view shows the bound capability ID, action, resource, mode, configured consumer, capability fingerprint and activation state. Incompatible negotiations show NO CAPABILITY ISSUED.

## Submission status

The repository is public and the Studio Dev v2 contract facts are recorded. The public frontend still needs Vercel re-authentication and a successful v2 publish. Portal submission was not performed automatically and is not yet the only remaining action.
