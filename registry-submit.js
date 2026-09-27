// registry-submit.js — push this service onto the x402 directories that accept a self-submission
// (machine-to-machine, no browser, no CDP). This is the "outreach to the discovery layer" half of
// agent marketing: an agent cannot buy what its directory does not list.
//
// The landscape, measured 2026-09-23 from each directory's own docs:
//
//   x402-list.com   POST /api/v1/submit — open API, free for a first submission from your own
//                   domain, one submission per email every 7 days, then human review. Endpoints
//                   are auto-probed for a real HTTP 402 before any review happens. A service on a
//                   free compute host (vercel.app, workers.dev, …) costs $1, a resubmission inside
//                   14 days of a rejection costs $0.50; our own domain is neither, so it is free.
//   x402scout.com   POST /register — free, no auth. Frequently 503; a failure here is not fatal.
//   x402arena.gg    POST /register (core.x402arena.gg) — free, no auth, no on-chain proof. The
//                   arena health-checks the endpoint itself and marks it verified once it 402s.
//   p402.io         POST /api/a2a/bazaar — needs P402_API_KEY.
//   <custom>        any registry/webhook URL in AGENT_REGISTRIES receives the manifest.
//
// Directories that were reachable when this file was written but are not targets here:
//
//   x402scout.com / x402-discovery-api.onrender.com   both on Render's free tier and observed
//                   returning 503 for extended stretches; a 503 is a sleeping service, not a
//                   rejection, so they are retried rather than treated as done.
//   agentic.market  no submission endpoint at all. It is a public front-end over the Coinbase CDP
//                   Bazaar, which indexes automatically once a payment settles through a facilitator
//                   that feeds the Bazaar (PayAI does). Nothing to POST; the lever is a settlement,
//                   and we have one.
//   blockrun.ai     a gateway that resells models and APIs under its own pricing, not a directory.
//                   Listing would mean becoming one of its upstreams, which changes who the buyer is.
//
// Two directories cannot be reached from a script at all and are reported rather than attempted:
//
//   x402scan.com    registration is SIWX-gated — the challenge is signed by the wallet you are
//                   signed in as, i.e. in a browser session, not from this machine. It is a single
//                   field: the bare host, no scheme and no path. The form runs its own discovery
//                   pass first, and that pass is reproducible from here for free — see the
//                   checkDiscovery URL in the manual_only report below.
//   payapi.market   web form only; the docs state there is no programmatic submission endpoint.
//
// MCP registries (a second, separate distribution layer — see /.well-known/mcp.json):
//
//   registry.modelcontextprotocol.io   official registry. Namespace ownership is proven with GitHub
//                   login or a DNS/HTTP challenge on the domain; publishing needs the
//                   `mcp-publisher` CLI. A remote-only server is publishable via `remotes[]`, so
//                   this is open to us once a namespace identity is available.
//   smithery.ai / glama.ai / mcp.so / pulsemcp.com   downstream directories that ingest the official
//                   registry or a GitHub repository. All of them key off a public repo, so they
//                   follow the same prerequisite.
//
// Usage:
//   node registry-submit.js                # dry run: build every payload, send nothing
//   node registry-submit.js --live         # actually submit
//   node registry-submit.js --live --only x402-list
//
// Output: registry-report.json plus a console summary.

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { publicBase } from './brand.js';
import { CATALOG, CATEGORIES, ALL_INDICATOR_CODES } from './catalog.js';

const ARGS = process.argv.slice(2);
const LIVE = ARGS.includes('--live');
const onlyIdx = ARGS.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(ARGS[onlyIdx + 1].split(',').map((s) => s.trim())) : null;

const BASE = publicBase();
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'xingchenguang@agent.qq.com';
const SERVICE = process.env.SERVICE_NAME || 'agentshop';
const CATEGORY = 'Data';

