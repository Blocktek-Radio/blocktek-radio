# Local Ledger 9 attempt — 22 November 2026

**Classification:** failed transaction/finality integration attempt. Do not cite as an authorization success.

## Command

```sh
AUDIOTRUST_COMPILED_ARTIFACT_PATH="$PWD/packages/midnight-authorization/artifacts/contract-final-mvp" \
AUDIOTRUST_EVIDENCE_PATH="$PWD/packages/midnight-authorization/artifacts/results/local-ledger-mvp-2026-11-22.json" \
AUDIOTRUST_ADDRESS_PATH="$PWD/packages/midnight-authorization/artifacts/results/deployment-address.local-mvp-2026-11-22.json" \
pnpm --dir packages/midnight-authorization test:integration
```

The full Compact compiler generated the bindings and proving/verifier keys beneath the new ignored directory `artifacts/contract-final-mvp`. The test connected to local network `undeployed`, synchronized the package's deterministic integration wallet, and the proof server processed the deployment `/prove` request.

## Result

- The node logged `Validated transaction b6e7b4070d6678199968960297eb3b484ca3bd4f471c73ced1593f75daf5dff3 for mempool` repeatedly.
- The transaction did not become indexed or finalized during the 600-second deployment test timeout.
- The explicit indexer lookup by that hash returned an empty transaction list.
- Runner result: `test/integration/local-ledger.test.mjs` — 5 failed / 0 passed. First deployment test timed out at 600000ms; later tests failed because no deployment address was initialized.
- Isolated runner output: [local-ledger-mvp-2026-11-22.json](../../packages/midnight-authorization/artifacts/results/local-ledger-mvp-2026-11-22.json), status `SETUP_FAILED`, `contractAddress: null`, no recorded successful scenarios or finalized transaction IDs.
- No deployment address file was produced. No block height is attributed to the pending hash.
- After the timeout, `author_pendingExtrinsics` returned one pending extrinsic. The integration timeout is not treated as proof that it was rejected; do not resubmit until the local ledger/indexer state is reconciled.

The test harness adjustment now accepts isolated artifact, address and evidence paths. The existing historical results and deployment artifacts were not overwritten.
