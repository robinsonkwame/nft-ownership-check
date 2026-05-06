# nft-ownership-check

A Next.js application that verifies wallet-based NFT ownership for participants of an IRB-approved academic study on NFT pricing, run by researchers at Wayne State University and recruited through Prolific.

## Flow

1. A Prolific participant arrives at `/screen?PROLIFIC_PID={{%PROLIFIC_PID%}}`.
2. The page presents the IRB Information Sheet and asks for explicit consent.
3. The page explains, in plain language, how wallet verification works and that no private keys are exposed.
4. The participant connects an EVM (Ethereum / Polygon / Base) or Solana wallet through Reown AppKit.
5. The participant signs a one-time verification message (SIWE for EVM, plain message for Solana).
6. The server verifies the signature, then queries Alchemy for NFT holdings on Ethereum, Polygon, Base, and Solana mainnet.
7. **Eligibility rule:** the wallet must currently hold **at least one NFT** (any contract, any acquisition method, including airdrops) on Ethereum, Polygon, Base, or Solana mainnet. There is no allowlist filtering and no spam filtering.
8. An eligibility record is written to Upstash Redis, and the participant is redirected to the Prolific completion URL or screened-out URL accordingly.

## Routes

- `GET /` — landing page.
- `GET /screen?PROLIFIC_PID=…` — participant verification flow (consent → explanation → wallet connect → signature → result + redirect).
- `POST /api/nonce` — issues a single-use nonce (10 min TTL).
- `POST /api/verify` — verifies signature, queries NFT holdings, persists record, returns redirect URL.
- `POST /api/no-wallet` — clean exit for participants who do not have a cryptocurrency wallet. Persists a record with `no_wallet: true, eligible: false` and returns the screened-out URL.
- `GET /api/admin` — Basic-auth-protected JSON dump of all eligibility records (sorted by timestamp descending). Supports `?format=csv` for a CSV download.
- `GET /api/health` — Basic-auth-protected diagnostic. Reports which env vars the running function can see (just `true`/`false` per var, no values), whether Upstash Redis is reachable, the Vercel commit SHA, and the deployment environment. Useful after editing env vars in the Vercel dashboard to confirm the redeploy actually picked them up.

## Environment variables

| Variable | Where set | Purpose |
| --- | --- | --- |
| `ALCHEMY_API_KEY` | Vercel (manual) and `.env.local` | Server-side Alchemy key. **Do not** prefix with `NEXT_PUBLIC_`. Used for both EVM `getNftsForOwner` and the Solana DAS `getAssetsByOwner` endpoint. |
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Vercel (manual) and `.env.local` | Reown / WalletConnect Cloud project ID. Used client-side by AppKit. |
| `PROLIFIC_COMPLETION_URL` | Vercel (manual) and `.env.local` | Where eligible participants are redirected on success. Get this URL from your Prolific study settings. |
| `PROLIFIC_SCREENED_OUT_URL` | Vercel (manual) and `.env.local` | Where ineligible participants are redirected. Get this URL from your Prolific study settings. |
| `ADMIN_PASSWORD` | Vercel (manual) and `.env.local` | Password for Basic auth on `/api/admin`. Use a long random value. |
| `KV_REST_API_URL` | Vercel (auto via Upstash Marketplace integration) | Upstash Redis REST endpoint. |
| `KV_REST_API_TOKEN` | Vercel (auto via Upstash Marketplace integration) | Upstash Redis REST token (read+write). |
| `TEST_BYPASS_PROLIFIC_ID` | Vercel (manual, optional) and `.env.local` | Test-mode bypass. See "Test bypass" below. Leave **unset** in production. |

`@upstash/redis`'s `Redis.fromEnv()` automatically picks up `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

## Local development

```bash
npm install
# create .env.local with the variables listed above
npm run dev
```

Open <http://localhost:3000/screen?PROLIFIC_PID=test001> to exercise the participant flow.

## Deployment to Vercel