// The reachable, durable endpoint set. Breadth here is what widens the keyword surface a directory
// can match an agent's intent against, so the unindexed demand clusters are listed alongside the
// five endpoints the facilitator already knows about.
const ENDPOINTS = [
  // already in the facilitator's index
  '/report/macro-gdp',
  '/report/macro-inflation',
  '/report/macro-patents',
  '/report/macro-food',
  '/report/macro-forest',
  // highest-demand clusters still unindexed anywhere
  '/report/macro-unemployment',
  '/report/macro-life-expectancy',
  '/report/macro-population',
  '/report/macro-health',
  '/report/macro-air-quality',
  '/report/macro-undernourishment',
  '/report/macro-renewable-power',
  '/report/macro-electricity-access',
  '/report/macro-gender-parliament',
  // annual editions — the year axis, so a directory can match "the 2024 economy"
  '/report/yearbook-2024',
  '/report/yearbook-2025',
  // parameterised + aggregate
  '/report/custom',
  '/report/bundle',
  // new dimensions (region / pair / shock) — keep the directory surface in step with the catalog
  '/report/region-apac',
  '/report/region-europe',
  '/report/region-latam',
  '/report/region-em',
  '/report/region-na',
  '/report/pair-us-cn',
  '/report/pair-gb-eu',
  '/report/pair-cn-in',
  '/report/shock-covid',
  '/report/shock-inflation',
  '/report/shock-commodity',
];

// Counts are read from the catalog, not typed in: the previous submission copy still advertised
// "61 prebuilt reports" after the catalog had grown past seventy, and a directory listing is
// rejected for being wrong far more often than for being short.
const REPORT_COUNT = Object.keys(CATALOG).length;
const CATEGORY_COUNT = CATEGORIES.length;
const INDICATOR_COUNT = ALL_INDICATOR_CODES.length;
const ECONOMY_COUNT = Math.max(...Object.values(CATALOG).map((d) => (d.countries || []).length));

const DESCRIPTION =
  `${SERVICE} sells analytical macro-economic reports per fetch over x402 (USDC on Base mainnet). `
  + `${REPORT_COUNT} prebuilt World Bank reports across ${CATEGORY_COUNT} categories, ${INDICATOR_COUNT} indicators, `
  + `${ECONOMY_COUNT} economies, covering every year from 2015 to 2025, plus annual editions and a bespoke `
  + `endpoint that builds a report from any indicator and economy. Delivery is html, json, or tidy csv. `
  + `Free machine-readable previews at /preview/{id} (also markdown), a browsable year index at /years, `
  + `and an MCP endpoint at /mcp. No account, no API key, no signup: an unpaid request returns HTTP 402 `
  + `with the price and a valid request returns the document. `
  + `Source: World Bank Open Data (CC BY 4.0), attributed in every document.`;

const NOTES =
  `Full catalog with live prices is machine-readable at ${BASE}/catalog. `
  + `Free preview of any report (latest-year cross-section for all ${ECONOMY_COUNT} economies, no wallet needed) `
  + `at ${BASE}/preview/{id}; agent-facing summary at ${BASE}/llms.txt and ${BASE}/openapi.json. `
  + `The 16 paths above are the highest-demand subset - all ${REPORT_COUNT} reports are reachable via /report/{id} `
  + `and are enumerated in /catalog.`;

const report = {
  at: new Date().toISOString(),
  live: LIVE,
  base: BASE,
  contactEmail: CONTACT_EMAIL,
  endpointsSubmitted: ENDPOINTS.length,
  steps: [],
};

function log(o) {
  report.steps.push(o);
  console.log(JSON.stringify(o));
}

async function post(url, body, { headers = {}, label = url } = {}) {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    const text = await r.text().catch(() => '');
    return {
      label,
      httpStatus: r.status,
      ms: Date.now() - started,
      paymentRequired: r.headers.get('payment-required') ? true : undefined,
      body: text.slice(0, 600),
    };
  } catch (e) {
    return { label, ok: false, error: e.message, ms: Date.now() - started };
  }
}

