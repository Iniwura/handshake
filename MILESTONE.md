# Handshake v3 cross-contract milestone

## Accepted baseline

The accepted Handshake project was a single Handshake Intelligent Contract: bounded immutable positions, semantic synthesis, dual exact-party acceptance, and an in-contract consume_capability gate. It was accepted at 320 points.

The v2 baseline remains deployed and unchanged:

- Contract: 0xd0cB30DCd57e2395c4CAb2451fa06Ad574241ACE
- Source SHA-256: 2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7
- Deployment transaction: 0x9896fa2a9231a014c27370f20a98dab0d6d0d5f81be33ebc27da507b4e00506
- Accepted baseline commit: 9fdd48d5fa1315fd9b3fd85abe04b90cdc72a0ea

## Milestone delta

This milestone adds the requested second reusable Intelligent Contract and proves the complete cross-contract consequence:

- contracts/executor.py adds reusable HandshakeExecutor with a typed HandshakeInterface.
- The executor reads Handshake through view() and verifies negotiation ID, capability ID, capability fingerprint, action, resource, scope, mode, consumer binding and ACTIVE state.
- prepare_execution freezes an authorization snapshot, stores PENDING_CONSUMPTION, and emits consume_capability at on="finalized".
- finalize_execution is a separate later write. It re-reads Handshake, requires the same snapshot and CONSUMED for SINGLE_USE, then stores a concrete migration authorization receipt and an immutable execution fingerprint.
- The proof includes two-contract replay protection, a wrong-consumer executor, outsider rejection, pre-dual-acceptance rejection, wrong-fingerprint rejection, pending-record immutability, Handshake replay rejection, executor replay rejection and incompatible fail-closed execution.
- The accepted v2 contract was not modified or redeployed. A fresh Handshake deployment was used because the milestone requires a new live negotiation whose immutable consumer is the new executor.

## Fresh Studio Dev deployments

Network: GenLayer Studio Dev, chain 61997, explorer https://explorer-studio-dev.genlayer.com.

| Contract | Address | Deployment transaction | Source SHA-256 |
| --- | --- | --- | --- |
| Fresh Handshake v3 | 0xeB16E25Ff5e5aD4E895Fd62cd9614298bD75f491 | 0x51ebaa3a9b5a46e38d5d6966c7149846637166c7c538a1b769e9826fa4394fc2 | 2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7 |
| HandshakeExecutor | 0xe26A7dE75f31C0B111c5098973685DFC89875C9D | 0xa9e6671c2e7ef148834550b09e71ac30454045ffb2db5879e6f7d6f8cda9ed34 | 73745f5f5cfe0d4993c5f6c50bbe397b58bab301df3392fce2a4e8701a974d3e |
| Wrong-consumer adversarial executor | 0x37Ce20770df11028054D0eDcF0fA99F3319FeA45 | 0x4ff4a25571aa80d550ce252a07a09c8e46d1759d9d351859f230453c3be24fef | 73745f5f5cfe0d4993c5f6c50bbe397b58bab301df3392fce2a4e8701a974d3e |

The accepted v2 address above is historical baseline only; the v3 frontend uses the fresh Handshake and executor addresses for /app/milestone.

## Live proof

The complete incremental report is evidence/STUDIO_DEV_V3_CROSS_CONTRACT_REPORT.json.

- Compatible negotiation: handshake-v3-cross-contract-20261004-r1
- Incompatible negotiation: handshake-v3-incompatible-20261004-r1
- Capability: docs-migration-authorization
- Action/resource/mode: AUTHORIZE_MIGRATION / docs-production / SINGLE_USE
- Capability fingerprint: ad61206e7ae2afb11f35e49687c377845ee8012833390ddb5e4ef58f7d806fb4
- External execution fingerprint: 59be0f7605b00ba62556676da6ae92d5482fedeb68f3091fd1bffa162012cc0d
- Final receipt action: DOCS_MIGRATION_AUTHORIZATION
- Final states: Handshake CONSUMED; executor EXECUTED; replay protection true
- Live result: 12 successful writes, 8 expected failures, 25/25 assertions.

The live sequence is:

ACTIVE -> PENDING_CONSUMPTION with no receipt -> finalized child consume_capability -> CONSUMED -> EXECUTED with a receipt.

The child finalized quickly during one resumed RPC window; the report retains the observed pending executor view with receipt: null. Direct Mode separately proves that finalization before child consumption is rejected.

## Verification

- Direct Mode regression and cross-contract tests: 56 passed (54 accepted tests plus 2 substantive executor tests).
- New adversarial tests cover both contracts, typed view routing, finalized child routing, pending/finalized state transitions, wrong consumer, outsider, incompatible negotiation, fingerprint mismatch and replay.
- GenLayer lint: passed for both contracts (3 checks each).
- Frontend regression suite: 18 passed.
- Source-equivalent Pyright typecheck: 0 diagnostics with the current SDK proxy diagnostics narrowly suppressed; integrated genvm-lint typecheck remains unavailable because its pinned runner archive is missing from the local cache.
- Frontend production build: passed; Vite emitted only the existing large-main-chunk warning.
- Validation/schema: the installed genvm-lint 0.11.0 static validator could not load the pinned py-genlayer archive from the local runtime cache (runners/py-genlayer/5j/...tar missing). This is recorded as an environment limitation; it is not represented as a passing validation result.

The typed interface and finalized internal-message flow follow the current GenLayer documentation:

- https://docs.genlayer.com/developers/intelligent-contracts/features/interacting-with-intelligent-contracts
- https://docs.genlayer.com/developers/intelligent-contracts/features/messages

## Frontend

The new reviewer route is https://handshake-lake.vercel.app/app/milestone. It reads the fresh v3 records directly and shows both contract addresses and deployment/source facts, capability and executor states, the full capability authorization fields, the visible ACTIVE -> PREPARED -> CONSUMED -> EXECUTED transition, the final external execution receipt and replay-protected state, and the fresh incompatible negotiation beside the compatible proof.

The accepted v2 walkthrough remains at /app/demo.


## Production deployment

- Vercel project: handshake
- Deployment ID: dpl_ELeuD4BHrFs372Dud9en5DWwyLuL
- Deployment URL: https://handshake-28m0ywdho-iniwura-akurus-projects.vercel.app
- Production alias: https://handshake-lake.vercel.app
- Status: READY / production
- Verified anonymous HTTP 200: /, /app, /app/demo, /app/milestone, the fresh v3 negotiation detail route, /compare, /synthesis and /contract.
- The served production bundle contains the fresh Handshake v3 address, executor address and compatible v3 negotiation ID. Receipt values are read from the live executor response rather than embedded fixture state.

## Remaining limitations

Studio Dev is the live proving environment, and the local linter validator/schema cache lacks the pinned runner archive needed for those two static commands. Frontend write actions still require an injected wallet on Studio Dev; the milestone proof itself was executed through the configured CLI wallets and is preserved in the JSON report.
