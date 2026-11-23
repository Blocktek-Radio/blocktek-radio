# Final MVP security review

**Scope:** local MVP source/configuration review and fresh checks on 22 November 2026. This is not a production security certification.

## Controls present or added

- App database uses the private PostgreSQL 18 user cluster at port 5440 and a Unix socket; startup preserves existing API configuration.
- API sessions store token hashes, support revocation, and use HttpOnly/SameSite cookies; production sets Secure.
- Passwords use scrypt; creator intent nonces are one-use and consumed transactionally with release signing.
- Uploads use a size-limited multipart stream, MIME/signature checks, opaque local storage keys, server-side SHA-256, restrictive filesystem behavior and cleanup on failed DB writes.
- Fastify now limits account creation to 8 and login to 12 requests per IP per 15 minutes, and audio endpoints to 30 requests per IP per minute. This in-memory control resets on restart and is not shared across workers.
- New file verification records keep only outcome/time; they do not store a submitted file's observed digest. The hash is returned to the uploader in the immediate response.
- Logs redact cookie and authorization headers.

Fresh behavior check sent 13 invalid login requests from one loopback client: attempts 1–12 were rejected as invalid credentials and attempt 13 returned HTTP 429. The API was restarted after the check to clear the in-memory test bucket.

## High-priority gaps

1. **Wallet address binding is unverified.** The connector verifies the public key and signature returned by `signData`, but does not derive/prove that key from the displayed unshielded address. Wallet association is not address-bound proof.
2. **No registration transaction coordinator.** Current API state is `awaiting_midnight`. It does not create a Compact witness/proof, submit, poll finality or persist chain evidence. No authorization success can be claimed.
3. **Issuer lifecycle is absent.** No active-status issuer service, CLI, credential revocation database or audit-enforced lease issuance exists. Compact accepts a signed lease up to 900 seconds and cannot see off-chain revocation on its own. This is a bounded stale-lease design, not immediate chain revocation.
4. **Network mismatch.** Existing backend config is `preprod`; local devnet uses `undeployed`. A local transaction flow needs a compatible connector target.

## Medium-priority gaps

- No database-backed API integration/concurrency suite or full browser E2E suite.
- Rate limiting is process-local and endpoint/IP scoped; it is not robust against distributed abuse.
- Platform signing key remains development-only local key material. Do not claim production key custody.
- Email is not verified; publisher assurance is explicitly not legal identity verification.
- No fresh restart/recovery or isolated backup/restore rehearsal.
- Upload signature checks are lightweight container/header checks, not a full media decoder or malware scanner.

## Product claims to preserve

SHA-256 equality establishes byte equality only. Signatures establish only that the respective key signed the respective payload. Neither proves truth, speaker identity, copyright, legal identity, or originality before registration. A pending or unavailable Midnight check must remain distinct from a valid signature or file match.

## Required next security gates

Resolve wallet identity binding with the actual supported connector semantics; implement issuer status/key controls and the stated bounded revocation policy; implement and test chain submission/recovery; add PostgreSQL and browser integration tests; reconcile local network identifiers; and rehearse recovery before any broader pilot exposure.
