# agentshop

**Machine-readable macroeconomic reports, sold per fetch over [x402](https://www.x402.org) (USDC on Base).**

`agentshop` is a pay-per-fetch data API and MCP server. It publishes **98 reports** across **23 categories**, **86 indicators**, and **20 economies** (annual editions 2015–2025). Any agent runtime can search the catalogue for free, preview any report for free, then pay a quoted amount of USDC to download the full HTML report — no account, no API key, no fiat on-ramp.

## Why it exists

Retrieval agents need structured macro data (GDP, inflation, trade, debt, labour, energy, emissions, health, education, digital adoption…) but most sources hide it behind login walls or per-seat SaaS. `agentshop` exposes the same data through a machine-native payment rail: an HTTP `402` carries the exact price, the buyer signs one USDC transfer, and the report is served. The whole catalogue is one x402 payment away as a bundle.

## Live instance

- **Base URL:** https://reportbazaar.app.workbuddy.host
- **Catalogue (free):** https://reportbazaar.app.workbuddy.host/catalog
- **Landing / discovery:** https://reportbazaar.app.workbuddy.host/start
- **OpenAPI (220 discoverable resources):** https://reportbazaar.app.workbuddy.host/openapi.json

## MCP server

`agentshop` speaks MCP over streamable HTTP. Agent runtimes can call it directly:

- **MCP endpoint:** `POST https://reportbazaar.app.workbuddy.host/mcp` (streamable HTTP, JSON-RPC 2.0)
- **Server descriptor:** https://reportbazaar.app.workbuddy.host/.well-known/mcp.json
- **Static server card:** https://reportbazaar.app.workbuddy.host/.well-known/mcp/server-card.json

Tools exposed:

| Tool | Purpose |
|---|---|
| `search_reports` | Keyword search the catalogue, returns ids + price + free preview URL |
| `list_catalog` | List buyable reports with live prices (filter by year / category) |
| `list_years` | List edition years and what each publishes |
| `preview_report` | Free preview (first rows) of any report |
| `report_payment_requirements` | Get the exact 402 price + payment schema for a report |
| `buy_report` | Resolve delivery URL + x402 payment requirements (pass `id="bundle"` for the whole catalogue) |

Authentication is **not** required — payment happens inline via x402 on the `buy_report` / `/report/{id}` paths.

## Pricing

- Per-report: **$0.08 – $0.40** (basic → premium tiers, dynamic by freshness & demand)
- Full-catalog bundle (`id="bundle"`): **$0.95** — every report, ~93% cheaper than buying separately

All prices are returned in the HTTP `402` body; the server never hard-codes a displayed price that can drift from the challenge.

## Discovery

The service is indexed on x402scan (220 resources: one concrete `/report/{id}` path per product plus free `/preview/{id}` and `/years/{year}` axes). Each paid path carries `x-payment-info`; each free path declares `security: []` so directories catalogue it without a probe.

## Self-hosting

```bash
# requires Node 18+
npm install
PUBLIC_URL=https://your-host.example.com npm start
```

The server reads its public origin from `PUBLIC_URL` (falls back to the baked default). A `Dockerfile` is included for container deployment. No database is required — the catalogue is generated from `catalog.js` and sales are tracked in a local ledger volume.

## Repository layout

- `catalog.js` — single source of truth for every report (id, tier, indicators, economies, years)
- `pricing.js` — tier × freshness × demand pricing, shared by the 402 challenge and the OpenAPI doc
- `server.js` — HTTP API + x402 payment handling + MCP server + discovery documents
- `store.js` — sales ledger
- `registry-submit.js` — submits the catalogue to x402 discovery directories

## License

MIT
