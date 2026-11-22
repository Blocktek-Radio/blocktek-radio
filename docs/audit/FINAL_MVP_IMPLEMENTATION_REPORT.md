# BlockTek Radio / AudioTrust — Implementation Report

**Date:** 22 November 2026 (Africa/Nairobi)
**Branch / base:** `feature/audiotrust-m1-3-wallet-authorization` / `93333e9`

## Outcome

The complete MVP directive is **not complete**. The repository still has no registration-to-Compact coordinator, issuer status service, proof witness builder, application transaction submission/finality path, or credential-wide revocation operation. No real 1AM signing or account-binding acceptance was performed. These are implementation gaps, not merely the reserved manual wallet test. Do not describe releases as Midnight-authorized.

Several local milestones were freshly verified and hardened:

- The private AudioTrust PostgreSQL 18 cluster was started at its configured Unix socket / port 5440. `pnpm api:migrate` completed and confirmed migrations `0001`–`0003`; the startup script now preserves an existing `backend/.env.local`.
- API and frontend builds pass. The API health endpoint returned database `ok`.
- The local Ledger 9 node, indexer and proof server became healthy. The node returned block height `0xa1c` (2590) on `undeployed`.
- Wallet adapter tests passed 15/15; storage/API package tests passed 3/3; Compact generated-runtime tests passed 7/7; Compact `--skip-zk` source validation passed; the independent verifier test passed 1/1.
- A fresh API workflow with an explicitly synthetic development wallet created an account and publisher, uploaded a valid WAV, verified its intent signature, persisted evidence/history, and returned original `MATCH` and modified `MISMATCH`. It ended in `awaiting_midnight`.
- The full Compact proving compile generated current bindings and keys. The Ledger integration test generated a deployment proof and the node validated its transaction hash into the mempool, but the transaction did not finalize or index in 600 seconds. The runner recorded 5 failed / 0 passed, no contract address and zero finalized transactions in `packages/midnight-authorization/artifacts/results/local-ledger-mvp-2026-11-22.json`.
- An independent CLI verifies the exported public evidence's canonical manifest digest, creator signature, platform Ed25519 signature, and optional file hash. It explicitly requires an independent network/indexer check for chain claims.
- Login/registration/audio endpoints now have a conservative per-process, per-IP rate limit. New file verification events retain result/time without storing the observed mismatch hash.

## Fresh command evidence

| Command / action | Result | Evidence class |
|---|---|---|
| `./scripts/dev-db-up.sh` | Private cluster ready on port 5440; existing API env file preserved | Infrastructure |
| `pnpm api:migrate` | Successful; three migrations recorded | Database integration |
| `pnpm api:build && pnpm api:test` | Build passed; 3/3 tests passed | Build / unit |
| `pnpm test:wallet` | 15/15 passed | Unit; mock connectors only |
| `pnpm --dir packages/midnight-authorization compile:check` | Passed with installed Compact CLI 0.5.1 / source language 0.28 | Source validation; skip ZK |
| Full `compact compile ... artifacts/contract-final-mvp` | Generated current contract bindings and ~550 MB proving/verifier artifacts | Full compile output, isolated and ignored |
| `pnpm --dir packages/midnight-authorization test` | 7/7 passed | Generated-runtime simulation |
| `pnpm build` | Next.js 16.4.6 build and TypeScript passed | Build |
| `pnpm test:evidence` | 1/1 passed | Unit; synthetic signatures |
| API workflow script | Upload/signature/evidence/history/MATCH/MISMATCH passed; `awaiting_midnight` | Local API/PostgreSQL integration with synthetic wallet |
| `curl http://127.0.0.1:4100/api/v1/health` | `status=ok`, database `ok` | Live local service |
| `pnpm --dir packages/midnight-authorization devnet:up` | Node, indexer, proof server healthy | Local infrastructure only |
| `pnpm --dir packages/midnight-authorization test:integration` | 5 failed / 0 passed; deployment proof generated, mempool hash `b6e7…dff3`, not indexed/finalized after 600s | Failed local Ledger transaction/finality attempt |

The full Compact proving compile was started to a new `artifacts/contract-final-mvp` path; its final outcome is recorded in `END_TO_END_TEST_RESULTS.md`. No fresh Ledger transaction is claimed unless that record contains a passing transaction result and new artifact path.

## Implemented changes

- `scripts/dev-db-up.sh` no longer overwrites an existing local API environment file.
- Fastify adds basic in-process throttles for account creation, login, and audio endpoints. This is suitable only for the single-process local demo, not multiple workers or public deployment.
- Verification event persistence no longer stores observed hashes for new checks.
- `scripts/verify-audiotrust-evidence.mjs` and test provide a small portable verifier for public evidence exports.

## Not completed / blockers

1. Registration persists signatures but returns `awaiting_midnight`; there is no transaction coordinator in `backend/src`.
2. `credential-provider.ts` is an interface only. The issuer service/CLI and current-status store do not exist.
3. Compact's existing request nullifier is intentionally request-scoped. The approved lease cap limits a stale issuer statement to 900 seconds but does not provide individual credential revocation on-chain.
4. The connector verifies a signature using the key returned by `signData`; it does not prove that key derives from the displayed unshielded address. Fail closed for any claim of address-bound wallet ownership.
5. No complete database-backed automated API test suite, browser end-to-end suite, or interrupted-transaction recovery rehearsal has been executed. The current-source Ledger test could not finalize/index its deployment transaction.
6. The local wallet config currently names `preprod`, while the local Ledger devnet is `undeployed`. This needs an explicit supported-wallet/network decision before a real signed request can be coordinated with the local transaction.

## Product and trust boundaries

Hash equality proves exact byte equality against the registered digest. A creator signature proves that the signature key signed a specific intent. Neither proves legal identity, speaker identity, copyright, truth, nor pre-registration authenticity. The platform signing key remains development-only. Publisher assurance remains BlockTek-issued and does not establish legal identity. Midnight authorization and finality remain pending until actual transaction evidence is present.

See [milestone status](../roadmap/MILESTONE_STATUS.md), [test results](../backend/END_TO_END_TEST_RESULTS.md), [security review](../security/FINAL_MVP_SECURITY_REVIEW.md), and [architecture](../architecture/FINAL_IMPLEMENTATION_ARCHITECTURE.md).
