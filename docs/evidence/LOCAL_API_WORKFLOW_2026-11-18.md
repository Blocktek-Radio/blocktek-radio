# Local API registration workflow evidence

**Run date:** 2026-11-18
**Status:** IMPLEMENTED — LOCAL VERIFICATION ONLY
**Environment:** User-owned local PostgreSQL, local API, development-only platform key, synthetic account and a development wallet-provider fixture.

This run exercised the API and public evidence flow without a real creator wallet or Midnight transaction. The fixture was used only by the local test driver; it is not offered by the application UI and is not evidence of a real wallet signature.

## Observed checks

- API CORS accepted the local frontend origin (`http://localhost:3000`).
- Created a synthetic test account and publisher; uploaded a valid WAV test payload.
- The server calculated the file hash and generated a canonical registration intent with a durable, expiring nonce.
- The development fixture signed the intent; the API independently verified the publisher signature, consumed the nonce, and signed the release manifest with the local Ed25519 development key.
- Public evidence returned the manifest and signature material. Independent checks recomputed the SHA-256 and verified the publisher and platform signatures.
- Exact uploaded bytes returned `MATCH`; modified bytes returned `MISMATCH`.
- Registration stayed `awaiting_midnight`. The test did not submit a Compact transaction, and wallet-address binding remained unverified.

## Limits

This is local integration evidence, not a real-wallet test, proof-backed Ledger result, production key-custody review, or public deployment. The API workflow does not yet connect publisher authorization to the Compact contract. Test account/file data may remain in the local development database; no user production data was involved.

The fresh proof-backed Ledger 9 run is separately recorded in [milestone status](../roadmap/MILESTONE_STATUS.md) and did not complete during this delivery. The historical Ledger artifact is not presented as a current result.
