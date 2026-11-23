# 1AM manual wallet acceptance

**Status: NOT READY FOR FINAL ACCEPTANCE.** The browser connector can request `signData`, and isolated adapter tests pass, but live signing and signing-key-to-address binding have not been validated. Further issuer and transaction-coordinator implementation is still required after wallet testing. Do not mark a release Midnight-authorized based on the current API response.

## Safe manual check of the existing connector slice

1. Start PostgreSQL/API/frontend using [the local runbook](LOCAL_DEMO_RUNBOOK.md).
2. Open <http://localhost:3000/app> and sign in to a local publisher account.
3. Connect 1AM and check that the displayed account and reported network are the ones you intended. The current environment configuration targets `preprod`; the local devnet network is `undeployed`. Do not sign if the network label is not what the request explicitly displays.
4. Upload a non-sensitive test audio file and inspect the full signing intent in the UI before approving any wallet prompt. Confirm purpose, publisher/release, account, network, manifest commitment, nonce and expiry.
5. If you approve the signature, verify that the API reports the creator signature as verified. This proves a returned signing key signed the request; it does **not** prove the key derives from the displayed unshielded address.
6. The current expected API result is `awaiting_midnight`. No proof, transaction, finality, or authorization should be displayed as successful.
7. Check public evidence and upload original/byte-modified copies to confirm `MATCH` and `MISMATCH` respectively.

Never provide a seed phrase, private key, or recovery material to AudioTrust. Do not automate unlocking or approval. Capture only provider/API version, network, public account identifier if acceptable, result/error code, and timestamp; never record secret material.

## What must be implemented before the requested final 1AM acceptance

- Supported and independently evidenced key-to-address binding, or a fail-closed UI that does not claim wallet ownership.
- A current local-wallet network configuration compatible with the `undeployed` Ledger 9 target.
- Issuer status and credential lifecycle, proof construction, transaction coordination, finality/indexer reconciliation, and persisted public evidence.

Only after those implementation gates pass should the complete manual workflow ask you to approve a real registration signature and observe finalized local authorization. Automated fixtures are not a substitute for that manual result.
