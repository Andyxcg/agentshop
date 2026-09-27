# Distribution Playbook — agentshop

How to get this service discovered and bought **by agents, not humans**. Everything below is
machine-to-machine: the buyers are autonomous clients that read a 402 challenge, pay USDC, and
consume the document. Human social channels are deliberately last.

Every number here was measured against the live service, Base mainnet and the PayAI facilitator on
2026-09-21.

---

## 1. What is live

| Item | Value |
|---|---|
| Service | `https://reportbazaar.app.workbuddy.host` |
| Payout address | `0xba7efeabfab91a6febc8d8088faa29ce95979b34` |
| Network | `eip155:8453` (Base mainnet) |
| Asset | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Facilitator | `https://facilitator.payai.network` |
| Catalog | 98 reports in 23 categories · 86 indicators · 20 economies · 2015–2025 |
| Data volume | 19,651 published observations across the catalog (38–880 per report) |
| Delivery | `html` · `json` · `csv` (tidy long panel) · `summary-csv` (one row per economy of derived metrics) |
| Single report | **$0.06 – $0.31** (mean $0.159) |
| Bespoke report | **$0.20 – $0.95**, scales with indicators × economies |
| Category bundle | **$0.10 – $0.54** across 19 category rungs |
| Full bundle | **$0.95** — all 98 reports in one x402 payment, versus ~$13.73 bought individually |
| Cloud-space mirror | `https://cloud1-7gyzgkg96ec57514-1313330325.tcloudbaseapp.com/` |

### Free discovery surface (no wallet needed)

| Purpose | URL |
|---|---|
| Catalog with live prices and data volumes | `/catalog` |
| Keyword search | `/search?q=inflation` |
| Supported indicators by theme | `/indicators` |
| **Free data preview** — latest-year cross-section for all 20 economies | `/preview/{id}` |
| Reduced free sample | `/sample/{id}` |
| JSON Schema of the paid payload | `/schema/report.json` |
| A2A agent card (81 skills) | `/.well-known/agent.json` |
| Flat x402 resource list | `/.well-known/x402` |
| OpenAPI 3.1 with `x-x402` extension | `/openapi.json` |
| LLM-facing summary | `/llms.txt`, `/ai.txt` |
| Crawler policy + sitemap | `/robots.txt`, `/sitemap.xml` |
| Delivery audit | `/deliveries` |

### The conversion path, deliberately built

A buyer agent should be able to verify value **before** it spends anything:

1. `/preview/{id}` returns the **latest-year cross-section for all 20 economies** — real numbers, not
   a teaser — plus the field dictionary and an explicit `paidAdds` list naming exactly what the
   paid document adds (the 2015–2025 panel, per-economy derived analytics, data-quality blocks,
   group statistics, charts, and JSON/CSV delivery).
2. `/schema/report.json` lets it validate the shape of the paid payload against its own parser.
3. `/catalog` states `dataPoints`, `coveragePct`, `latestYear` and all four delivery URLs per report.
4. Only then does it hit a paid URL and meet the 402.

---

## 2. How agent discovery actually works

This is the part that is easy to get wrong, because it does not resemble human SEO at all.

```
a paid route declares a Bazaar discovery extension on its 402 response
        +
someone pays that route for real, on mainnet, through the facilitator
        ↓
the facilitator writes the resource into its Bazaar index
        ↓
GET {facilitator}/discovery/resources?payTo=<address>
        ↓
downstream directories (Agentic.Market and friends) ingest that index
```

Consequences worth internalising:

1. **Listing is a side effect of revenue, not of marketing.** A resource stays absent from the index
   until a real settled payment exists on that network. There is no submission form — the
   facilitator publishes no registration endpoint (checked its OpenAPI 3.1 document directly; only
   `/verify`, `/settle`, `/supported`, `/pricing` and the `/discovery/*` reads exist).
2. **The index is per resource, not per service.** `?payTo=` returns one row per URL. One indexed
   endpoint is enough for an agent to discover the domain and then read `/catalog` for all
   sixty-one; extra indexed endpoints widen the keyword surface.
3. **Only the first five tags survive.** The index truncates. Whatever an agent matches on has to be
   in the first five, so the route's tag list is ordered specific-first. An earlier ordering put
   `world bank / macro data / economic data` first, which crowded out `gdp` and `cpi` entirely —
   a lesson that cost a settlement to learn.
4. **`serviceName` is validated and can come back null.** A value containing a colon was dropped by
   the facilitator; a plain brand name is accepted (verified on the most recent entries). The current
   name is `agentshop`. Rows already in the index still carry whichever name was live when they last
   settled — see the rename note below.
