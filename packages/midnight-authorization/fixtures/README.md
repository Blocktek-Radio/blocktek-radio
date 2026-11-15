# Synthetic credential fixtures

The test suite and CLI demo construct signed Compact `CredentialStatement` fixtures at runtime from the deterministic Ed25519 seed `0x07` repeated 32 times. This is a public, disposable test-only key and must never be used to issue real BlockTek credentials. Test inputs cover valid claims, invalid signatures, wrong issuer, missing identity/membership/publisher claims, expired statements, malformed registration commitments, revocation and replay.

Signatures use Compact runtime's generated typed hash helper over the compiled `CredentialStatement` descriptor. No real identity data, wallet phrase, creator key, audio file or production credential is present.