const want = (name) => !ONLY || ONLY.has(name);

// ---------------------------------------------------------------------------------------------
// 0) Pre-flight: the directory will probe our endpoints, so prove one answers a valid 402 first.
// ---------------------------------------------------------------------------------------------
try {
  const probe = await fetch(`${BASE}/report/macro-gdp`);
  const hdr = probe.headers.get('payment-required') || '';
  let decoded = null;
  if (hdr) {
    try { decoded = JSON.parse(Buffer.from(hdr, 'base64').toString('utf8')); } catch { /* not base64 */ }
  }
  const accepts = decoded?.accepts?.[0] || {};
  log({
    step: 'preflight_402',
    httpStatus: probe.status,
    challengeValid: probe.status === 402 && Boolean(hdr),
    network: accepts.network || null,
    asset: accepts.asset || null,
    payTo: accepts.payTo || null,
    serviceName: decoded?.extensions?.bazaar?.info?.merchant?.name || decoded?.resource?.serviceName || null,
    note: probe.status === 402
      ? 'A directory that probes this endpoint will see a valid x402 challenge.'
      : 'WARNING: the endpoint did not answer 402 - do not submit until this is fixed.',
  });
} catch (e) {
  log({ step: 'preflight_402', ok: false, error: e.message });
}

// ---------------------------------------------------------------------------------------------
// 0b) Is the LIVE deployment actually current? The service is reachable either way, so a stale
//     build would be submitted silently. Check the three markers the last round of changes added,
//     and refuse to submit live until they are present.
// ---------------------------------------------------------------------------------------------
let liveCurrent = null;
try {
  const oaRes = await fetch(`${BASE}/openapi.json`, { signal: AbortSignal.timeout(25000) });
  const oa = await oaRes.json().catch(() => null);
  const ops = Object.values(oa?.paths || {}).flatMap((p) => Object.values(p)).filter((o) => o && typeof o === 'object');
  const paidWithInfo = ops.filter((o) => o['x-payment-info']).length;
  const freeMarked = ops.filter((o) => Array.isArray(o.security) && o.security.length === 0).length;

  let startStatus = null;
  try {
    startStatus = (await fetch(`${BASE}/start`, { signal: AbortSignal.timeout(25000) })).status;
  } catch { /* left null */ }

  const markers = {
    openapi_x_guidance: Boolean(oa?.info?.['x-guidance']),
    openapi_contact_email: Boolean(oa?.info?.contact?.email),
    paid_ops_with_x_payment_info: paidWithInfo,
    free_ops_marked_security_empty: freeMarked,
    conversion_entry_start: startStatus === 200,
  };
  liveCurrent = markers.openapi_x_guidance
    && markers.openapi_contact_email
    && paidWithInfo > 0
    && freeMarked > 0
    && markers.conversion_entry_start;

  log({
    step: 'live_deployment_current',
    current: liveCurrent,
    markers,
    note: liveCurrent
      ? 'The live deployment carries the current discovery contract and the /start entry point.'
      : 'The live deployment is BEHIND the local code. The three x402-list markers that matter: '
        + 'info.x-guidance, info.contact.email and /start all come from the same build. Submitting '
        + 'anyway would advertise a stale storefront, and the outreach copy that points at those '
        + 'fields would be false. Redeploy first.',
  });
} catch (e) {
  log({ step: 'live_deployment_current', ok: false, error: e.message });
}

// Every outbound submission is gated on the live deployment being current. The service answers 402
// either way, so without this gate a stale build would be submitted silently. --force overrides.
const STALE_BLOCKED = LIVE && liveCurrent === false && !ARGS.includes('--force');
function guard(name) {
  if (!STALE_BLOCKED) return false;
  log({ step: name, skipped: true, reason: 'live deployment is stale; redeploy first, or pass --force' });
  return true;
}

