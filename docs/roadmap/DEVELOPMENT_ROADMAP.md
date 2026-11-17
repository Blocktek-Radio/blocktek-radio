# AudioTrust development roadmap

**Updated:** 2026-11-18. Work is sequenced by dependency; public deployment is excluded.

| Phase | Scope | Acceptance gate | Current state |
|---|---|---|---|
| 0 — Direction | Architecture, interim single-key policy, PostgreSQL-first plan, security boundaries | Decisions and current implementation truth documented | COMPLETE — LOCAL ONLY |
| 1 — Foundation | PostgreSQL, migrations, API shell, health, config, private local storage | Clean DB migration; DB health; storage save/read/delete/hash; no committed secrets | COMPLETE — LOCAL ONLY |
| 2 — Midnight security | Issuer CLI and versioned key lifecycle; solve credential-wide revocation and freshness | Fresh Ledger 9 proof-backed lifecycle including cross-request revoke, stale witness, rotation and replay rejection | NOT STARTED; security gap known |
| 3 — Wallet | Real 1AM discovery, account/network, human-readable intent, signature binding | Manual real-wallet test and cryptographic/address-binding evidence | PARTIAL; external wallet test required |
| 4 — Registration and identity | Auth, users/org/publisher roles, wallet association, durable nonce, upload/hash/audit | Persist actual publisher and audio registration request | PARTIAL — local account, publisher, upload, hash, and nonce workflow implemented; email verification/member management pending |
| 5 — Signed release | Canonical manifest, creator signature verification, protected platform signature, public report | Independent signature and exact-file verification | PARTIAL — local publisher + dev platform signatures, public browser verification, and MATCH/MISMATCH work; key/address binding and production key custody pending |
| 6 — Midnight registration | Join real wallet/authorization proof, local ledger submission, finalization, persistence | One end-to-end registration with actual chain evidence | NOT STARTED |
| 7 — Hardening/demo | Security review, failure paths, clean setup, browser rehearsal and mentor docs | Reproducible demo; accurate known limitations | NOT STARTED |

## Dependency-aware execution order

1. Finish Phase 1 by starting the isolated PostgreSQL cluster, installing pinned backend dependencies, applying the migration on a clean DB, verifying the health endpoint, and exercising storage through focused checks.
2. Work the Midnight revocation design and issuer lifecycle without waiting on the API. The existing request-scoped model is not acceptable as credential-wide revocation; a new design requires Compact/Ledger evidence before status changes.
3. Run manual 1AM testing against the actual extension; do not claim the adapter is 1AM-verified until a real vector and address-binding review pass.
4. Add email verification, publisher member management, rate limits, upload retention/deletion and production session controls to the now-persistent registration API.
5. Keep manifest/signature/evidence independently verifiable; document platform key format/rotation and protect production key custody before deployment.
6. Integrate Midnight transaction submission only after the authorization proof and wallet paths are accepted; external wallet or DUST conditions must leave an honest pending state.
7. Rehearse a fresh local Ledger-backed registration and independent browser verification before mentor review.

## Explicitly deferred

Ethereum/Sepolia anchoring, Arweave, C2PA, perceptual fingerprints, audio watermarking, AI detection, Redis, and enterprise multi-key issuer governance are not prerequisites for this MVP. External anchoring must be an outbox capability and cannot gate registration.
