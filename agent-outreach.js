// agent-outreach.js — broadcast this service to the agent-facing discovery layer (machine-to-machine).
//
// The x402 discovery path is: a valid Bazaar discovery extension on every paid route, plus at least
// one real settlement on the production network. Once both hold, the facilitator's discovery index
// lists the resources and downstream agent directories (Agentic.Market and others) pick them up.
// This script verifies each condition rather than assuming it, then optionally pushes to registries
// that require an explicit registration call.
//
// Usage:
//   PUBLIC_URL=https://your-host node agent-outreach.js
//   Optional environment variables:
//     P402_API_KEY      — when set, registers with the p402.io Bazaar (POST /api/a2a/bazaar)
//     AGENT_REGISTRIES  — comma-separated registry/webhook URLs; the service manifest is POSTed to each
//     BUYER_PRIVATE_KEY — when set, triggers one real settlement (a Bazaar indexing condition)
//
// Output: outreach-report.json plus a console summary.

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { publicBase } from './brand.js';

const BASE = publicBase();
const NETWORK = process.env.NETWORK || 'eip155:8453'; // Base mainnet
const PAYOUT_ADDRESS = (process.env.PAYOUT_ADDRESS || '').toLowerCase();
const FACILITATOR_URL = (process.env.FACILITATOR_URL || 'https://facilitator.payai.network').replace(/\/$/, '');

const report = { at: new Date().toISOString(), base: BASE, network: NETWORK, payTo: PAYOUT_ADDRESS, steps: [] };
const log = (o) => { report.steps.push(o); console.log(JSON.stringify(o)); };

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

// 1) The discovery surface this service publishes. Every one of these must be publicly reachable,
//    because that is what a crawler or an agent directory reads.
let manifest = null, card = null, openapi = null, llms = null;
const DISCOVERY_PATHS = [
  '/catalog', '/search?q=gdp', '/indicators', '/agent.json', '/.well-known/agent.json',
  '/.well-known/x402', '/.well-known/ai-plugin.json', '/openapi.json', '/llms.txt', '/ai.txt',
  '/robots.txt', '/sitemap.xml',
];
try {
  const checks = {};
  for (const p of DISCOVERY_PATHS) {
    try {
      const r = await fetch(`${BASE}${p}`, { signal: AbortSignal.timeout(25000) });
      checks[p] = r.status;
    } catch (e) {
      checks[p] = `ERR ${e.message}`;
    }
  }
  manifest = (await getJson(`${BASE}/agent.json`)).json;
  card = (await getJson(`${BASE}/.well-known/agent.json`)).json;
  openapi = (await getJson(`${BASE}/openapi.json`)).json;
  llms = await fetch(`${BASE}/llms.txt`, { signal: AbortSignal.timeout(25000) }).then((r) => (r.ok ? r.text() : ''));
  const failed = Object.entries(checks).filter(([, s]) => s !== 200);
  log({
    step: 'discovery_surface',
    endpoints: checks,
    allReachable: failed.length === 0,
    failed: failed.map(([p, s]) => `${p} -> ${s}`),
    reports: manifest?.reports?.length ?? 0,
    skills: card?.skills?.length ?? 0,
    openapiPaths: Object.keys(openapi?.paths || {}).length,
    llmsTxtBytes: llms.length,
  });
} catch (e) {
  log({ step: 'discovery_surface', ok: false, error: e.message });
}

// 2) Self-check the Bazaar discovery extension on a paid route. Both a fixed report and the
//    parameterised endpoint are checked, because indexing treats them as separate resources.
try {
  const targets = [
    manifest?.reports?.[0]?.endpoint || '/report/macro-gdp',
    '/report/custom?indicators=NY.GDP.MKTP.CD&countries=US,CN',
    '/report/bundle',
  ];
  const results = [];
  for (const t of targets) {
    const r = await fetch(`${BASE}${t}`);
    const hdr = r.headers.get('payment-required') || '';
    let decoded = null, bazaarOk = false;
    if (hdr) {
      try {
        decoded = JSON.parse(Buffer.from(hdr, 'base64').toString('utf8'));
        bazaarOk = Boolean(decoded?.extensions?.bazaar?.schema);
      } catch { /* leave bazaarOk false */ }
    }
    results.push({
      endpoint: t,
      httpStatus: r.status,
      price: decoded?.accepts?.[0]?.amount ? `$${(Number(decoded.accepts[0].amount) / 1e6).toFixed(2)}` : null,
      bazaarExtensionValid: bazaarOk,
      tags: decoded?.extensions?.bazaar?.info?.input?.queryParams ? Object.keys(decoded.extensions.bazaar.info.input.queryParams) : [],
    });
  }
  log({
    step: 'bazaar_selfcheck',
    results,
    allValid: results.every((r) => r.httpStatus === 402 && r.bazaarExtensionValid),
  });
} catch (e) {
  log({ step: 'bazaar_selfcheck', ok: false, error: e.message });
}