5. **The description field is stored verbatim and is matchable**, so the upstream source is named
   inside it (`Source: World Bank Open Data (CC BY 4.0)`) rather than left implicit.
6. **Index rows never refresh on their own.** Metadata only updates when that resource settles
   again, so a tag fix applies from the next settlement onward.

---

## 3. Current indexing state (verified)

Five endpoints indexed, all with `reliability = 100`:

| Resource | Tags as the index sees them | Metadata |
|---|---|---|
| `/report/macro-forest` | `forest area, forest, deforestation, land use, carbon sink` | current |
| `/report/macro-inflation` | `inflation consumer prices, inflation, cpi, consumer prices, cost of living` | current |
| `/report/macro-patents` | `innovation, basic, worldbank, x402, macro data` | stale |
| `/report/macro-food` | `environment, basic, world bank, macro data, economic data` | stale |
| `/report/macro-gdp` | `output, standard, world bank, macro data, economic data` | stale |

The three marked *stale* were written before the tag reordering and the `serviceName` fix. They will
carry the corrected metadata from their next settlement; nothing else refreshes them.

**Rename note.** The service is now branded `agentshop` (previously `agentshop`). Every
document the service serves — the landing page, `/catalog`, `/agent.json`, the A2A card, the
AI-plugin manifest, the OpenAPI title and the JSON Schema — reports the new name immediately,
because they are all rendered from a single constant in `brand.js`. **Index rows are not.** They are
merchant-facing snapshots written at settlement time, so all five entries keep `serviceName =
"agentshop"` until each endpoint settles again. This changes nothing about how an agent finds
or pays the service (matching runs on tags and description, and both are already correct) — it only
means the old label lingers in the directory until the next settlement per endpoint.

Bazaar context measured the same day: **3,733 listed resources on `eip155:8453`** across roughly
767 hosts and 6,594 catalog entries, with Base far ahead of every other x402 network. Competition is
real but shallow — most hosts list one or two endpoints, and almost none sell a 80-report catalog
with derived analytics and four delivery formats.

Agentic.Market is **not** a mirror of the Bazaar index. It keys one listing per *domain*, exposes no
submission route, and ingests on its own schedule — so the only available action is to poll for our
hostname, which `watch-orders.js` now does on every run.

---

## 4. Cost of widening the index

Each indexed endpoint costs one real settlement at that endpoint's own price. The buyer wallet
performs gasless EIP-3009 transfers, so only USDC is required — the buyer's ETH balance has not
moved across any settlement. The facilitator charges the **seller** per settlement:

- Base mainnet, `eip3009`: **$0.00212 per settlement**, effective 2026-09-21T12:00Z
- Before that timestamp the rate table was empty and settlement was free
- Prices are floored at 10× the fee, so no product can be sold below its own settlement cost

Highest-demand clusters still unindexed, cheapest-first:

| Endpoint | Price | Tags it would contribute |
|---|---|---|
| `/report/macro-health` | $0.08 | `health expenditure, healthcare spending, health system` |
| `/report/macro-electricity-access` | $0.08 | `electricity access, electrification, energy poverty` |
| `/report/macro-population` | $0.09 | `population, demographics, headcount` |
| `/report/macro-gender-parliament` | $0.09 | `gender equality, women in parliament, governance` |
| `/report/macro-air-quality` | $0.11 | `air quality, pm2.5, pollution` |
| `/report/macro-undernourishment` | $0.11 | `food security, undernourishment, hunger` |
| `/report/macro-life-expectancy` | $0.12 | `life expectancy, mortality, public health` |
| `/report/macro-renewable-power` | $0.10 | `renewable electricity, solar, wind` |
| `/report/macro-unemployment` | $0.13 | `unemployment, joblessness, labour market, employment` |
| `/report/custom` | $0.20+ | `bespoke, custom report, any indicator, any economy` |
| `/report/bundle` | $0.95 | `bundle, all reports, full catalog, dataset` |

`macro-unemployment` is now the single highest-value missing cluster — it is one of the three most
common macro retrieval terms and the other two (inflation, gdp) are already indexed.

---

## 5. Seeding an endpoint

```bash
cd report-stripe
# EVM_PRIVATE_KEY in .env must hold USDC on Base mainnet. No ETH needed: EIP-3009 is gasless
# and the facilitator pays the gas.
REPORT_URL=https://reportbazaar.app.workbuddy.host/report/macro-unemployment \
  node agent-pay-client.js
```

