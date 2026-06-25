# Analytics Copilot

Internal web app that lets the agency team query client **GA4** and **Google Search Console** data in plain English. Claude turns questions into the right API calls and answers with prose, tables, and charts. No Looker, no spreadsheets, no Claude access required for the team — just a login.

## How it works

```
Browser (Chat UI) ──▶ /api/chat ──▶ Claude (agentic loop) ──▶ GA4 / GSC tools ──▶ Google APIs
```

- One **Google service account** reaches every client property/site it's been granted Viewer access to. No per-client credentials.
- Properties and sites are **auto-discovered** (GA4 Admin `listAccountSummaries`, GSC `sites.list`) — nothing is hardcoded.
- Claude runs a **manual tool-use loop** (`app/api/chat/route.ts`): it resolves the property/site, queries the data, and streams the answer back as newline-delimited JSON events.
- Charts are emitted by Claude as fenced ```` ```chart ```` JSON blocks and rendered client-side with Recharts.
- Access is gated by an **email allowlist** (NextAuth + Google sign-in). No Google Workspace needed.

## Tools available to Claude

| Tool | What it does |
| --- | --- |
| `list_ga4_properties` | Discover all GA4 properties the service account can see |
| `query_ga4` | Run a GA4 report (dimensions, metrics, date range) |
| `list_gsc_sites` | Discover all Search Console sites |
| `query_gsc` | Run a Search Analytics query (clicks/impressions/ctr/position) |

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.local` and fill in the blanks (see below).

3. **Run locally**

   ```bash
   npm run dev
   ```

   With `DEV_AUTH_BYPASS=true` the login gate is skipped so you can test immediately.

## Environment variables

`.env.local` (gitignored) holds everything. Fields you must fill:

| Variable | Required | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | From the Anthropic console |
| `ANTHROPIC_MODEL` | pre-filled | `claude-opus-4-6` (switch to sonnet/haiku to cut cost) |
| `GOOGLE_APPLICATION_CREDENTIALS` | pre-filled | Absolute path to the service-account JSON key |
| `DEV_AUTH_BYPASS` | pre-filled | `true` for local dev; set `false` before deploying |
| `NEXTAUTH_URL` | pre-filled | `http://localhost:3000` locally |
| `GOOGLE_OAUTH_CLIENT_ID` | before deploy | Google OAuth web client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | before deploy | |
| `NEXTAUTH_SECRET` | before deploy | `openssl rand -base64 32` |
| `ALLOWED_EMAILS` | before deploy | Comma-separated team emails allowed to sign in |

## Granting the service account access to a client

For each client account, add the service-account email as a **Viewer**:

- **GA4:** Admin → Property Access Management → add `…iam.gserviceaccount.com` with Viewer.
- **GSC:** Settings → Users and permissions → add the same email with Full (or Restricted) access.

Newly granted properties/sites appear automatically — no code changes.

## Deploying

1. Set `DEV_AUTH_BYPASS=false`.
2. Fill the Google OAuth + `NEXTAUTH_SECRET` + `ALLOWED_EMAILS` fields.
3. Add the service-account JSON to the host's secret store and point `GOOGLE_APPLICATION_CREDENTIALS` at it.
4. Add `<your-url>/api/auth/callback/google` as an authorized redirect URI in the Google OAuth client.

## Project layout

```
app/
  api/chat/route.ts      Streaming agentic loop (Claude + tools)
  api/auth/[...nextauth] NextAuth handler
  page.tsx               Chat page
  signin/page.tsx        Sign-in page
components/
  Chat.tsx               Chat UI + ndjson stream client
  MessageContent.tsx     Markdown + chart splitting
  ChartRenderer.tsx      Recharts line/bar renderer
lib/
  anthropic.ts           Client + model config
  tools.ts               Tool schemas, dispatch, system prompt
  auth.ts                Allowlist + session helpers
  cache.ts               In-memory TTL cache
  connectors/ga4.ts      GA4 Admin + Data API
  connectors/gsc.ts      Search Console API
middleware.ts            Route gating
```
