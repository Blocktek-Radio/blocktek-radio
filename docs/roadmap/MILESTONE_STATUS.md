# MVP milestone status

**Updated:** 22 November 2026 (Africa/Nairobi)

**Base:** `93333e9`, branch `feature/audiotrust-m1-3-wallet-authorization`

| Milestone | Status | Fresh evidence / open work |
|---|---|---|
| M1 — local infrastructure and database | **PARTIAL / LOCAL SERVICES HEALTHY** | Private PostgreSQL on 5440, migrations 0001–0003 and API health pass. Local Ledger 9 node/indexer/proof server healthy. Existing `backend/.env.local` says `preprod`, while local devnet says `undeployed`. |
| M2 — backend lifecycle and persistence | **PARTIAL** | Fresh fixture-backed API path, history, public evidence and exact file compare passed. Lifecycle still ends at `awaiting_midnight`; comprehensive PostgreSQL integration/concurrency tests are absent. |
| M3 — wallet connector | **IMPLEMENTED LOCALLY; LIVE ACCEPTANCE OPEN** | 15/15 adapter tests. No live 1AM signature result. Signing-key/address binding is unsupported/unproven. |
| M4 — issuer status/revocation | **NOT IMPLEMENTED** | Compact accepts short-lived issuer attestations; issuer status service, CLI, credential revocation store, and cross-request revocation enforcement absent. |
| M5 — Compact source/runtime | **PARTIAL** | Skip-ZK compile check and 7/7 runtime tests pass; full proving compile produced current bindings and prover/verifier keys. Local proof server accepted a deployment proof. The integration deployment did not finalize/index; no contract address or successful scenario. |
| M6 — application transaction coordinator | **NOT IMPLEMENTED** | API does not build a witness/proof, submit, poll finality/indexer or reconcile retries. Package transaction attempt timed out waiting for local finality/indexing. |
| M7 — manifest/public/portable verification | **PARTIAL** | Existing public evidence plus new portable verifier; 1/1 synthetic verifier test. No Midnight proof/finality record to validate. |
| M8 — frontend end-to-end | **PARTIAL** | Production build and `/app` served. No browser workflow suite or complete chain state presentation. |
| M9 — full local acceptance/recovery/revocation | **NOT RUN / BLOCKED BY M4–M6** | Off-chain synthetic API slice passed; no chain-backed application acceptance or restart recovery matrix. |
| M10 — manual 1AM handoff | **NOT READY** | Manual wallet operation remains unverified, but additional implementation work is outstanding; it is not the only remaining action. |

## Fresh verification ledger

- `pnpm api:build && pnpm api:test` — pass, 3 tests.
- `pnpm test:wallet` — pass, 15 tests (automated fixtures, not live wallet).
- `pnpm --dir packages/midnight-authorization compile:check` — pass (skip-ZK).
- `pnpm --dir packages/midnight-authorization test` — pass, 7 runtime simulation tests.
- `pnpm build` — pass; Next.js 16.4.6 production build/type check.
- `pnpm test:evidence` — pass, 1 verifier test.
- `pnpm api:migrate` — pass on AudioTrust private cluster; migration ledger contains 0001, 0002, 0003.
- API/PostgreSQL workflow — account, upload, intent signature, public evidence/history and file `MATCH`/`MISMATCH` pass with development-only synthetic wallet; status correctly remains `awaiting_midnight`.
- `pnpm --dir packages/midnight-authorization devnet:up` — all three local services healthy; node head `0xa1c`.
- `pnpm --dir packages/midnight-authorization test:integration` — 5 failed / 0 passed. First deployment proof was generated and hash `b6e7b4070d6678199968960297eb3b484ca3bd4f471c73ced1593f75daf5dff3` was repeatedly mempool-validated, but it did not finalize/index within 600 seconds. Isolated evidence file reports `SETUP_FAILED`; no fresh finalized ledger evidence exists.

Full proving compile and proof-backed test results are tracked in [end-to-end test results](../backend/END_TO_END_TEST_RESULTS.md). Historical evidence is not counted as fresh.

## Historical snapshot — 18 November 2026

The following earlier status ledger is retained as historical context; the fresh status above supersedes its current-state claims.

# AudioTrust milestone status

**Review date:** 2026-11-18. Status reflects current repository work; historical evidence is labeled separately.