Confirm it landed:

```bash
curl -s "https://facilitator.payai.network/discovery/resources?payTo=0xba7efeabfab91a6febc8d8088faa29ce95979b34" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["pagination"]["total"]);[print(" ",r["resource"],r["tags"]) for r in d["items"]]'
```

---

## 6. The $1 ceiling — the hardest commercial constraint found

The official x402 buyer libraries refuse to sign a payment above a per-payment spend cap they apply
**by default**: `@x402/core` ships `DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1"`. The check runs
client-side, before anything reaches the network, and the buyer sees
`All payment requirements were rejected by spendControls.maxAmountPerPayment`. Measured, not
assumed: a **$3.88 bundle was refused outright** by the reference client while every sub-$1 request
went through.

Consequences, all now baked into `pricing.js`:

- Every product is clamped to a **$0.95 ceiling** (`MAX_PAYMENT_USD`). A higher headline price that
  most agents are structurally unable to pay is worth less than a lower price they can.
- The full bundle is priced at the ceiling rather than at a computed discount, so as the catalog
  grows the bundle discount **deepens** — it is now 80 reports for $0.95 against $12.44 itemised,
  a 90% discount, and 3.3 MB of content per dollar.
- Larger purchases are reached by buying several products, not by pricing one product out of reach.
- Category bundles are capped at **$0.60** (`SUBSET_CAP_USD`), below the full-catalog price, so the
  ladder is monotonic: more content always costs more and the whole catalog is always the best
  value per byte.

---

## 7. Revenue accounting you can trust

`/deliveries` is the reconciliation surface: ledger total, unique paid deliveries, and the last
sixty delivery attempts with the reason each was counted or refused.

- `first_delivery` — counted
- `replayed_signature` — the same signed payment arrived again; served, not counted
- `no_payment_signature` — a paid route reached the handler without a payment; refused
- `settlement_rejected:*` — the facilitator refused the presented payment (see below)

A healthy paid delivery produces exactly one `first_delivery` row and moves `totalSales` by one.
The live check after seeding: `totalSales = 6`, `uniquePaidDeliveries = 6`, and the chain agrees —
buyer `0.265535 → 0.005535`, payout `0 → 0.26` across six settlements. **All six are `kind:"self"`
in `orders.json`** — buyer `0x7b6161…` → payout `0xba7efe…` (same controller) — so they seed the
Bazaar index, they are NOT external sales. See the Open items note for the verified `firstExternalOrder`.

**Failed settlements are now diagnosed, not swallowed.** When the facilitator rejects a payment the
middleware answers 402 with a two-byte `{}` and puts the reason only in the `PAYMENT-RESPONSE`
header. A buyer agent receiving `{}` cannot distinguish a shortage of USDC from a transient relayer
failure, so it has no basis for retrying and simply leaves. A middleware that runs *before* the
payment middleware rewrites that empty body into a structured error carrying the facilitator's
`errorReason`, a `retryable` flag, and `howToRetry` — and records the rejection for conversion
analysis. A textbook 402 challenge is left untouched: its body stays `{}` with the requirements in
the `PAYMENT-REQUIRED` header, and the rewrite only activates when a `PAYMENT-RESPONSE` header
proves a payment was actually offered.

Earlier, a single settled payment advanced the counter four times (the middleware buffers the
response until settlement completes, and the reverse proxy retries requests that look slow; each
replay reached the handler). The inflated counters fed the demand factor and raised every price. The
ledger was corrected to chain-verified truth by a one-time epoch migration that ships with the code,
because deployments preserve the container's own volume rather than overwriting it.

---

## 8. What to watch

`watch-orders.js` reports four layers in one pass, scheduled every six hours:

1. **On-chain** — incremental `eth_getLogs` for USDC inbound to the payout address, tagged `self` or
   `external`. The public Base RPC caps `eth_getLogs` at a 2,000-block range, and only filtering by
   recipient address keeps the response under its size cap.
2. **Bazaar index** — listed resources plus per-resource settlement counts and reliability.
3. **Agentic.Market** — whether our hostname has appeared yet.
4. **Service health** — `/catalog` reachability, report count, recorded sales, top sellers.

---

## 9. Buyer quickstart (hand this to a counterparty)

