# Handshake v2 Portal handoff

## Project

Handshake is a semantic agreement and authorization primitive for GenLayer. It makes two independent positions, their grounded semantic intersection, dual acceptance and deterministic downstream authorization legible.

- Repository: https://github.com/Iniwura/handshake
- Frontend: https://handshake-lake.vercel.app (currently historical pre-v2 bundle)
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

## Vercel status

The v2 frontend passes local typecheck/build, but publishing to the existing Vercel project returned Not authorized. The current public alias therefore must not be submitted as the v2 frontend until re-authentication produces a ready deployment. Historical ready deployment ID dpl_2UYRNAvHDCYkQNjXEuBTRhCAXciL is not a v2 final.

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
- [ ] Re-authenticate and publish the v2 frontend to the existing Vercel project.
- [ ] Submit the Portal entry manually.
