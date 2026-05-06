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
- `GET /api/admin` — Basic-auth-protected JSON dump of all eligibility records (sorted by timestamp descending). Supports `?format=csv` for a CSV download.

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