// 3) Facilitator discovery index — the authoritative listing for x402 resources. A resource appears
//    here only after at least one genuine settlement on that network.
try {
  const u = `${FACILITATOR_URL}/discovery/resources?payTo=${PAYOUT_ADDRESS}`;
  const s = await getJson(u);
  const items = s.json?.items || [];
  log({
    step: 'facilitator_index_check',
    url: u,
    apiStatus: s.status,
    indexed: items.length > 0,
    listedResources: items.length,
    resources: items.map((i) => i.resource).slice(0, 50),
    note: items.length
      ? 'Listed. Agent directories that consume the facilitator index will surface these resources.'
      : 'Not listed yet. The index requires a valid Bazaar extension (present) AND at least one real settlement on ' +
        `${NETWORK}. Until a genuine payment settles, no index entry is created.`,
  });
} catch (e) {
  log({ step: 'facilitator_index_check', ok: false, error: e.message });
}

// 4) Secondary directory: Agentic.Market's read-only discovery API. Listing there is derivative of
//    the facilitator index, so this is a status check rather than a submission.
try {
  const host = new URL(BASE).host;
  const s = await getJson(`https://api.agentic.market/v1/services/search?q=${encodeURIComponent(host)}`);
  const hits = (s.json?.services || []).filter((x) => (x.domain || '').includes(host));
  log({
    step: 'agentic_market_index_check',
    apiStatus: s.status,
    indexed: hits.length > 0,
    hits: hits.map((h) => h.name),
    note: hits.length ? '' : 'Derivative of the facilitator index; it follows automatically after the first settlement.',
  });
} catch (e) {
  log({ step: 'agentic_market_index_check', ok: false, error: e.message });
}

// 5) Active registration: p402.io Bazaar (requires P402_API_KEY).
try {
  const key = process.env.P402_API_KEY;
  if (!key) {
    log({ step: 'register_p402', skipped: true, reason: 'P402_API_KEY not set; when set this step POSTs https://p402.io/api/a2a/bazaar' });
  } else {
    const body = {
      agent_card_url: `${BASE}/.well-known/agent.json`,
      openapi_url: `${BASE}/openapi.json`,
      category: 'data',
      pricing: { currency: 'USDC', network: NETWORK },
    };
    const r = await fetch('https://p402.io/api/a2a/bazaar', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    log({ step: 'register_p402', httpStatus: r.status, body: await r.text().then((t) => t.slice(0, 300)).catch(() => '') });
  }
} catch (e) {
  log({ step: 'register_p402', ok: false, error: e.message });
}

// 6) Active registration: custom registries / webhooks (AGENT_REGISTRIES, comma-separated).
try {
  const list = (process.env.AGENT_REGISTRIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) {
    log({ step: 'register_custom', skipped: true, reason: 'AGENT_REGISTRIES not set (comma-separated registry URLs)' });
  }
  for (const url of list) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest, agentCard: card, openapi, llmsTxt: llms.slice(0, 4000) }),
      });
      log({ step: 'register_custom', url, httpStatus: r.status, body: (await r.text()).slice(0, 200) });
    } catch (e) {
      log({ step: 'register_custom', url, ok: false, error: e.message });
    }
  }
} catch (e) {
  log({ step: 'register_custom', ok: false, error: e.message });
}

// 7) Trigger one real settlement — the remaining Bazaar indexing condition.
try {
  const pk = process.env.BUYER_PRIVATE_KEY;
  if (!pk) {
    log({ step: 'settle_trigger', skipped: true, reason: 'BUYER_PRIVATE_KEY not set; when set one real x402 payment is issued to trigger indexing' });
  } else {
    const signer = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
    const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
    const fetchWithPay = wrapFetchWithPayment(fetch, client);
    const target = `${BASE}${manifest?.reports?.[0]?.endpoint || '/report/macro-gdp'}`;
    const res = await fetchWithPay(target);
    const body = await res.text();
    log({ step: 'settle_trigger', url: target, httpStatus: res.status, bytes: body.length, settled: res.status === 200 });
  }
} catch (e) {
  log({ step: 'settle_trigger', ok: false, error: e.message });
}

writeFileSync('outreach-report.json', JSON.stringify(report, null, 2), 'utf8');
const failedSteps = report.steps.filter((s) => s.ok === false).length;
console.log(`\nOutreach finished: ${report.steps.length} step(s), ${failedSteps} with errors. Detail written to outreach-report.json`);
