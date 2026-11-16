# BlockTek Radio Protocol

A Next.js 16 prototype for BlockTek Radio Protocol and BlockTek AudioTrust: radio distribution infrastructure with explicit publisher, integrity and provenance evidence.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The `/verify` route calculates SHA-256 locally in the browser for supported audio files. It intentionally does not fabricate signatures, C2PA results, detector signals, watermark findings or blockchain anchors.

## Routes

- `/` protocol overview
- `/audiotrust` evidence layer and pilot pricing hypotheses
- `/verify` local hash verifier and unavailable-state report
- `/identity` demo identity registry
- `/developers` proposed API contracts
- `/enterprise` pilot operating model
- `/app` creator workspace prototype

## Configuration and deployment

Copy `.env.example` to `.env.local` for optional server-side provider configuration. Private credentials must remain server-side. Provider adapters are typed in `lib/protocol.ts`; connect real implementations before showing a positive result. Deploy through the Vercel project connected to this repository and configure only the variables required by the enabled adapters.

## Trust model

A valid signing key proves control of that key, not the truth of a recording or the real-world identity of a speaker. Exact hashes, perceptual similarity, provenance, watermark signals, detector outputs and blockchain commitments are shown as separate evidence. Voice biometrics are outside the MVP.

## Current status

The UI and local verifier are functional prototype surfaces. The repository contains an isolated Midnight authorization package at `packages/midnight-authorization/` and a creator wallet provider prototype at `packages/wallet-provider/`.

### Creator wallet integration (M1.2)

- The provider layer uses the pinned Midnight DApp Connector API (`@midnightntwrk/dapp-connector-api` 4.1.0), with connector discovery, explicit wallet selection, connect/disconnect, account and network checks, normalized errors, and a fail-closed signing boundary.
- The `/app` workspace includes an intent review and message-signing demonstration. It uses synthetic registration and manifest commitments. A separate development mock is available only outside production; it is not a real wallet and is never used as a production fallback.
- Creator intents use deterministic, domain-separated `audiotrust.creator-registration` v1 JSON and the Midnight message-signing prefix. Local tests verify BIP-340 Schnorr and ECDSA/secp256k1 signatures. Actual 1AM connection, signature encoding, and proof that a signing key derives the connected Midnight address have not been verified.
- The signing demo does not submit a transaction or call the authorization contract. It reports publisher authorization as blocked/test-only. A connected wallet or creator signature is not a BlockTek publisher credential.
- **M1.2 status: PARTIAL — REAL WALLET DEPENDENCY PENDING.** The browser access host was unavailable for live 1AM testing. No public network deployment was performed.

Run the wallet/provider tests from the repository root:

```bash
pnpm test:wallet
```

### Midnight authorization implementation

- A Compact 0.36.0 publisher-authorization contract targets the Ledger 9 toolchain. It verifies issuer-signed eligibility statements, enforces request replay protection, supports issuer suspension/reinstatement/key rotation, and emits authorization, issuer-update and revocation events.
- Historical local Ledger 9 evidence records **5/5 integration tests**, **22 scenarios and 8 finalized transactions** on the disposable `undeployed` network. This is preserved M1.1 evidence, not a new M1.2 run. Current generated-runtime checks report **8 passed and 1 visible TODO/BLOCKED security regression** for credential-wide revocation. The machine-readable ledger evidence is in `packages/midnight-authorization/artifacts/results/local-ledger-evidence.json`.
- The verified local devnet runs under rootless Podman. Docker Engine is not currently installed independently; restoring it requires interactive sudo access.
- **Authorization status: PARTIAL — TECHNICAL SECURITY BLOCKER. Public deployment is blocked.** Revocation currently applies to a request-specific reference: reusing a handle for a separately signed request remains eligible. The privacy and credential-wide revocation semantics need a reviewed decision. BlockTek must also approve issuer recovery policy; the single-key model remains `INTERIM — NOT APPROVED BY BLOCKTEK`. OWL ID compatibility remains partial and is not claimed as integrated.
- No public Midnight network deployment or live 1AM wallet test has been performed. Creator signing keys remain separate from issuer credentials; wallet possession is not treated as proof of legal identity.

To run the local package checks from its directory:

```bash
cd packages/midnight-authorization
pnpm test:runtime
pnpm test:privacy
pnpm test:governance
pnpm demo
```

The proof-backed local devnet command is `pnpm test:integration`; it takes about 16 minutes on the verified host and requires the local services to be running. The demo is a generated-runtime simulation and does not submit a transaction.

The main prototype still has no connected database, identity issuer, C2PA service, storage provider, chain registry, watermark provider or detector. Before expanding authorization, verify 1AM compatibility and resolve the credential-wide revocation blocker with proof-backed local Ledger 9 evidence and a versioned BlockTek governance decision.