```js
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY); // USDC on Base is enough; no ETH needed
const client = new x402Client().register('eip155:8453', new ExactEvmScheme(signer));
const fetchWithPay = wrapFetchWithPayment(fetch, client);

// Machine-readable delivery, and an Accept header works too:
//   Accept: application/json  →  the JSON payload
//   Accept: text/csv          →  the tidy long panel
const res = await fetchWithPay(
  'https://reportbazaar.app.workbuddy.host/report/macro-gdp?format=json',
);
// 402 challenge -> USDC authorisation -> automatic replay -> 200 with the payload
const payload = await res.json();
console.log(payload.indicators.length, 'indicators', payload.schemaVersion);
```

Look before you pay, no wallet required:

```
https://reportbazaar.app.workbuddy.host/preview/macro-gdp     # 20-economy cross-section
https://reportbazaar.app.workbuddy.host/schema/report.json    # validate the paid shape
https://reportbazaar.app.workbuddy.host/catalog               # prices and data volumes
```

---

## 10. Open items (updated 2026-09-22)

- **On-disk brand residue — RESOLVED.** Every `public/` static discovery snapshot (agent.json, openapi.json,
  schema-report.json, robots.txt, ai.txt, llms.txt, index.html, .well-known/*) and the cached
  `.cache/bundle.html` carried the legacy `DataReport Store` string, because the rename to `agentshop`
  predated the last snapshot build. Fixed: the legacy name is gone from all files. The two snapshot
  paths that were never covered by a dynamic route — `/index.html` and `/schema-report.json` — now
  resolve to live, brand-correct content (landing page, and a 301 to `/schema/report.json`). Every
  discovery endpoint serves `agentshop` and valid JSON (verified locally on :4242).
- **Deployed index rows still carry the previous brand.** The five indexed rows were written at
  settlement time and pick up `agentshop` only on their next settlement. Tags and descriptions that
  agents actually match on are already correct.
- **Hostname moved to `reportbazaar.app.workbuddy.host` (2026-09-23).** The old
  `x402-report-store` host is gone; nothing resolves there any more, and every indexed row, doc and
  generator now names the new host. The hostname lives in exactly one place (`PUBLIC_HOST` in
  `brand.js`) so it cannot go stale in three files again.
- **First external paid verification (2026-09-23).** PayAPI Market paid one real call against
  `/report/macro-patents?format=json` ($0.07, tx `0xef261de3…`) and confirmed the payload matched
  World Bank `IP.PAT.RESD`. Listing is live at `https://payapi.market/api/agentshop`. `/report/macro-gdp`
  stays an unverified sibling — verifying it later is a second paid call, not a second listing.
- **Buyer wallet is drained** — ~0.005535 USDC after seeding five endpoints. Further index widening
  needs a Base-mainnet USDC top-up (no ETH required) before `agent-outreach.js` can trigger a
  re-indexing settlement.
- Optional: setting `P402_API_KEY` adds a p402.io Bazaar submission to `agent-outreach.js`.
  Submitting to Circle's Agent Marketplace intake form would add a second directory.

---

## Discovery channels — the full map (measured 2026-09-23)

An agent cannot buy what its directory does not list, so every channel below is a distribution
decision rather than a marketing one. Status is what is actually true today, not what was attempted.

### x402 directories

| Channel | Mechanism | Cost | Status |
|---|---|---|---|
| **PayAPI Market** | web form + their own paid verification call | free | **LIVE & VERIFIED** — `payapi.market/api/agentshop`, verified against `/report/macro-patents` ($0.07, tx `0xef261de3…`) |
| **x402arena.gg** | `POST core.x402arena.gg/register` (name + endpoint) | free, no auth | **LIVE** — registered 2026-09-23, self-verified on a real 402, `bazaarCompatible: true` |
| **Circle Agent Marketplace** | web intake form + human review | free | **SUBMITTED** — waiting on review |
| **x402-list.com** | `POST /api/v1/submit`, auto-probes for 402, human review | free from own domain | **429 RATE-LIMITED** — one submission per email per 7 days; retry scheduled |
| **Coinbase CDP Bazaar / agentic.market** | no submission endpoint: indexes on settlement + valid Bazaar extension | free | **AUTOMATIC** — every paid route already carries the Bazaar extension; a settlement through a Bazaar-feeding facilitator is the whole trigger |
| **x402scan.com** | one field on `/resources/register`; it reads `{origin}/openapi.json`, lists what it found, then registers on confirm | free | **LIVE & REGISTERED 2026-09-23T11:59Z** — 184 of 184 resources accepted (82 paid + 102 free), 0 deprecated. Origin `78714cd6-a8ec-4c07-b145-3a7fd3c3c837`, listing at [`/server/78714cd6-…`](https://www.x402scan.com/server/78714cd6-a8ec-4c07-b145-3a7fd3c3c837). The write is a browser step (signed by the wallet you are signed in as); type the bare host (`reportbazaar.app.workbuddy.host`, no scheme, no path) |
| **x402scout.com** | `POST /register` | free | **DEAD** — service suspended by its owner (confirmed 2026-09-26); drop from outreach |
| **x402-discovery-api (ouroboros)** | `POST /register` | free | **UNREACHABLE** — same 503 pattern |
| **p402.io Bazaar** | `POST /api/a2a/bazaar` | needs `P402_API_KEY` | **BLOCKED** — no key |
| **blockrun.ai** | gateway that resells upstreams under its own pricing | revenue share | **NOT A DIRECTORY** — listing means becoming an upstream, which changes who the buyer is |

### MCP registries (the second distribution layer)

The service now exposes a real MCP endpoint (`POST /mcp`, streamable HTTP, JSON-RPC 2.0) with six
tools — `search_reports`, `list_catalog`, `list_years`, `preview_report`,
`report_payment_requirements`, `buy_report` — plus a descriptor at `/.well-known/mcp.json`. Free
tools answer inline; the paid ones return the exact quote rather than an error, because a runtime
that cannot see the price cannot decide to pay it.

| Channel | How | Blocker |
|---|---|---|
| **registry.modelcontextprotocol.io** (official) | `mcp-publisher` CLI + a `server.json` with a `remotes[]` entry — remote-only servers are publishable | needs a namespace identity (GitHub login, or a DNS/HTTP challenge on the domain) |
| **smithery.ai / glama.ai / mcp.so / pulsemcp.com** | downstream directories that ingest the official registry or crawl a GitHub repo | all key off a public repository |

**The one prerequisite that unlocks four registries at once: a public GitHub repository.** Publish a
`server.json` (and `smithery.yaml` for Smithery) there, publish to the official registry, and the
downstream directories pick it up from the feed instead of one submission at a time.

### What is already in place for every channel

- OpenAPI 3.1 with `x-payment-info` on every paid operation and `security: []` on every free one —
  the two markers x402scan-type crawlers read to classify an operation.
- `/.well-known/x402`, `/.well-known/agent.json` (A2A card), `/.well-known/ai-plugin.json`,
  `/.well-known/mcp.json`.
- Bazaar discovery extension on every paid route, with a description naming the upstream source.
- `llms.txt` (index) and `llms-full.txt` (the whole corpus, ~114 KB, no pagination), `ai.txt`,
  `robots.txt` that explicitly welcomes every retrieval crawler, and a sitemap of 278 URLs including
  one per year.
- `/start` for the human and agent decision, `/years` for the year axis, `/preview/{id}?format=md`
  for answer engines.

### The rule that decides whether a registry can see you at all (measured 2026-09-23)

Every discovery implementation in this space enumerates `openapi.json` **path by path** and then
probes each URL **as written**. A parameterised path is therefore discovered literally: `/report/{id}`
is turned into the URL `https://host/report/{id}`, whose probe answers 404, and the resource is
dropped. One template can hide an entire catalogue no matter how good the 402 behind it is.

The contract had `/report/{id}` with an `enum` of 74 ids, and the registry saw exactly one resource
for it — a dead URL. It now publishes one concrete path per product: 82 paid report endpoints, each
with its own fixed price, plus 82 free `/preview/<id>` cross-sections, 11 free `/years/<year>` entries
and the service helpers. Same routes, same server code, 184 discoverable resources instead of 12.

Two things worth keeping:

- **The dry run is public and free.** `GET /api/trpc/public.resources.checkDiscovery?input={"json":{"origin":"<origin>"}}`
  on x402scan returns exactly what its registration would find — `found`, `source`, and one object per
  resource with `url`, `method`, `authMode` and `pricing`. It needs no wallet, no SIWX and no account,
  so it is the check to run before touching the form. The same library is on npm as
  `@agentcash/discovery` (`discoverOriginSchema({ target })`) if you would rather run it locally —
  point `target` at `http://127.0.0.1:<port>` and it works before anything is deployed.
- **`authMode` is decided by the document, not by the service.** `x-payment-info` on an operation
  makes it paid and it gets probed; `security: []` makes it free and it is catalogued **without** a
  probe (but only alongside a paid resource that registered in the same batch); anything declaring
  neither is probed and can fail. So free endpoints should be declared, not left blank — an undeclared
  free endpoint is a failed row.