// ---------------------------------------------------------------------------------------------
// 1) x402-list.com — the open API, free from our own domain.
// ---------------------------------------------------------------------------------------------
if (want('x402-list') && !guard('x402-list')) {
  const body = {
    url: BASE,
    email: CONTACT_EMAIL,
    service_name: SERVICE,
    description: DESCRIPTION,
    website_url: BASE,
    category: CATEGORY,
    endpoints: ENDPOINTS,
    notes: NOTES,
  };
  if (!LIVE) {
    log({ step: 'x402-list', dryRun: true, url: 'https://x402-list.com/api/v1/submit', body });
  } else {
    log({ step: 'x402-list', ...(await post('https://x402-list.com/api/v1/submit', body, { label: 'x402-list' })) });
  }
}

// ---------------------------------------------------------------------------------------------
// 2) x402scout.com — free registration, no auth. Historically flaky (503).
// ---------------------------------------------------------------------------------------------
if (want('x402scout') && !guard('x402scout')) {
  const body = {
    name: SERVICE,
    url: `${BASE}/report/macro-gdp`,
    price_usd: 0.13,
    category: 'data',
    description: DESCRIPTION,
    network: 'base-mainnet',
  };
  if (!LIVE) {
    log({ step: 'x402scout', dryRun: true, url: 'https://x402scout.com/register', body });
  } else {
    log({ step: 'x402scout', ...(await post('https://x402scout.com/register', body, { label: 'x402scout' })) });
  }
}

// ---------------------------------------------------------------------------------------------
// 3) x402arena.gg — free registration, no auth, no on-chain proof. It health-checks the endpoint
// itself and flips `verified` once it sees a real 402, so registration is a single POST.
// ---------------------------------------------------------------------------------------------
if (want('x402arena') && !guard('x402arena')) {
  const body = {
    name: `${SERVICE}-macro-reports`,
    endpoint: `${BASE}/report/macro-gdp`,
    niche: 'data',
    description: DESCRIPTION,
    walletAddress: process.env.PAYOUT_ADDRESS,
    website: `${BASE}/`,
  };
  if (!LIVE) {
    log({ step: 'x402arena', dryRun: true, url: 'https://core.x402arena.gg/register', body });
  } else {
    log({ step: 'x402arena', ...(await post('https://core.x402arena.gg/register', body, { label: 'x402arena' })) });
  }
}

