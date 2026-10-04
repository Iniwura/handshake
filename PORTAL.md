# Handshake v3 cross-contract milestone / Portal handoff

## Project

Handshake is a semantic agreement and authorization primitive for GenLayer. It makes two independent positions, their grounded semantic intersection, dual acceptance and deterministic downstream authorization legible.

- Repository: https://github.com/Iniwura/handshake
- Frontend: https://handshake-lake.vercel.app (v3 milestone production alias; v2 remains available at /app/demo)
- Vercel project ID: prj_AvPPPLM08qbMTPYgttJF5ZB8gSYd
- Vercel deployment ID: dpl_G5ugpJ5f1RVGL83AWrXviqv5C8Jg
- Vercel deployment URL: https://handshake-pq1ioyctz-iniwura-akurus-projects.vercel.app
- Frontend commit: 1d02c6e
- Network: GenLayer Studio Devnet
- Chain ID: 61997
- Contract: 0xd0cB30DCd57e2395c4CAb2451fa06Ad574241ACE
- Deployment transaction: 0x9896fa2a9231a014c27370f20a98dab0d6d0d5f81be33ebc27da507b4e00506
- Contract source SHA-256: 2d10d11548d5b508c4087d7425d9aa02208e17821f8308e27fa695391bc24fe7
- Runner: py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng

## Portal narrative

1. Exactly two distinct parties declare a negotiation.
2. Each submits one bounded, immutable structured position.
3. GenLayer synthesizes a strict proposal with explicit party/term provenance.
4. Independent semantic validation and deterministic contract validation protect HARD requirements and fail closed on unsupported output.
5. Both exact parties accept the persisted synthesis fingerprint.
6. The immutable authorization definition becomes ACTIVE.
7. A configured consumer may execute it; SINGLE_USE replay becomes CONSUMED.
8. An incompatible synthesis remains INCOMPATIBLE and issues no active capability.

## Demonstrated live scenario

- Negotiation: handshake-v2-compatible-20260926-r1
- Capability: docs-migration-authorization
- Action: AUTHORIZE_MIGRATION
- Resource: docs-production
- Active capability fingerprint: a38f327a7ba9bfde3d68528811f5e719c3840f7e2bc7f339b077c82b4ddd6900
- Downstream proof: configured consumer consumed the single-use capability; replay was rejected.
- Incompatible negotiation: handshake-v2-incompatible-20260926-r1
- Incompatible result: INCOMPATIBLE, empty capability fingerprint, active: false.

## Vercel verification

The v2 frontend is deployed to the existing `handshake` project. Deployment `dpl_G5ugpJ5f1RVGL83AWrXviqv5C8Jg` is READY and aliased at https://handshake-lake.vercel.app. Anonymous HTTP checks returned 200 for `/`, `/app`, `/app/new`, `/app/demo`, `/compare`, `/synthesis`, `/contract`, both live negotiation detail routes, both position routes, and the SPA fallback. `/app/demo` is the primary reviewer walkthrough and reads the canonical compatible and incompatible Studio Dev records. The served production bundle contains the canonical v2 contract address and no historical Handshake contract address. The final UX pass makes Start a new agreement primary, adds the four-step creation wizard with step-by-step validation and review/edit flow, authoritative next-step guidance and a dismissible How It Works tour, and the frontend regression suite is 18 passed. Contract and deployment explorer links use verified official Studio Dev paths.

## Assets

- docs/portal/handshake-mark.svg: original A-intersection-B mark.
- frontend/public/og-handshake.svg: original social/share artwork.
- Visual identity: warm paper, ink, rust accent, thin rules and editorial type.
- No stock imagery or copied site assets are used.

## Manual submission checklist

- [x] Public GitHub repository URL recorded.
- [x] Public Vercel URL recorded.
- [x] Studio Dev only; no mainnet or alternate deployment is claimed.
- [x] v2 contract address, deployment transaction and source SHA recorded.
- [x] Compatible active-capability and incompatible fail-closed evidence recorded.
- [x] Public routes, production bundle markers and stale-v1 address checks verified.
- [x] Consumer-gated consume UI and transaction lifecycle states verified in source, regression tests and production bundle.
- [ ] Submit the Portal entry manually.

## v3 milestone delta

The accepted 320-point baseline remains the historical single Handshake IC and is not modified. The milestone adds a fresh Handshake deployment plus reusable HandshakeExecutor, typed IC view/emit, an explicit two-phase asynchronous protocol, an external migration authorization receipt, and two-contract replay protection.

- Fresh Handshake: 0xeB16E25Ff5e5aD4E895Fd62cd9614298bD75f491
- Executor: 0xe26A7dE75f31C0B111c5098973685DFC89875C9D
- Compatible: handshake-v3-cross-contract-20261004-r1
- Incompatible: handshake-v3-incompatible-20261004-r1
- Capability fingerprint: ad61206e7ae2afb11f35e49687c377845ee8012833390ddb5e4ef58f7d806fb4
- External execution fingerprint: 59be0f7605b00ba62556676da6ae92d5482fedeb68f3091fd1bffa162012cc0d
- Reviewer route: https://handshake-lake.vercel.app/app/milestone

See MILESTONE.md and evidence/STUDIO_DEV_V3_CROSS_CONTRACT_REPORT.json for the complete proof.

## V3 production deployment

- Deployment ID: dpl_ELeuD4BHrFs372Dud9en5DWwyLuL
- Deployment URL: https://handshake-28m0ywdho-iniwura-akurus-projects.vercel.app
- Production alias: https://handshake-lake.vercel.app
- Status: READY / production
- Anonymous HTTP 200 verified for /app/milestone, the fresh v3 detail route and the existing reviewer routes.
