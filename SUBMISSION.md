# Handshake v3 cross-contract milestone submission record

## Public links

- GitHub: https://github.com/Iniwura/handshake
- Frontend: https://handshake-lake.vercel.app
- Vercel project ID: prj_AvPPPLM08qbMTPYgttJF5ZB8gSYd
- Final production deployment: dpl_G5ugpJ5f1RVGL83AWrXviqv5C8Jg
- Deployment URL: https://handshake-pq1ioyctz-iniwura-akurus-projects.vercel.app
- Final frontend commit: 1d02c6e

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

INCOMPATIBLE is terminal and never activates a capability. SINGLE_USE consumption is consumer-bound and replay-protected. That sentence describes the accepted v2 baseline only. The v3 milestone now proves the typed cross-contract path in a fresh deployment; see the section below.

## Contract verification

- Direct Mode: 54 passed.
- genvm-lint check: passed.
- genvm-lint validate --json: passed.
- genvm-lint schema --json: passed.
- genvm-lint typecheck --json: passed with zero diagnostics.
- Frontend regression suite: 18 passed.
- UX regression coverage: tour dismissal/reopen semantics, lifecycle next steps, consumer guidance and explorer URL construction.
- Frontend npm run typecheck: passed.
- Frontend npm run build: passed; Vite emitted only a chunk-size warning.

The v2 frontend is committed, locally verified and deployed to the existing Vercel project. Deployment dpl_G5ugpJ5f1RVGL83AWrXviqv5C8Jg reached READY production state and is aliased at https://handshake-lake.vercel.app. Anonymous checks returned HTTP 200 for every declared public route, and the served bundle contains only the v2 Handshake contract address. The prior failed and historical deployments are not final artifacts.

Tooling limitation: the installed genvm-linter 0.11.0 validator/schema path expects legacy genlayer.py; the pinned Studio Dev SDK uses the current package layout. Validation and schema use the documented disposable GENVMROOT shim.

## Accepted v2 baseline lifecycle proof

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

POSITIONS -> SYNTHESIS -> DUAL ACCEPTANCE -> CAPABILITY ACTIVE -> CONSUMED

`/app/demo` is the primary reviewer walkthrough. It performs anonymous authoritative reads for both canonical live negotiations, shows the migration capability fields, the exact provenance, acceptance flags, fingerprints and the fail-closed incompatible branch. The negotiation detail view exposes the consumer-gated `consume_capability` action only for the exact configured consumer on Studio Dev. It retains the transaction hash through simulation, wallet, submission, consensus, decision, contract confirmation and terminal failure stages. The `/app/new` route is a four-step wizard with step-by-step validation, preserved draft values, review groups and edit-back controls. Success requires the expected authoritative state, not only a receipt.

## Submission status

The repository is public, the Studio Dev v2 contract facts are recorded, and the public v2 frontend and reviewer walkthrough are verified. No browser-wallet automation was available for a disposable frontend-originated write; the live CLI multi-wallet suite remains the production transaction proof. Portal submission was not performed automatically; manual Portal submission is the only remaining action.

## Handshake v3 milestone proof

Accepted baseline: single Handshake IC, in-contract consumer gate, accepted at 320 points. Milestone delta: second reusable Intelligent Contract, typed IC-to-IC integration, asynchronous finalized child consumption, external execution receipt, two-contract replay protection, fresh deployments, fresh live proof and /app/milestone.

| Fact | Value |
| --- | --- |
| Fresh Handshake | 0xeB16E25Ff5e5aD4E895Fd62cd9614298bD75f491 |
| Handshake deployment tx | 0x51ebaa3a9b5a46e38d5d6966c7149846637166c7c538a1b769e9826fa4394fc2 |
| Handshake source SHA | 2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7 |
| HandshakeExecutor | 0xe26A7dE75f31C0B111c5098973685DFC89875C9D |
| Executor deployment tx | 0xa9e6671c2e7ef148834550b09e71ac30454045ffb2db5879e6f7d6f8cda9ed34 |
| Executor source SHA | 73745f5f5cfe0d4993c5f6c50bbe397b58bab301df3392fce2a4e8701a974d3e |
| Compatible ID | handshake-v3-cross-contract-20261004-r1 |
| Incompatible ID | handshake-v3-incompatible-20261004-r1 |
| Capability fingerprint | ad61206e7ae2afb11f35e49687c377845ee8012833390ddb5e4ef58f7d806fb4 |
| External execution fingerprint | 59be0f7605b00ba62556676da6ae92d5482fedeb68f3091fd1bffa162012cc0d |
| Live result | 12 successful writes, 8 expected failures, 25/25 assertions |

The external executor records DOCS_MIGRATION_AUTHORIZATION only after a later Handshake view proves the finalized child consumed the SINGLE_USE capability. Wrong consumer, outsider, pre-acceptance, wrong fingerprint, incompatible and replay attempts all fail closed. The complete report is evidence/STUDIO_DEV_V3_CROSS_CONTRACT_REPORT.json; the frontend reviewer route is https://handshake-lake.vercel.app/app/milestone.

Validation limitation: the local genvm-lint validator/schema path could not load the pinned runner archive from its cache. Static lint, Direct Mode, frontend regression, source-equivalent Pyright typecheck and production build passed; integrated genvm-lint validation/schema/typecheck require the missing pinned runner archive.

## V3 production deployment

Deployment dpl_ELeuD4BHrFs372Dud9en5DWwyLuL is READY and aliased at https://handshake-lake.vercel.app. Deployment URL: https://handshake-28m0ywdho-iniwura-akurus-projects.vercel.app. Anonymous HTTP 200 checks passed for /app/milestone, the fresh v3 detail route and the existing public routes.