| Milestone | Status | Current evidence / remaining gate |
|---|---|---|
| M0 project prototype | IMPLEMENTED — LOCAL VERIFICATION ONLY | Existing Next.js surfaces and browser-only exact hash; not a registration service. |
| M1.1 Compact authorization | PARTIALLY IMPLEMENTED | Historical local Ledger 9 result has 5 tests / 22 scenarios / 8 finalized transactions; not rerun for current source in this delivery. Credential-wide revocation fails across requests. |
| M1.2 wallet adapter | PARTIALLY IMPLEMENTED | Generic connector API adapter and local crypto tests; live 1AM response/address binding unverified. |
| Phase 0 engineering direction | COMPLETE — LOCAL ONLY | Architecture, roadmap, status, security model, and decisions documented. |
| Phase 1 infrastructure | COMPLETE — LOCAL ONLY | Dedicated user-owned PostgreSQL 18 cluster started; migration applied and idempotently rerun; API build passes; live health returned database `ok`; local storage tests pass 3/3. |
| Phase 2 issuer/revocation | NOT IMPLEMENTED | Single-key model accepted as interim engineering direction; no BlockTek governance approval evidence. Credential-wide revocation unresolved. |
| Phase 3 wallet | PARTIAL — EXTERNAL TEST REQUIRED | Workspace supports discovered real connectors and signs a server-issued release intent; live 1AM signature encoding and key/address binding remain unverified. |
| Phase 4 registration | PARTIAL — LOCAL ONLY | Password sessions, account/publisher creation, private upload, server hash, durable signing nonce, and audit persistence are implemented. Email verification and member management are pending. |
| Phase 5 signed release | PARTIAL — LOCAL ONLY | Canonical manifest, wallet and dev-platform signature verification, public evidence, browser digest/signature checks, and file MATCH/MISMATCH work. |
| Phase 6 Midnight registration | BLOCKED — TECHNICAL / EXTERNAL | The application does not submit a Compact transaction; the current credential-wide revocation gap remains. A fresh proof-backed run was interrupted before completion; no current Ledger pass is claimed. |
| Phase 7 hardening/demo | NOT COMPLETE | Production hardening, live wallet, app-level chain transaction, retention/backup, and full demonstration rehearsal remain. |

### Historical fresh-verification ledger

| Check | Result |
|---|---|
| `git status --short --branch` at start | Existing modifications in wallet demo, `package.json`, lockfile; existing untracked docs and `playwright.json` preserved. |
| `pg_isready` | Existing PostgreSQL accepts connections on port 5432. |
| `psql -Atqc 'select version()'` | Denied: OS role `farmers-boy` does not exist. |
| `sudo -n -u postgres psql ...` | Blocked: interactive sudo authentication required. |
| `./scripts/dev-db-up.sh` | Passed: initialized/started isolated PostgreSQL 18, created `audiotrust_app` with peer mapping, and wrote ignored local config. |
| `pnpm api:migrate` | Passed twice; initial migration applied once and second run made no changes. |
| `pnpm api:build` | Passed after fixing strict error normalization and storage interface typing. |
| `pnpm api:test` | Passed 3/3 filesystem storage checks: exact bytes/hash, retrieval/deletion, unsafe key rejection, oversize cleanup. |
| `pnpm api:dev` + `curl http://127.0.0.1:4100/api/v1/health` | Passed; response was `status: ok`, database `ok`. |
| Local API workflow | Passed account/publisher creation, file upload/server hash, wallet-intent signature, platform signature, public report, and original MATCH / modified MISMATCH using a development-only wallet fixture. |
| Independent signature checks | Passed manifest SHA-256, creator signature, and platform Ed25519 signature using public evidence. |
| `pnpm build` | Passed with Next.js 16.4.6; production build and static generation completed without the prior security advisory. |
| `pnpm test:wallet` | Passed 14/14 existing wallet-provider tests. |
| PostgreSQL schema query | Passed; 17 application tables and `0001_initial_schema.sql` recorded. |
| Docker client/server version | Docker CLI routes to unavailable rootless Podman socket. |
| `podman --version` | Podman 5.7.0 installed; service/container setup not changed. |
| Fresh proof-backed Ledger 9 run | First run timed out during wallet sync while services were stopped. Second run used healthy local proof server, node, and indexer but was interrupted before Vitest completed; no fresh evidence artifact was produced. The tracked historical artifact remains unchanged. |
