# AudioTrust MVP security model

**Status:** engineering baseline; not a production security review or governance approval. Updated 2026-11-18.

## Claims and non-claims

AudioTrust can establish that a specific set of bytes matches a registered digest and that supported keys signed a canonical release record. It does not establish the truth of audio, real-world identity of a speaker, that a person said the words, prior integrity before registration, copyright ownership, or authenticity of AI-generated audio.

## Assets and boundaries

| Asset | Boundary and handling |
|---|---|
| Creator signing key / seed | Remains in user's wallet. Never requested or persisted by AudioTrust. |
| BlockTek issuer private key | Separate from creator keys; never committed, sent to frontend, API-returned, or stored as plaintext in PostgreSQL. Current contract authority is single-key and lacks independent recovery. |
| Raw credential and private witnesses | Keep private and short-lived; never expose as public evidence. OWL ID remains unintegrated. |
| Raw audio | Private by default, stored outside web root with generated identifiers; no Arweave/public upload by default. |
| Release evidence | Public output must be allowlisted; never include local storage paths, unnecessary identity claims, or secrets. |
| Nonces and sessions | API sessions store token hashes; wallet intent nonces are durable, user/network/purpose-bound, time-limited, and atomically consumed. |
| Public ledger | Treat issuer state, request nullifiers, derived request references, timestamps, events, and transaction timing as observable and potentially correlatable. |

## Trust model

- Email/account authentication identifies an account session, not wallet control or legal identity.
- A wallet challenge signature establishes control of a key for a specific domain, network, purpose, and nonce only after the signature scheme and account binding are verified.
- Publisher eligibility claims are BlockTek issuer assertions. They are not independent legal identity proof.
- Publisher signature, platform signature, issuer credential, Midnight proof, and optional chain anchor have distinct meanings and must verify independently.
- Midnight is used for private credential-claim authorization proofs. It does not make the rest of the registration workflow inherently private or automatically trustworthy.

## Known blockers and operational risks

1. **Credential revocation:** the Compact contract stores a request-specific revocation reference. A separately signed request using the same credential handle may succeed; do not claim credential-wide revocation until fixed and proof-tested.
2. **Issuer single-key authority:** accepted as interim engineering direction only, but issuer lifecycle CLI and production key custody are not implemented. Independent recovery and cryptographic multisig are absent. This is not formal BlockTek approval.
3. **Wallet verification:** live 1AM support, signature encoding, account/key binding, and network behavior remain externally unverified.
4. **Application security:** password sessions and publisher membership checks exist. Email verification, rate limiting, account recovery, member management, malware scanning, and a production threat review remain unimplemented. Wallet key/address binding is not proven by the current connector signature path.
5. **Data durability:** backups, restore procedures, retention enforcement, and storage encryption-at-rest are not configured by this local foundation.
6. **Development platform key:** the local key command stores an unencrypted Ed25519 PEM outside the repo with mode `0600`. It is only a development signer; production needs reviewed protected custody, access control, rotation, and separate key IDs.

## Required controls before production

- Resolve and independently review credential-wide revocation, freshness, and issuer lifecycle; run fresh Compact compilation and Ledger 9 transactions.
- Establish protected issuer key custody (encrypted protected filesystem/key store if supported), CLI rotation/suspension process, audit evidence, and named governance operators.
- Add abuse limits, account recovery/member management, malware scanning, and production-grade session/tenant authorization review; retain the existing upload validation, durable nonce consumption, and audit trail.
- Separate and protect AudioTrust platform signing keys; publish key IDs and rotation policy.
- Review public manifest fields, data retention, deletion, local/VPS backups, and incident response.
- Perform 1AM manual tests and prove creator signing key/account association before relying on that binding.

## Safe local defaults

The API binds to `127.0.0.1`; local PostgreSQL uses a user-owned cluster and private socket; audio storage is outside the public web root and created with restrictive directory/file permissions. These are development boundaries, not production hardening guarantees.
