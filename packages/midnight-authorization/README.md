# AudioTrust Publisher Authorization

Isolated Compact contract package for publisher authorization. It does not store audio, publisher identity records, raw credentials or creator keys. It is not a copyright registry.

## Status

The pinned Compact 0.36.0 source compiles, including Ledger 9 `Misc` event emission. Eight runtime tests pass, including request-scoped revocation privacy and issuer key lifecycle checks. A local Podman-rootless Ledger 9 devnet is running. The original proof-backed evidence is preserved; the current source requires a fresh transaction-backed run, recorded in `artifacts/results/local-ledger-evidence.json`. Docker Engine is not currently installed because `podman-docker` replaced Docker CE/CLI; see `docs/backend/MIDNIGHT_LOCAL_ENVIRONMENT.md`.

The signed credential is a BlockTek-issued, registration-specific eligibility statement. It independently carries individual identity, organization membership and publisher authorization claims; all are required. The issuer signs the hash of the fixed Compact `CredentialStatement` type. The signature suite is Ed25519 using Compact's `ed25519Verify<32>` standard-library circuit and typed `Curve25519Point` / `Ed25519Signature` values. A registration statement binds schema and policy versions, validity interval, issuer, request commitment, nonce, private revocation handle, fixed domain tag and this contract address.

## Build

Requirements: Node.js 22.12+, pnpm, Compact devtools 0.5.1 and toolchain 0.36.0. These versions match Midnight's Ledger 9 compatibility matrix as checked 2026-11-15. The frontend package and lockfile are independent of this package.

```sh
compact compile --version
pnpm install
pnpm compile
pnpm test
pnpm demo
```

`pnpm compile` writes compiler output, ZKIR, prover/verifier keys and bindings beneath `artifacts/contract`. `pnpm compile:check` validates source and privacy annotations without generating proving keys.

## Public/private boundary

Public contract state is the current issuer ID/key/status, policy version, consumed request nullifiers, and request-scoped revocation references. Credential claims, subject commitment, signature, signed statement and raw revocation handle remain private circuit inputs. Compact requires disclosure of credential issue/expiry timestamps for block-time predicates and the derived revocation reference used for public-map membership. The reference is a domain-separated hash of a high-entropy private handle, deployment address, registration commitment and request nonce; different requests produce different public references. This avoids exposing one stable handle across requests, but the particular authorization and its later revocation can still be correlated through the reference and transaction timing. It is not a general unlinkable revocation accumulator.

The one-time nullifier is domain separated and includes the deployed contract address, registration commitment and signed nonce. It is request-specific and is not intended as a stable publisher identifier. Commitment contents are an application-defined fixed 32-byte value; do not use a raw audio SHA-256 or personal data directly.

## Administration and limitations

The constructor initializes BlockTek's issuer and signing key. Issuer key/status updates and revocations require a valid signature by the current issuer key; no caller identity or EVM-style `msg.sender` assumption is used. The single-key administration flow has no multisig, timelock or independent recovery path yet. A lost/compromised key therefore requires a new reviewed deployment. The contract emits Ledger 9 `Misc` events for authorization, issuer updates and revocation; constructor initialization is observed through deployment transaction and public state because Compact prohibits constructor events.

OWL ID is not integrated. This Compact statement/signature boundary can later be replaced by an OWL ID-compatible private presentation after its product, schema and verifier are evidenced. 1AM is not integrated; the future client boundary is the official Midnight DApp Connector API.

See `docs/backend/M1_1_COMPLETION_REPORT.md`, `MIDNIGHT_LOCAL_ENVIRONMENT.md`, `MIDNIGHT_REVOCATION_PRIVACY_ASSESSMENT.md`, `MIDNIGHT_ISSUER_GOVERNANCE.md`, `OWL_ID_COMPATIBILITY_ASSESSMENT.md`, `MIDNIGHT_CONTRACT_SECURITY_NOTES.md` and `MIDNIGHT_LOCAL_DEVNET_DEMO.md` for evidence and remaining gates. `pnpm test:integration` submits real proofs and transactions to the local devnet; rejected circuits fail before submission and do not create mock receipts.

## Official references

- [Compatibility matrix](https://docs.midnight.network/relnotes/support-matrix)
- [Ledger 9 upgrade and cryptographic support](https://docs.midnight.network/relnotes/ledger-9)
- [Compact 0.36.0 release notes](https://docs.midnight.network/relnotes/compact/toolchain-0.36.0)
- [Install the Compact toolchain](https://docs.midnight.network/getting-started/installation)
- [Compact privacy model](https://docs.midnight.network/guides/build-a-private-smart-contract)
