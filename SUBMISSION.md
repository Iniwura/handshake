# Handshake submission record

## Verified deployment

| Fact | Value |
| --- | --- |
| Network | GenLayer Studio Devnet |
| Chain ID | 61997 |
| Contract | 0x5bF5F1BAE94563ecc64e41C7c28F6A4040A0CA18 |
| Deployment transaction | 0xcd9f2c30e2970fd7012e17432ae7fa1f812768cbbc7ab54e40c1bfd34cfd2d9e |
| Contract source SHA-256 | d9d916a276ac00b2d37420727917fe0ebc15b182d23eedc751a989cc388c231f |
| Runner dependency | py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng |

## Contract verification

- Direct Mode: 38 passing tests.
- genvm-lint check: passed.
- genvm-lint validate --json: passed; 8 public methods, 4 view methods and 4 write methods.
- genvm-lint schema --json: passed using the documented disposable GENVMROOT compatibility shim for genvm-linter 0.11.0.
- genvm-lint typecheck --json: passed with no diagnostics.
- Frontend npm run typecheck: passed.
- Frontend npm run build: passed.

Tooling limitation: the installed linter requires the compatibility shim because its validator imports legacy genlayer.py while the current Studio Dev SDK exposes the current package layout.

## Live Studio Dev evidence

The canonical contract was used for the compatible and incompatible lifecycle runs. The committed evidence report contains 20 live write assertions:

- 14 successful or authoritatively resumed writes.
- 6 expected failed writes for outsider, duplicate, pre-synthesis and post-seal paths.
- Compatible scenario authoritatively read as SEALED, with both acceptance flags true.
- Compatible synthesis authoritatively read as PARTIAL, with payment, delivery and revisions grounded in source terms.
- Irreconcilable scenario authoritatively read as INCOMPATIBLE.
- No post-seal mutation was accepted.

Transaction IDs are recorded in evidence/STUDIO_DEV_LIVE_TEST_REPORT.json where the live runner obtained them. Resume records intentionally do not fabricate a transaction hash after a read confirmed the state.

## Final status

Ready for Portal submission after replacing the repository and frontend placeholders in PORTAL.md with the final public links. No deployment was made outside Studio Dev.
