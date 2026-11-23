# Fresh local API workflow evidence

**Date:** 22 November 2026 (Africa/Nairobi)
**Classification:** fresh PostgreSQL/API integration using the isolated development-only synthetic wallet fixture. It is not a real 1AM or Midnight transaction result.

- Registration: `5b1f9f4e-ec19-48d1-bd27-3bc3e5ef0b19`
- Database state: `awaiting_midnight`
- Newest verification events: two; both stored with `observed_sha256 IS NULL`.
- API behavior: account/publisher creation, supported WAV upload and server hash, intent signature verification, public evidence retrieval, and publisher release history succeeded.
- Exact-file comparison: original `MATCH`; one-byte modified copy `MISMATCH`.
- Chain behavior: no proof or transaction submitted; authorization remains pending.
- Public evidence snapshot: [LOCAL_MVP_API_EVIDENCE_2026-11-22.json](LOCAL_MVP_API_EVIDENCE_2026-11-22.json)

Reproduce the portable checks with `pnpm verify:evidence -- docs/evidence/LOCAL_MVP_API_EVIDENCE_2026-11-22.json` (add the original file path to check the audio hash).
