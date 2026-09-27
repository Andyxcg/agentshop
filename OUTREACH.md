# Agent outreach kit — agentshop

Machine-to-machine outreach. The audience is **directory operators and x402 ecosystem builders**,
not consumers, and the ask is always the same: put this service where an agent's discovery step
will find it. Nothing here is a press release.

Every address below was read off the operator's own published page on 2026-09-23. Do not invent an
address, do not send to `privacy@`/`legal@` addresses for a listing request, and do not send the
same text to several recipients — a directory operator's inbox is small and a template blast is the
fastest way to end up filtered.

---

## 1. Targets, by channel

| Target | Door | Contact | What we are asking for | State |
|---|---|---|---|---|
| **x402-list.com** | open API `POST /api/v1/submit` | `info@x402-list.com` | A listing: free for a first submission from our own domain, then human review. Endpoints are auto-probed for a real 402. | scripted in `registry-submit.js`; the email is a short courtesy note, not the submission |
| **x402scout.com** | open API `POST /register` | — | A row in their catalog and MCP discovery results. Free, no auth. | scripted; the host has been returning 503, so a failure here is not a signal |
| **payapi.market** | web form `/list` | `hello@payapi.market` | Free listing, providers keep 100%. Their form has no API — the docs say so plainly. | **listed & verified** — macro-patents $0.07 paid-verified; live at payapi.market/api/agentshop; MCP at payapi.market/mcp |
| **TensorFeed** | email | `contact@tensorfeed.ai` | A publisher row in the x402 adopters directory they publish at `tensorfeed.ai/api/x402-adopters`. | email |
| **Circle Agent Marketplace** | intake form | — | Listing in their catalog and Discovery API. Manual review, payout wallet gets sanctions-screened. | form |
| **x402scan.com** | SIWX self-registration | `privacy@merit.systems` (privacy only — not a listing door) | A registry entry. Registration writes must be signed by the **receiving** wallet's key. | manual, blocked on the payout key |
| **awesome-x402** | GitHub PR | — | A row in the curated list. | prepared in `awesome-x402-pr.md` |
| **x402-wiki** (THRYX AI) | GitHub PR | — | A verified row in the service encyclopedia. | second PR, after the first |

Deliberately **not** on this list: the Coinbase CDP catalog, `agentic.market` and Ampersend. All
three key off the CDP facilitator and only light up for services that settle through it. This
service settles through PayAI, so a listing there is not a matter of outreach — it would be a
facilitator migration, which changes the settlement rail and every already-indexed row.

## 2. What every message must do

1. **Name the ask in the first two lines.** Who we are, which door we came through, what we want.
2. **Make the claim checkable in one HTTP call.** The strongest sentence available is not a claim,
   it is a URL: `/preview/macro-gdp` returns real numbers for all 20 economies with no wallet. Any
   recipient can verify the whole pitch in one request — say so.
3. **Give the exact discovery files.** `openapi.json`, `/.well-known/x402`, `llms.txt`, the agent
   card. Directory operators read those, not prose.
4. **Never promise a buyer count.** There are zero external orders. The honest line is "the rail
   works and it is open". Overclaiming to the people who can see the chain is the fastest way to
   lose them.
5. **One follow-up at most, two weeks later, then stop.**

## 3. Templates

### 3a. x402-list.com — `info@x402-list.com`

> **Subject:** agentshop — submission filed via the API, plus a note on the free tier
>
> Hi,
>
> I filed a service submission for `agentshop` through `POST /api/v1/submit` a moment ago, so this
> is a courtesy note rather than a second request — the queue entry is already in.
>
> `agentshop` sells prebuilt analytical macro-economic reports per fetch over x402, USDC on Base
> mainnet, through the PayAI facilitator:
>
> - 80 reports across 20 categories, built from World Bank Open Data (CC BY 4.0, attributed in
>   every document), 86 indicators x 20 economies x 2015-2025, 19,651 published observations
> - `/report/custom` builds a report from any indicator, economy and year range
> - `json` and `csv` delivery, so the payload is data rather than a document
> - Free tier with no wallet: `https://reportbazaar.app.workbuddy.host/preview/macro-gdp`
>   returns the real latest-year cross-section for all 20 economies, plus an explicit list of what
>   the paid document adds
>
> Two things you may find useful for the directory itself:
>
> - `info.contact.email` is published in our OpenAPI document, so origin ownership is verifiable
>   without an out-of-band email
> - every paid operation declares `x-payment-info` and `responses.402`, and every free operation
>   declares `security: []`, so an OpenAPI-based classifier should not need to guess or probe the
>   free routes
>
> Happy to correct anything in the submission if a field is in the wrong shape.
>
> Thanks for keeping the monitoring depth in the public dataset.
>
> — agentshop

### 3b. TensorFeed — `contact@tensorfeed.ai`

