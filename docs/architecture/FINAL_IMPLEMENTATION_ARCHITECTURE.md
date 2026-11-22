# Final implementation architecture (current local state)

## Components

- **Next.js 16.4.6 publisher and verifier UI** at `app/`, using a browser wallet adapter in `packages/wallet-provider`.
- **Fastify API** at `backend/src`, responsible for account sessions, publisher membership, private upload, server file hashing, durable intent nonce, signature verification, manifest/platform signature persistence, public evidence and exact-file comparison.
- **PostgreSQL 18 private user cluster** with migrations `0001`–`0003`; audio bytes remain in private local filesystem storage.
- **Compact authorization package** at `packages/midnight-authorization`, compiled against Compact language 0.28 / runtime 0.21. Its issuer-signed credential statement binds claims to a request/contract context, with request-scoped replay nullifiers and a 900-second maximum lease.
- **Local Ledger 9 devnet** runs as three separate Podman services: node 9944, indexer 8088, proof server 6300.
- **Portable evidence verifier** in `scripts/verify-audiotrust-evidence.mjs` independently checks canonical manifest digest, creator signature, AudioTrust platform signature and optional exact file hash.

## Verified release path

1. User authenticates; account creates an owner organization and publisher.
2. API checks access, validates basic audio headers and size, writes private audio, and computes SHA-256.
3. API creates registration and a short-lived one-use signing intent bound to network, account string, registration commitment and manifest commitment.
4. Wallet signs the exact canonical intent; API verifies the returned key/signature and consumes the nonce. It stores creator and development platform signatures, and returns `awaiting_midnight`.
5. Public evidence can expose manifest/signature records. A verifier can compare the exact audio file and independently verify the signed payloads.

## Missing integration boundary

The verified path stops between steps 4 and 5. There is no service to establish current publisher credential status, create a typed Compact `CredentialStatement` witness, ask the proof server for a proof, construct/submit a Ledger transaction, poll/index finality, or reconcile retries after an API restart. Therefore the separately running Midnight devnet is not currently called by a release registration. `authorization_records` and transaction tables are schema capacity, not evidence that this flow writes chain results.

## Trust and privacy boundaries

- Audio remains off-chain in private storage.
- Current Compact source keeps credential claims and revocation handle private, while issuer configuration, request nullifiers and timing predicates are public. Request nullifiers are not credential-wide revocation.
- The issuer-signed lease supports at most 15 minutes of bounded stale status; without the missing status service it cannot be treated as revocation enforcement.
- A signature key returned by the connector is not proven to derive from the displayed address.
- Platform signer is development-only; publisher legal identity is not independently verified.
- Public file hash comparison distinguishes integrity from authorization. `MATCH` does not imply truth, identity, copyright or pre-registration authenticity.
