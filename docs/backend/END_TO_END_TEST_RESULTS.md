# End-to-end and integration test results

**Run date:** 22 November 2026 (Africa/Nairobi). This report records fresh work in this checkout. Historical artifacts and the 18 November fixture report are not counted as current passes.

## Fresh passes

| Area | Command / action | Result | Classification |
|---|---|---|---|
| Database | `./scripts/dev-db-up.sh`; `pnpm api:migrate` | Private PostgreSQL on port 5440; migrations 0001–0003 present | Local infrastructure / DB |
| API | `pnpm api:build && pnpm api:test` | Build pass; 3/3 filesystem tests pass | Build / unit |
| API health | `curl -fsS http://127.0.0.1:4100/api/v1/health` | `status=ok`, database `ok` | Live local service |
| Wallet | `pnpm test:wallet` | 15/15 pass | Unit fixtures; not live 1AM |
| Compact | `pnpm --dir packages/midnight-authorization compile:check` | Pass with `--skip-zk` | Source validation only |
| Compact runtime | `pnpm --dir packages/midnight-authorization test` | 7/7 pass | Generated-runtime simulation |
| Frontend | `pnpm build` | Next.js 16.4.6 production build and TypeScript pass | Build |
| Portable verifier | `pnpm test:evidence` | 1/1 pass; valid/tampered manifest and signatures handled | Synthetic unit fixture |
| API registration | Fresh account → publisher → WAV upload → intent signing using development-only `DevelopmentMockProvider` → public evidence/history → exact-file check | Signature accepted, record persisted as `awaiting_midnight`, original `MATCH`, modified `MISMATCH` | PostgreSQL/API integration fixture |
| API restart | Restarted Fastify, fetched same release/evidence again | Registration, two signatures and `awaiting_midnight` persisted | Local persistence check |
| Portable verifier | `node scripts/verify-audiotrust-evidence.mjs docs/evidence/LOCAL_MVP_API_EVIDENCE_2026-11-22.json` | Manifest `VALID`, creator/platform signatures `VALID`, chain `PENDING` | Independent local verification |
| Rate limiting | 13 invalid login requests from one loopback client | First 12 returned credential failure; request 13 returned `429` with retry guidance | Live API behavior |
| Midnight infrastructure | `pnpm --dir packages/midnight-authorization devnet:up` | Node, indexer, proof server healthy; node head `0xa1c` | Infrastructure only |

## Not established

- A proof-backed Ledger transaction with current source.
- API integration with an issuer, witness builder, proof provider, transaction submitter, indexer finality and recovery coordinator.
- Credential-wide revocation across registrations.
- Real 1AM `signData`, account/address binding, reconnect after reload, or manual transaction approval.
- PostgreSQL route/concurrency tests, browser end-to-end tests, interrupted-transaction recovery, or isolated backup restore.

## Proof-backed Ledger attempt

**Result: FAIL — submission did not finalize or index.** A full Compact proving compile produced current `artifacts/contract-final-mvp` bindings and prover/verifier keys. The `test:integration` run used those artifacts and the new isolated paths. Wallet sync and deployment proof generation passed. The local node repeatedly logged validation of transaction hash `b6e7b4070d6678199968960297eb3b484ca3bd4f471c73ced1593f75daf5dff3` into its mempool, but after 600 seconds it was still not returned by the indexer `transactions(offset:{hash:...})` query. The first deployment test timed out; the following four tests failed because no contract address was initialized. Runner output: 5 failed / 0 passed; evidence file `artifacts/results/local-ledger-mvp-2026-11-22.json` has `SETUP_FAILED`, null contract address, zero scenarios and zero finalized transaction IDs. No block height is attributed to the submitted hash. The second API result is independent and remains `awaiting_midnight`. Do not treat the mempool hash as a final transaction or proof-backed authorization result.

See [the isolated local Ledger attempt record](../evidence/LOCAL_LEDGER_ATTEMPT_2026-11-22.md) and its generated runner artifact for full detail.

## Evidence boundaries

The development mock is explicitly a local API fixture. It establishes behavior of current backend routes and cryptographic verification under a synthetic signer. It does not establish that 1AM implements the same response behavior or that the signature key corresponds to a Midnight address. The local devnet being healthy does not mean the application used it.
