# Twitter / X Playbook — agentshop

Audience: **agents and the people who build them.** Not consumers.
Everything below is verified live as of 2026-09-21.

Facts you may quote (all measured, not estimated):

| Fact | Value |
|---|---|
| Service | `agentshop` |
| Base URL | `https://reportbazaar.app.workbuddy.host` |
| Catalog | 80 reports / 20 categories / 86 indicators |
| Data points | 19,651 observations |
| Coverage | 20 economies × 2015–2025 — for 55 of 80 reports; 6 cover 10 (see note) |
| Price per report | $0.06 – $0.31 |
| Custom report | from $0.20 (any indicator × economy × years) |
| Full catalog | $0.95 (vs $12.44 bought separately — 10.2× less) |
| Settlement | USDC on Base mainnet (`eip155:8453`), EIP-3009 — buyer needs **no ETH** |
| Discovery index | 5 endpoints listed in the facilitator's Bazaar index |
| Delivery formats | html · json · csv · summary-csv |

> **Coverage note (do not omit if you cite 20 economies):** 55 of the 80 reports span 20 economies.
> The remaining 6 cover 10, because their indicators — government debt, external debt, Gini, poverty
> headcount, female property rights — are not densely published upstream. Narrowing those keeps every
> row inside a report directly comparable. `/indicators` lists 29 economies that can be requested
> explicitly via `/report/custom`.

---

## Main post — long form (use this one)

> I built a data store that only agents can buy from.
>
> No signup. No API key. No checkout page. No human.
>
> 80 World Bank reports. 19,651 data points. 20 economies × 2015–2025. Priced in USDC on Base over HTTP 402.
>
> The whole flow is three steps:
>
> 1. `GET https://reportbazaar.app.workbuddy.host/report/macro-gdp`
> 2. Get `402` back with the price in a machine-readable header — $0.13
> 3. Sign the USDC transfer, replay the same request, get the report as `200`
>
> That's it. No account existed at any point.
>
> **Try it free first — this costs nothing and needs no auth:**
>
> `GET /preview/macro-gdp`
>
> Returns the latest-year cross-section for all 20 economies as real numbers, a field dictionary, and an explicit list of what the paid version adds. Read it, decide, then pay — or don't.
>
> **What you get when you pay:** the full 2015–2025 panel, per-economy derived metrics (CAGR, volatility, fitted trend, momentum, outlier years), group statistics (HHI concentration, dispersion), and data-quality disclosure (requested cells vs actually published, missing years, release lag).
>
> **Formats:** append `?format=json` or `?format=csv` and you get data, not a document.
>
> **Anything not in the catalog:** `/report/custom?indicators=&countries=&years=` builds a report from any of 86 indicators across any economy and any year range. Priced by request size, from $0.20.
>
> **All 80 in one fetch:** $0.95 — the same reports bought one by one come to $12.44.
>
> **Discovery, if your crawler wants to find me on its own:**
> `/catalog` · `/agent.json` · `/.well-known/agent.json` · `/.well-known/x402` · `/openapi.json` · `/llms.txt`
>
> Every paid endpoint carries a Bazaar discovery extension, so the x402 index picks it up without me submitting anything.
>
> Source: World Bank Open Data (CC BY 4.0). Attribution is in every document.
>
> Prices are re-quoted per request — always pay the amount in the 402 you just received, not an older one.
>
> No account. No email. No KYC. No human.
>
> → https://reportbazaar.app.workbuddy.host

---

## Short post (≤280 chars, for replies and quote-tweets)

> Agents don't need a signup flow. They need a 402.
>
> 80 World Bank reports, 19,651 data points, priced in USDC on Base. No account, no API key.
>
> $0.06–$0.31 each. Preview free:
> https://reportbazaar.app.workbuddy.host/preview/macro-gdp

---

## Alternative hooks (A/B the first line — it carries the whole post)

**A. For agent builders — the "your agent can now buy things" angle**
> Your agent can read the web but it can't pay for anything. That's the actual bottleneck, not reasoning.
>
> Here's a store it can transact with end to end, unattended...
> *(continue with the spec block)*

**B. For crypto-native readers — the "settlement" angle**
> Every report here is a settled on-chain transfer, not an invoice.
>
> `GET /report/macro-gdp` → `402` → USDC on Base → `200`. EIP-3009, so the buyer needs zero ETH — the facilitator pays the gas.
>
> 80 reports, $0.06–$0.31...

**C. For the contrarian angle**
> Everybody's shipping agents that can think. Almost nobody's shipping the thing they need next: somewhere to spend.
>
> So I built one. 80 reports, USDC on Base, no signup...

---

## Thread (post the long form as the hook, then these as replies)

**1/** The reason this works without an account is x402 — HTTP 402 has been reserved in the spec since 1996 and nobody used it. Now: request → 402 with price → pay → replay → 200. That's the entire auth layer.

**2/** The buyer needs no ETH. Settlement is EIP-3009 (`transferWithAuthorization`), so the facilitator sponsors gas. Fund a wallet with USDC and it can buy. I verified this — ETH balance didn't move a single digit across purchases.

**3/** Pricing is a function, not a constant. Tier base × data freshness × demand, clamped. Every 402 re-quotes. If you cache a price and pay it later, your payment fails verification.

**4/** One thing that bit me: the x402 client libraries default to a **$1 per-payment cap**. Anything priced above that doesn't fail at my server — it fails locally in *your* client and never leaves the machine. So everything here is under $0.95.

**5/** Discovery is a side effect of settlement, not a submission form. There is no "register your service" endpoint. The facilitator indexes a resource the first time it sees a real payment for it. Five of mine are indexed so far.

**6/** Free tier that actually tells you something: `/preview/{id}` gives the real latest-year numbers for all 20 economies plus a list of what paying adds. Made it because "trust me, the data's good" isn't a pitch.

---

## Mechanics

**Post as an image + text.** The 402→200 terminal transcript is the single most convincing visual. Screenshot the free preview page as a secondary.

**Timing.** x402/Base dev conversation is densest Tue–Thu, roughly 14:00–17:00 UTC (22:00–01:00 Beijing). Post the long form, then let the thread drip.

**Tags — verify the handle exists before you @ it.** I'm only confident about `@base` and `@CoinbaseDev`. Hashtags that reach this audience: `#x402` `#AIagents` `#AgenticPayments` `#USDC` `#Base`. Keep it to 3.

**Quote-tweet, don't cold-reply.** Find threads about agent payments / agent commerce / x402 and quote-tweet with the live endpoint. Cold replies to big accounts read as spam; quote-tweets with a working demo read as a contribution.

**The highest-leverage line is "free preview, no auth."** Lead with it in every reply. It costs nothing to check and it converts a stranger into a request, and a request into a 402.

**Reply to your own thread with the raw transcript.** An actual `402` header and the `200` that follows is more persuasive than any description.

**Don't promise a buyer count.** You have 6 sales, all self-test. The honest line is "the rail works and it's open" — not "agents are buying it". Overclaiming is the fastest way to lose this audience.

---

## Cross-post targets (same copy adapts directly)

- x402 / Coinbase developer community
- Warpcast / Farcaster (Base-native, shorter format — use the ≤280 version)
- Base ecosystem Discord
- r/LocalLLaMA, r/AI_Agents (as a build post, not an ad)
- Hacker News *Show HN* — the "agents can't pay for anything" framing works there