// ---------------------------------------------------------------------------------------------
// 4) p402.io Bazaar — needs a key.
// ---------------------------------------------------------------------------------------------
if (want('p402') && !guard('p402')) {
  const key = process.env.P402_API_KEY;
  if (!key) {
    log({ step: 'p402', skipped: true, reason: 'P402_API_KEY not set' });
  } else {
    const body = {
      agent_card_url: `${BASE}/.well-known/agent.json`,
      openapi_url: `${BASE}/openapi.json`,
      category: 'data',
      pricing: { currency: 'USDC', network: process.env.NETWORK || 'eip155:8453' },
    };
    if (!LIVE) {
      log({ step: 'p402', dryRun: true, url: 'https://p402.io/api/a2a/bazaar', body });
    } else {
      log({
        step: 'p402',
        ...(await post('https://p402.io/api/a2a/bazaar', body, {
          headers: { authorization: `Bearer ${key}` },
          label: 'p402',
        })),
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4) Any custom registries / webhooks.
// ---------------------------------------------------------------------------------------------
if (want('custom') && !guard('custom')) {
  const list = (process.env.AGENT_REGISTRIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) {
    log({ step: 'custom', skipped: true, reason: 'AGENT_REGISTRIES not set' });
  }
  for (const url of list) {
    const body = { manifest: { base: BASE, endpoints: ENDPOINTS, description: DESCRIPTION } };
    if (!LIVE) {
      log({ step: 'custom', dryRun: true, url, body });
    } else {
      log({ step: 'custom', ...(await post(url, body, { label: url })) });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 5) Reported, not attempted — these have no scriptable door.
// ---------------------------------------------------------------------------------------------
log({
  step: 'manual_only',
  x402scan: {
    status: 'LIVE — registered 2026-09-23T11:59Z, 184 of 184 resources accepted',
    originId: '78714cd6-a8ec-4c07-b145-3a7fd3c3c837',
    listingUrl: 'https://www.x402scan.com/server/78714cd6-a8ec-4c07-b145-3a7fd3c3c837',
    reason: 'Registration writes are SIWX-gated: the challenge is signed by the wallet you are '
      + 'signed in as, in a browser session. .env holds only the local test buyer key, so this cannot '
      + 'be signed from here — but the whole step is one input field.',
    toDo: [
      'Already done. Re-run only after the catalog changes materially: open '
      + 'https://www.x402scan.com/resources/register while signed in with a wallet',
      `Type the bare host — no scheme, no path: ${BASE.replace(/^https?:\/\//, '')} — then Add`,
      'The button pre-counts what it found, but the number it registers can be larger: it showed '
      + '"Add API (114 resources)" and then reported "Successfully registered 184 of 184 resources"',
      'Dry-run the discovery for free, no wallet needed: '
      + `GET https://www.x402scan.com/api/trpc/public.resources.checkDiscovery?input=${encodeURIComponent(JSON.stringify({ json: { origin: BASE, bustCache: false } }))}`,
      'Read the stored result back: '
      + 'GET https://www.x402scan.com/api/trpc/public.origins.getMetadata?input=' +
      encodeURIComponent(JSON.stringify({ json: '78714cd6-a8ec-4c07-b145-3a7fd3c3c837' }))
      + ' — resources[184] = 82 with accepts + 102 free',
      'Free rows are stored but not returned by origins.search (it filters on accepts), so a search '
      + 'for the host shows only the 82 paid endpoints. That is expected, not a partial registration.',
      'Why every report and every year is a concrete path in openapi.json: a parameterised path is '
      + 'discovered literally (`/report/{id}` becomes a URL whose probe 404s), so a template hides '
      + 'the whole catalog from the registry',
    ],
    contactEmailPublished: `${BASE}/openapi.json -> info.contact.email`,
  },
  payapi_market: {
    reason: 'Free listing, but the docs state plainly that there is no programmatic submission '
      + 'endpoint - the /list form is the only door.',
    toDo: ['Open https://payapi.market/list and file the form (name, email, Base USDC wallet, '
      + `base URL ${BASE}, price per request, the paid route /report/macro-gdp)`],
  },
  circle_agent_marketplace: {
    reason: 'Manual intake form + human review, and the payout wallet is sanctions-screened.',
    toDo: ['Submit at https://developers.circle.com/agent-stack/agent-marketplace/get-listed '
      + '(prerequisites: a 402-answering service, a published OpenAPI spec, a payout address - all met)'],
  },
  awesome_lists: {
    reason: 'Free PRs to the curated GitHub lists; no tooling, needs a GitHub identity.',
    toDo: ['PR the entry in awesome-x402-pr.md against github.com/xpaysh/awesome-x402'],
  },
});

writeFileSync('registry-report.json', JSON.stringify(report, null, 2), 'utf8');
// A step counts as failed only when it errored outright or a registry answered 4xx/5xx. The
// preflight is excluded on purpose: its 402 is the success condition, not a failure.
const failed = report.steps.filter(
  (s) => s.step !== 'preflight_402' && (s.ok === false || (s.httpStatus && s.httpStatus >= 400)),
).length;
console.log(
  `\nregistry-submit ${LIVE ? '(LIVE)' : '(dry run)'}: ${report.steps.length} step(s), ${failed} failed. `
  + `Detail in registry-report.json`,
);
if (!LIVE) console.log('Nothing was sent. Re-run with --live to submit.');
