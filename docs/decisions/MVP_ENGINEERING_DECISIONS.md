# AudioTrust MVP engineering decisions

**Date:** 2026-11-18. Reversible implementation choices are recorded here; this is not formal BlockTek governance approval.

| Decision | Choice | Rationale / consequence |
|---|---|---|
| Issuer governance | Interim single-key BlockTek issuer as directed; design issuer interface so threshold authority can replace it | Keeps current Compact authority shape usable. One key is a high-impact compromise/loss risk; no independent recovery. Formal approval remains pending. |
| Database | PostgreSQL first | Durable relational records and transactional nonce consumption; no in-memory substitute. |
| Development PostgreSQL | User-owned PostgreSQL 18 cluster on private Unix socket, port 5440 | Existing system cluster is accepting connections but user role is absent; provisioning requires interactive sudo unavailable to this session. Avoids touching existing cluster or packages. |
| Backend shape | Separate Fastify TypeScript package | Reuses the existing frontend and provides a clean API/process boundary without a framework rewrite. |
| Backend validation | Zod at env/request boundaries | Runtime validation is necessary; types alone do not validate inputs. |
| SQL/migrations | PostgreSQL driver `pg` and versioned SQL migrations | Keeps current schema transparent and migration process explicit; ORM can be reconsidered if query complexity warrants it. |
| Storage | Private local filesystem adapter with opaque UUID object keys | Keeps source audio off public web root; adapter supports later object store without rewriting registration orchestration. No public permanent storage by default. |
| API binding | Loopback by default | Prevents accidental LAN exposure during local development. |
| Midnight revocation | Do not replace request-scoped key with stable public credential identifier without privacy review | Stable key would correlate all credential actions. Existing behavior remains an acknowledged security blocker pending a real authenticated-root/status witness design or accepted scoped credential lifecycle. |
| External anchoring | EVM is deferred and optional | Registration must remain independent of Sepolia or other external chain availability. |

## Dependency-aware milestones

Phase 1 (DB/API/storage) → Phase 2 (issuer and revocation security, independently) → Phase 3 (real wallet manual acceptance) → Phase 4 (auth/publisher/registration) → Phase 5 (manifest and verification) → Phase 6 (proof-backed Midnight orchestration) → Phase 7 (hardening and demo). Phase 4 cannot claim an authorization complete until Phase 2 and relevant wallet acceptance pass.

## Key management direction

The issuer CLI must create public/private key output locally, support key identification/versioning and rotation, and never print private key bytes to an API. Private keys are not stored in PostgreSQL or Git. The exact encrypted filesystem/key-store mechanism is deferred until compatibility with the pinned Midnight Ed25519 signing implementation is verified; until then there is no production issuer key. Development keys must be explicitly labeled and isolated from future production keys.
