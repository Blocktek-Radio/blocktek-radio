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

The UI and local verifier are functional prototype surfaces. The repository also contains an isolated Midnight authorization package at `packages/midnight-authorization/`.

### Midnight authorization implementation

- A Compact 0.36.0 publisher-authorization contract targets the Ledger 9 toolchain. It verifies issuer-signed eligibility statements, enforces request replay protection, supports issuer suspension/reinstatement/key rotation, and emits authorization, issuer-update and revocation events.
- The local Ledger 9 integration suite passed **5/5 tests**, recording **22 scenarios and 8 finalized transactions** on the disposable `undeployed` network. Runtime checks passed **8/8**, privacy checks **2/2**, and governance checks **6/6**. The machine-readable local evidence is in `packages/midnight-authorization/artifacts/results/local-ledger-evidence.json`.
- The verified local devnet runs under rootless Podman. Docker Engine is not currently installed independently; restoring it requires interactive sudo access.
- **Milestone status: PARTIAL. M1.2 public deployment is blocked.** Revocation currently applies to a request-specific reference: reusing a handle for a separately signed request remains eligible. The privacy and credential-wide revocation semantics need a reviewed decision. BlockTek must also approve issuer recovery policy. OWL ID compatibility remains partial and is not claimed as integrated.
- No public Midnight network deployment or 1AM wallet integration has been performed. Creator signing keys remain separate from issuer credentials; wallet possession is not treated as proof of legal identity.

To run the local package checks from its directory:

```bash
cd packages/midnight-authorization
pnpm test:runtime
pnpm test:privacy
pnpm test:governance
pnpm demo
```

The proof-backed local devnet command is `pnpm test:integration`; it takes about 16 minutes on the verified host and requires the local services to be running. The demo is a generated-runtime simulation and does not submit a transaction.

The main prototype still has no connected database, identity issuer, C2PA service, storage provider, chain registry, watermark provider or detector. The next application-backend task is to implement server-side `/api/v1/audio/register` and `/api/v1/audio/verify` with one audited provider adapter at a time.
