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

## Fresh verification ledger

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
| `pnpm api:build` after API routes/crypto changes | Passed. |
| `pnpm api:test` | Passed 3/3 focused storage checks. |
| Local API workflow | Passed account/publisher creation, file upload/server hash, wallet-intent signature, platform signature, public report, and original MATCH / modified MISMATCH using a development-only wallet fixture. |
| Independent signature checks | Passed manifest SHA-256, creator signature, and platform Ed25519 signature using public evidence. |
| `pnpm build` | Passed with Next.js 16.4.6; production build and static generation completed without the prior security advisory. |
| `pnpm test:wallet` | Passed 14/14 existing wallet-provider tests. |
| PostgreSQL schema query | Passed; 17 application tables and `0001_initial_schema.sql` recorded. |
| Docker client/server version | Docker CLI routes to unavailable rootless Podman socket. |
| `podman --version` | Podman 5.7.0 installed; service/container setup not changed. |
| Fresh migration / API / storage checks | Completed locally; system PostgreSQL cluster was not modified. |
| Fresh proof-backed Ledger 9 run | First run timed out during wallet sync while services were stopped. Second run used healthy local proof server, node, and indexer but was interrupted before Vitest completed; no fresh evidence artifact was produced. The tracked historical artifact remains unchanged. |
