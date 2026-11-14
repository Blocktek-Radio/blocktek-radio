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

The UI and local verifier are functional prototype surfaces. No database, identity issuer, C2PA service, storage provider, chain registry, watermark provider or detector is connected in this build. The next backend task is to implement server-side `/api/v1/audio/register` and `/api/v1/audio/verify` with one audited provider adapter at a time.