> **Subject:** Publisher row for the x402 adopters directory?
>
> Hi,
>
> Your x402 adopters directory (published as JSON at `/api/x402-adopters`) lists publishers,
> gateways and SDKs. I would like to add one publisher row, if that is in scope:
>
> - **Name:** agentshop
> - **Category:** publisher
> - **Status:** live
> - **Networks / tokens:** Base mainnet (`eip155:8453`), USDC
> - **Method:** `exact` (EIP-3009, so the buyer needs no ETH), settled via the PayAI facilitator,
>   Bazaar discovery extension on every 402
> - **Endpoint:** `https://reportbazaar.app.workbuddy.host/report/macro-gdp`
> - **Manifest:** `https://reportbazaar.app.workbuddy.host/.well-known/x402`
> - **Website:** `https://reportbazaar.app.workbuddy.host`
>
> What it is: 80 prebuilt analytical macro-economic reports from World Bank Open Data (CC BY 4.0),
> 86 indicators x 20 economies x 2015-2025, sold per fetch. Free verification is one call away -
> `https://reportbazaar.app.workbuddy.host/preview/macro-gdp` returns real numbers for all 20
> economies with no wallet at all, and the paid route answers a standard 402 challenge.
>
> If a publisher row is not what the directory is for, no problem at all - just say and I will stop
> here.
>
> — agentshop

### 3c. payapi.market — `hello@payapi.market`

> **Subject:** agentshop — listing submitted, one question about the paid-route field
>
> Hi,
>
> I am filing `agentshop` through the `/list` form. One question first, so the row is not bounced:
> the form asks for "the paid route", and this service has both a per-report route
> (`/report/{id}`, 80 ids) and a parameterised one (`/report/custom`). I have put
> `/report/macro-gdp` in the field since it is a fixed, durable, 402-answering route at a stable
> price, with the full set enumerated at `/catalog`. Say the word if you would rather have the
> parameterised route instead.
>
> - Base URL: `https://reportbazaar.app.workbuddy.host`
> - Paid route: `/report/macro-gdp` (`extra.name` is `USD Coin`; `payTo` is our Base wallet, and
>   the challenge is a genuine 402)
> - Price per request: $0.13 for that route; $0.06-$0.31 across the catalog, $0.95 for all 80
> - Payout wallet on Base: `0xba7efeabfab91a6febc8d8088faa29ce95979b34`
>
> What it sells: prebuilt analytical macro-economic reports from World Bank Open Data (CC BY 4.0) -
> 86 indicators x 20 economies x 2015-2025, 19,651 published observations, plus derived analytics
> (CAGR, fitted trend, momentum, volatility, HHI concentration) and `json`/`csv` delivery.
>
> Free to check before you list it: `https://reportbazaar.app.workbuddy.host/preview/macro-gdp`
> returns the latest-year cross-section for all 20 economies with no wallet and no auth.
>
> — agentshop

## 4. Send log

Fill this in as messages go out, so the record stays honest about what was actually sent.

| Date | Target | Subject | Sent from | Reply |
|---|---|---|---|---|
| | | | `xingchenguang@agent.qq.com` | |
| 2026-09-23 | payapi.market (Chet) | Re: submission — verification route corrected to reportbazaar.app.workbuddy.host | `xingchenguang@agent.qq.com` | thread reply to "We have your PayAPI Market submission: agentshop" (msg_fSSh…); queued OK |
| 2026-09-23 | payapi.market (Chet) | **VERIFIED — listing live** | — | paid 1 call GET /report/macro-patents?format=json $0.07 (tx 0xef261d…, block 51677923); JSON matched WB IP.PAT.RESD 20 economies (China 2021=1,426,644) + derived totals. Did NOT pay /report/macro-gdp $0.13 (one product/one card). Live: payapi.market/api/agentshop; MCP: payapi.market/mcp. Old x402-report-store subdomain confirmed gone (404). |
| — | x402-list.com | **pending re-submit** — 429 (one submission per email per 7 days), scheduled 2026-09-27 10:00 by automation | — | BASE now derives from `publicBase()` in `brand.js` (no hard-coded host), so `registry-submit.js --live --only x402-list` carries reportbazaar automatically |
| 2026-09-23 | Circle Agent Marketplace | **submitted** with new domain reportbazaar (prefill URL regenerated: 7 address fields x402-report-store → reportbazaar, category=Financial Analysis pre-filled) | — | user submitted from logged-in Chrome; manual review + payout wallet sanctions-screen pending |

## 5. The step that is not an email

The field guide that mapped these directories says the quiet part out loud: *"Directories are
discovery, not distribution. Being listed is table stakes. The calls that matter come from the
protocol community reading that you exist and trusting that you answer the 402 honestly."*

That means the highest-value item on this page is not any single inbox — it is that a stranger can
verify the whole claim with one unauthenticated request. `/preview/{id}` exists for exactly that
reason, and it is the link to lead with everywhere.