1. **Push this repo to GitHub** and import it as a project in Vercel.
2. **Add the Upstash Redis Marketplace integration** to the Vercel project (Project → Storage → Marketplace → Upstash for Redis). This provisions a Redis database and auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the project's environment variables.
3. **Set the manual environment variables** in Project Settings → Environment Variables:
   - `ALCHEMY_API_KEY`
   - `NEXT_PUBLIC_REOWN_PROJECT_ID`
   - `PROLIFIC_COMPLETION_URL`
   - `PROLIFIC_SCREENED_OUT_URL`
   - `ADMIN_PASSWORD`
4. **Trigger a redeploy** (`vercel --prod` or a fresh push to `main`).
5. **Configure your Prolific study** to use the URL template:
   ```
   https://<your-vercel-domain>/screen?PROLIFIC_PID={{%PROLIFIC_PID%}}
   ```
6. **Smoke-test** by following the URL in a browser with a wallet you know is empty of NFTs; you should be redirected to the screened-out URL, and a record should appear at `https://<your-vercel-domain>/api/admin` (Basic auth).

## Test bypass

Validating the eligible path normally requires a wallet that holds at least one NFT on Ethereum, Polygon, Base, or Solana. To exercise the full server-side flow without buying an NFT, set the optional env var `TEST_BYPASS_PROLIFIC_ID` to a long, hard-to-guess string of your choice (treat it like a shared secret). When a participant arrives with `?PROLIFIC_PID=<that exact string>`:

- Connect-wallet, message-signing, signature verification, nonce consumption, and Redis record-write all run normally.
- The Alchemy NFT lookup is **skipped** and counts are synthesised as `{ ethereum: 1 }`, so `eligible` is always `true` and the participant is redirected to `PROLIFIC_COMPLETION_URL`.
- The eligibility record stored at `prolific:<id>` is tagged `"test_bypass": true` so you can filter these rows out of real research data.
- A `console.warn` line is emitted server-side every time the bypass triggers, for the audit log.

**Workflow**

1. In Vercel → Project Settings → Environment Variables, set `TEST_BYPASS_PROLIFIC_ID` to e.g. `WSU-NFT-BYPASS-jNV4yN6m1iNs` (any long random string), Production scope. Redeploy.
2. Visit `https://nft-ownership-check.vercel.app/screen?PROLIFIC_PID=WSU-NFT-BYPASS-jNV4yN6m1iNs` with any wallet, complete the flow, confirm you land on the completion URL and that a record with `"test_bypass": true` appears in `/api/admin`.
3. Run a 3-person Prolific test against participants who have actual NFTs to validate the full real path.
4. **Remove `TEST_BYPASS_PROLIFIC_ID`** from Vercel before opening the study to the full participant pool, and redeploy. With the var unset, the bypass is fully disabled.

The bypass is keyed on string equality with `prolific_id` from the request body. If the env var is absent or empty, no value can trigger it. Do not commit the bypass string into source.

## Admin endpoint

```bash
curl -u admin:$ADMIN_PASSWORD https://<your-vercel-domain>/api/admin
curl -u admin:$ADMIN_PASSWORD "https://<your-vercel-domain>/api/admin?format=csv" > eligibility.csv
```

(The username is ignored; only the password must match `ADMIN_PASSWORD`.)

## Comments

This is a research tool, not a production wallet application.

- Nonces are stored in Upstash Redis with a 10-minute TTL and consumed atomically by `GETDEL` on `/api/verify`. They cannot be reused.
- Eligibility records are stored in Upstash Redis at key `prolific:{PROLIFIC_PID}` as JSON without a TTL. They persist until the research team deletes them.
- We never see, request, or store private keys or seed phrases. Participants prove ownership of their wallet's public address by signing a one-time message — for EVM wallets this follows the SIWE format ([EIP-4361](https://eips.ethereum.org/EIPS/eip-4361)); for Solana wallets it is a plain UTF-8 message verified with `tweetnacl`.
- The Solana NFT count is obtained through Alchemy's DAS (Digital Asset Standard) endpoint at `https://solana-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}` using the JSON-RPC method `getAssetsByOwner`. We filter on the asset `interface` field to count only non-fungible items. The first page (limit 100) is sufficient for a binary eligibility check.
- The EVM NFT counts come from `alchemy-sdk`'s `getNftsForOwner` with `omitMetadata: true` and `pageSize: 1`, which returns `totalCount` cheaply.
- All server errors are logged with the relevant Prolific PID for later debugging by the research team.
