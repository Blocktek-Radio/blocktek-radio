# BlockTek AudioTrust

AudioTrust is a portable audio provenance service for Web3 media, podcasts, DAO channels, and ecosystem publishers. It is designed to answer: **who published this release, which key authorized it, what exact file was registered, and what verifiable evidence exists?** It does not determine whether audio is truthful, identify a real-world voice, establish copyright ownership, or prove that a recording was unmodified before registration.

## Current implementation

- Next.js 16.4.6 frontend with product, identity, developer, publisher workspace, and public verification surfaces. The identity page still includes prototype behavior.
- Midnight wallet adapter based on the pinned DApp Connector API 4.1.0. A developer manually confirmed that 1AM connects on Preprod. Real message signing and cryptographic binding between the returned signing key and displayed wallet address still need verification.
- Compact publisher authorization package with fresh proof-backed Ledger 9 local evidence for Compact 0.36.0. The contract enforces issuer-signed status leases of at most 15 minutes and prevents issuer-update nonce replay. Credential-wide revocation still depends on an issuer status service that is not integrated; no public deployment is authorized.
- TypeScript/Fastify API with PostgreSQL account sessions, publisher onboarding, private audio upload, server-side SHA-256, canonical manifests, durable one-time wallet intent nonces, publisher signature verification, AudioTrust Ed25519 signatures, public evidence, and exact-file comparison. Midnight submission remains pending.

See [system architecture](docs/architecture/SYSTEM_ARCHITECTURE.md), [roadmap](docs/roadmap/DEVELOPMENT_ROADMAP.md), [milestone status](docs/roadmap/MILESTONE_STATUS.md), and [security model](docs/security/MVP_SECURITY_MODEL.md).

## Why Midnight is in the design

Exact-file SHA-256 and portable signatures do not require Midnight. The authorization use case does: an authorized publisher should be able to prove that an issuer approved its publishing eligibility while keeping the underlying credential claims private. The current Compact contract is an isolated proof-backed prototype, not yet connected to the registration API. Its issuer-signed leases bound how long an already-issued status statement can remain usable, but the missing issuer status service means it cannot yet guarantee immediate rejection of a revoked credential.

## Run locally

Install dependencies, start the isolated user-owned PostgreSQL cluster, then apply migrations:

```bash
pnpm install
./scripts/dev-db-up.sh
pnpm api:migrate
```

Run the UI and API in separate terminals:

```bash
pnpm dev
pnpm api:dev
```

The UI is at `http://localhost:3000`; the API health endpoint is `http://127.0.0.1:4100/api/v1/health`. PostgreSQL uses a private Unix socket on port 5440 and its data lives outside the repository. `scripts/dev-db-down.sh` stops only AudioTrust's user-owned cluster. See [local setup](docs/architecture/SYSTEM_ARCHITECTURE.md#local-development).

Create the explicitly development-only AudioTrust platform signing key once after starting PostgreSQL:

```bash
pnpm api:platform-key:dev
```

It is stored outside the repo with mode `0600`; never use this local key for production.

## Checks

```bash
pnpm test:wallet
pnpm api:build
pnpm api:migrate
```

Midnight package checks and proof-backed integration are documented in [packages/midnight-authorization/README.md](packages/midnight-authorization/README.md). Historical transaction evidence must not be represented as a fresh run.

### Manual 1AM wallet check

The developer manually confirmed that 1AM connects to AudioTrust on Midnight Preprod on 2026-11-18 (Africa/Nairobi). The UI displays the connected account and network. Real 1AM message signing, signature verification, and signing-key-to-address binding have not yet been confirmed. To continue the test, open `/app`, create or sign into a publisher account, upload an audio file, prepare a signing intent, and approve it in the wallet. A successful signature leads to `awaiting_midnight`; this version does not submit an application release transaction. The UI will not substitute a mock wallet when none is found. Record the wallet/API version, network, signature scheme, and outcome. Do not enter a seed phrase in AudioTrust.

Share the local evidence page at `/verify?id=<registration-id>`. It independently verifies the stored manifest digest and both available signatures in the browser, then compares a supplied file's SHA-256 with the registered digest. The API retains a result-only verification event and does not expose an observed hash for mismatch submissions in the public report.

## Product trust boundaries

- A wallet signature proves control of a key for a particular request; it does not prove legal identity, authorship in a legal sense, or copyright ownership.
- A BlockTek credential proves only the claims the issuer approved. OWL ID is not integrated.
- Audio is private by default. Raw audio, credentials, witness data, and private keys must not go on public chains.
- Audio is never returned by the public evidence API. Verification records the result and timestamp but does not publish the observed hash for a mismatch file.

## Product workflow and status

The local flow supports account/publisher onboarding → private audio upload → server-side hash → canonical manifest → publisher and AudioTrust signatures → public evidence and MATCH/MISMATCH comparison. A developer has verified the real 1AM connection on Preprod; signing and key-to-address binding remain to be tested. Midnight authorization submission from the application is still pending, and the full MVP workflow is **not complete**.

Status labels and the next acceptance gates are maintained in [MILESTONE_STATUS.md](docs/roadmap/MILESTONE_STATUS.md).
