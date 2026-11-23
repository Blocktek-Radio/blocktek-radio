# Local demo runbook

This runbook starts the local signed-release/file-integrity slice. It does not make the API submit Midnight authorization; current releases remain `awaiting_midnight`.

## Prerequisites and startup

Use Node.js 24 (or the project's minimum), pnpm 12, PostgreSQL 18 binaries, and Podman 5.7. The DB script targets a private user-owned cluster, its socket and port 5440. It preserves an existing `backend/.env.local`; confirm that file points to the private socket/port and uses the intended network.

```sh
./scripts/dev-db-up.sh
./scripts/dev-db-status.sh
pnpm api:migrate
```

For Midnight infrastructure, start the rootless Podman API socket in one terminal if it is not active, then start the devnet:

```sh
mkdir -p "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman"
podman system service --time=0 "unix://${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/podman/podman.sock"
```

In another terminal:

```sh
pnpm --dir packages/midnight-authorization devnet:up
pnpm --dir packages/midnight-authorization devnet:status
```

Start API and frontend in separate terminals:

```sh
pnpm api:dev
pnpm dev
```

## Health checks

```sh
curl -fsS http://127.0.0.1:4100/api/v1/health
curl -fsS http://127.0.0.1:3000/app >/dev/null
curl -fsS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"chain_getHeader","params":[]}' \
  http://127.0.0.1:9944
```

The indexer and proof-server ports are `8088` and `6300`; use `pnpm --dir packages/midnight-authorization devnet:status` and `podman compose logs --tail=100` from the package directory for diagnostics. Do not treat an open port as proof that an app transaction was finalized.

## URLs

- Publisher workspace: <http://localhost:3000/app>
- Public verifier: <http://localhost:3000/verify>
- API health: <http://127.0.0.1:4100/api/v1/health>
- Local Ledger node RPC: <http://127.0.0.1:9944>
- Indexer: <http://127.0.0.1:8088>
- Proof server: <http://127.0.0.1:6300>

## Verified local workflow

Create an account, sign in, upload supported audio, review the wallet intent, and sign only with the intended connector. Current backend persistence can produce public signed evidence and exact-file checks. Expected outcomes for original and byte-modified files are `MATCH` and `MISMATCH`. Current API signing returns `awaiting_midnight`; it does not generate a proof or submit a chain transaction.

The new portable verifier consumes a JSON response saved from `/api/v1/audio/<registrationId>/evidence`:

```sh
curl -fsS 'http://127.0.0.1:4100/api/v1/audio/<registration-id>/evidence' -o evidence.json
pnpm verify:evidence -- evidence.json /path/to/original-audio.wav
```

The endpoint is public and does not require the account cookie. Chain finality still requires an independent network/indexer check.

## Stop

Stop API/frontend with Ctrl-C. To stop the local chain without deleting its volumes, run `pnpm --dir packages/midnight-authorization devnet:down`. Do not run `devnet:reset` for routine shutdown; it deletes local chain state. Stop the private database with `./scripts/dev-db-down.sh` when no local application process needs it.

See [test results](END_TO_END_TEST_RESULTS.md) for the distinction between automated fixture tests and chain evidence.
