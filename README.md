# Airtable Form Worker

A 1-file Cloudflare Worker that powers the [Airtable Backend Framer plugin](https://www.framer.com/marketplace/) by forwarding form submissions to Airtable while keeping your Personal Access Token secure on Cloudflare's edge.

**Why this exists:** Framer's marketplace policy requires that user API keys never appear in published-site code. This Worker holds your Airtable PAT server-side and your Framer plugin posts form data to its URL — your PAT never ships in the deployed site.

## One-click deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/khushaldewra/airtable-form-worker)

After clicking:
1. Sign in to Cloudflare (free account, no credit card)
2. Cloudflare clones this repo and creates a new Worker for you
3. **Important — set the 4 environment variables before deploy:**

| Variable | Type | Value |
|----------|------|-------|
| `AIRTABLE_PAT` | **Secret** | Your Airtable PAT — create at https://airtable.com/create/tokens with scope `data.records:write` on a single base |
| `AIRTABLE_BASE_ID` | Text | Your base ID (starts with `app...`, found in the URL) |
| `AIRTABLE_TABLE` | Text | Your table name (must match exactly) |
| `ALLOWED_ORIGIN` | Text | Your published Framer site origin, e.g. `https://yoursite.com` (or `*` to allow any origin — not recommended) |

4. Click **Deploy**
5. Copy your Worker's URL — it'll look like `https://airtable-form-worker.YOUR-SUBDOMAIN.workers.dev`
6. Paste it into the **Airtable Backend** plugin in Framer

## Manual deploy (if you prefer the CLI)

```bash
git clone https://github.com/khushaldewra/airtable-form-worker.git
cd airtable-form-worker
npm install -g wrangler
wrangler login
wrangler secret put AIRTABLE_PAT
wrangler deploy
```

Then set the remaining variables (`AIRTABLE_BASE_ID`, `AIRTABLE_TABLE`, `ALLOWED_ORIGIN`) in the Cloudflare dashboard under **Settings → Variables**.

## Rate limiting

The Worker rate-limits to 30 submissions per IP per minute by default. Override with the `RATE_LIMIT_PER_MINUTE` variable. Cloudflare's WAF rate-limit rules can layer additional protection.

## What it does, end to end

```
Framer site → POST { fields: { Name, Email, Message } } → Worker → POST to Airtable REST API → row created
```

Your PAT only exists on the Worker's edge. The Framer plugin's published code only knows the Worker URL.

## License

MIT — built by [KDX Studios](https://khushaldewra.com).
