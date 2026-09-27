// telemetry.js — demand sensing.
//
// The ledger answers "who paid". It cannot answer the two questions that actually decide what to
// build next: what did agents look for and not find, and which products did they inspect and then
// decline. Those signals exist only for a moment, inside the request that produced them, and are
// thrown away unless something records them. This module is that something.
//
// Everything here is derived from requests the service already serves. It records no identifiers,
// no IP addresses and no payment payloads — only the shape of the demand: which endpoint, which
// query, which stage of the funnel.
//
// Storage is per-network for the same reason the ledger is: a local testnet run must not teach the
// production pricing model that test traffic is demand. Writes are throttled and every list is
// bounded, so the file cannot grow without limit on a container volume.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const ACTIVE_NETWORK = process.env.NETWORK || 'eip155:8453';
const MAINNET = 'eip155:8453';
const DIR =
  process.env.LEDGER_DIR ||
  (ACTIVE_NETWORK === MAINNET ? '.cache' : `.cache/net-${ACTIVE_NETWORK.replace(/[^a-z0-9]/gi, '_')}`);
const FILE = `${DIR}/telemetry.json`;

// Bounds. Search strings and miss paths are the only unbounded-in-principle fields, so they are the
// only ones capped; aggregate counters are naturally bounded by the catalog size.
const MAX_SEARCHES = 400;
const MAX_MISSES = 300;
const MAX_CUSTOM = 200;
const FLUSH_MS = 2000;

const EMPTY = () => ({
  since: new Date().toISOString(),
  updatedAt: null,
  counters: {
    challenge: 0,
    preview: 0,
    sample: 0,
    paid: 0,
    search: 0,
    searchMiss: 0,
    miss: 0,
    customRequest: 0,
    blocked: 0,
  },
  // Per-endpoint aggregates. This is what the pricing and ranking logic reads.
  endpoints: {},
  // Raw demand signal, newest last.
  searches: [],
  misses: [],
  customRequests: [],
});

let state = null;
let dirty = false;
let flushTimer = null;

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function load() {
  if (state) return state;
  ensureDir();
  if (existsSync(FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
      state = { ...EMPTY(), ...parsed, counters: { ...EMPTY().counters, ...(parsed.counters || {}) } };
      return state;
    } catch {
      /* corrupt file is not worth failing a request over */
    }
  }
  state = EMPTY();
  return state;
}

// Writes are throttled: a request path must never wait on telemetry, and a burst of crawler traffic
// should not turn into a burst of disk writes. A process that dies between flushes loses at most a
// couple of seconds of signal, which is an acceptable trade for never slowing a paid delivery.
function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function flushNow() {
  if (!dirty || !state) return;
  try {
    ensureDir();
    state.updatedAt = new Date().toISOString();
    writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
    dirty = false;
  } catch {
    /* telemetry must never break delivery */
  }
}

function endpointBucket(id) {
  const s = load();
  const key = String(id || 'unknown').slice(0, 80);
  if (!s.endpoints[key]) {
    s.endpoints[key] = {
      challenge: 0,
      preview: 0,
      sample: 0,
      paid: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: null,
    };
  }
  return s.endpoints[key];
}

function touch(bucket) {
  bucket.lastSeen = new Date().toISOString();
}

// ---------------------------------------------------------------- writers

// A 402 was issued. The weakest intent signal, but it is the top of the funnel and the only one
// every prospective buyer passes through, so it is what conversion rates are measured against.
export function recordChallenge(id) {
  const s = load();
  const b = endpointBucket(id);
  b.challenge += 1;
  touch(b);
  s.counters.challenge += 1;
  scheduleFlush();
}

// A free preview or sample was fetched. Much stronger than a challenge: the agent read the field
// dictionary and the "what the paid version adds" list and is now deciding.
export function recordView(kind, id) {
  const s = load();
  const b = endpointBucket(id);
  if (kind === 'preview') {
    b.preview += 1;
    s.counters.preview += 1;
  } else {
    b.sample += 1;
    s.counters.sample += 1;
  }
  touch(b);
  scheduleFlush();
}

// A paid delivery. Weighted far above everything else by the ranking, because it is the only signal
// a buyer put money behind.
export function recordPaid(id) {
  const s = load();
  const b = endpointBucket(id);
  b.paid += 1;
  touch(b);
  s.counters.paid += 1;
  scheduleFlush();
}

// A search. `hits === 0` is the single most valuable record in this file: it is an agent stating,
// in its own words, a product the catalog does not have.
export function recordSearch(query, hits) {
  const s = load();
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return;
  s.counters.search += 1;
  if (!hits) s.counters.searchMiss += 1;
  s.searches.push({ q, hits: Number(hits) || 0, at: new Date().toISOString() });
  if (s.searches.length > MAX_SEARCHES) s.searches = s.searches.slice(-MAX_SEARCHES);
  scheduleFlush();
}

// A request for a path that does not exist. A 404 on /report/<something-we-do-not-sell> is an agent
// guessing at a product, which is demand expressed as a failed request.
export function recordMiss(path) {
  const s = load();
  const p = String(path || '').slice(0, 160);
  if (!p) return;
  s.counters.miss += 1;
  s.misses.push({ path: p, at: new Date().toISOString() });
  if (s.misses.length > MAX_MISSES) s.misses = s.misses.slice(-MAX_MISSES);
  scheduleFlush();
}

// A bespoke report request. The requested indicator set is the clearest statement of what a buyer
// wants that the fixed catalog could ever receive — if the same combination keeps appearing, it
// should stop being bespoke and become a product.
export function recordCustomRequest({ indicators = [], countries = [], years = null, paid = false } = {}) {
  const s = load();
  s.counters.customRequest += 1;
  s.customRequests.push({
    indicators: (Array.isArray(indicators) ? indicators : []).slice(0, 40),
    countryCount: Array.isArray(countries) ? countries.length : Number(countries) || 0,
    years: years || null,
    paid: Boolean(paid),
    at: new Date().toISOString(),
  });
  if (s.customRequests.length > MAX_CUSTOM) s.customRequests = s.customRequests.slice(-MAX_CUSTOM);
  scheduleFlush();
}

// A delivery refused because the payment did not settle. Not demand, but friction: repeated entries
// against one endpoint mean buyers want it and cannot complete the purchase.
export function recordBlocked(id, reason) {
  const s = load();
  const b = endpointBucket(id);
  b.blocked = (b.blocked || 0) + 1;
  b.lastBlockReason = String(reason || 'unknown').slice(0, 80);
  touch(b);
  s.counters.blocked += 1;
  scheduleFlush();
}

// ---------------------------------------------------------------- readers

export function getTelemetry() {
  return load();
}

// Demand weights. A settled payment outweighs everything because it is the only signal with money
// behind it; an unmet search outweighs a met one because a satisfied search produced no evidence
// that the catalog was adequate, while an unsatisfied one proved it was not.
const WEIGHT = { paid: 10, preview: 3, sample: 2, customRequest: 2, challenge: 1, searchMiss: 1, searchHit: 0.5 };

// Ranked demand per product id, plus the raw component counts so the number can be audited rather
// than trusted. `demandScore` is deliberately an arbitrary unit, not a currency.
export function demandRanking() {
  const s = load();
  const rows = [];
  for (const [id, b] of Object.entries(s.endpoints)) {
    const score =
      (b.paid || 0) * WEIGHT.paid +
      (b.preview || 0) * WEIGHT.preview +
      (b.sample || 0) * WEIGHT.sample +
      (b.challenge || 0) * WEIGHT.challenge;
    if (score <= 0) continue;
    rows.push({
      id,
      demandScore: Math.round(score * 10) / 10,
      challenge: b.challenge || 0,
      preview: b.preview || 0,
      sample: b.sample || 0,
      paid: b.paid || 0,
      blocked: b.blocked || 0,
      lastSeen: b.lastSeen,
    });
  }
  rows.sort((a, b) => b.demandScore - a.demandScore || a.id.localeCompare(b.id));
  return rows;
}

// Search queries that returned nothing (or almost nothing), aggregated so a hundred agents asking
// the same question read as one strong signal instead of a hundred weak ones.
export function searchGaps({ limit = 40 } = {}) {
  const s = load();
  const byQuery = new Map();
  for (const e of s.searches) {
    const key = e.q.toLowerCase();
    if (!byQuery.has(key)) byQuery.set(key, { query: e.q, asks: 0, totalHits: 0, lastAt: null });
    const r = byQuery.get(key);
    r.asks += 1;
    r.totalHits += e.hits;
    r.lastAt = e.at;
  }
  return [...byQuery.values()]
    .map((r) => ({ ...r, avgHits: Math.round((r.totalHits / r.asks) * 10) / 10 }))
    .filter((r) => r.avgHits < 1)
    .sort((a, b) => b.asks - a.asks || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit);
}

// Searches that did find something. Worth keeping for the opposite reason: it shows which keywords
// the catalog actually answers, which is what the discovery metadata should be advertising.
export function searchHits({ limit = 40 } = {}) {
  const s = load();
  const byQuery = new Map();
  for (const e of s.searches) {
    const key = e.q.toLowerCase();
    if (!byQuery.has(key)) byQuery.set(key, { query: e.q, asks: 0, totalHits: 0, lastAt: null });
    const r = byQuery.get(key);
    r.asks += 1;
    r.totalHits += e.hits;
    r.lastAt = e.at;
  }
  return [...byQuery.values()]
    .map((r) => ({ ...r, avgHits: Math.round((r.totalHits / r.asks) * 10) / 10 }))
    .filter((r) => r.avgHits >= 1)
    .sort((a, b) => b.asks - a.asks || b.totalHits - a.totalHits)
    .slice(0, limit);
}

// Repeated 404s, grouped by the path shape. An agent asking for /report/xyz three times is guessing;
// ten different agents asking for it is a missing product with a known name.
export function missPatterns({ limit = 30 } = {}) {
  const s = load();
  const byPath = new Map();
  for (const e of s.misses) {
    const key = e.path.replace(/\/[^/]*$/, (m) => (m.length > 12 ? '/<id>' : m));
    if (!byPath.has(key)) byPath.set(key, { path: key, attempts: 0, samples: new Set(), lastAt: null });
    const r = byPath.get(key);
    r.attempts += 1;
    if (r.samples.size < 5) r.samples.add(e.path);
    r.lastAt = e.at;
  }
  return [...byPath.values()]
    .map((r) => ({ ...r, samples: [...r.samples] }))
    .sort((a, b) => b.attempts - a.attempts || a.path.localeCompare(b.path))
    .slice(0, limit);
}

// Custom requests grouped by their indicator set — the promotion shortlist.
export function customPatterns({ limit = 30 } = {}) {
  const s = load();
  const bySet = new Map();
  for (const e of s.customRequests) {
    const key = [...e.indicators].sort().join(',');
    if (!bySet.has(key)) bySet.set(key, { indicators: [...e.indicators].sort(), asks: 0, paid: 0, avgCountries: 0, lastAt: null });
    const r = bySet.get(key);
    r.asks += 1;
    if (e.paid) r.paid += 1;
    r.avgCountries += e.countryCount / 1; // accumulated then averaged below
    r.lastAt = e.at;
  }
  return [...bySet.values()]
    .map((r) => ({ ...r, avgCountries: Math.round((r.avgCountries / r.asks) * 10) / 10 }))
    .sort((a, b) => b.asks - a.asks || a.indicators.length - b.indicators.length)
    .slice(0, limit);
}

// Stage-to-stage conversion for one product. `viewToPaid` is the number that matters: of the agents
// who looked at the free preview, how many paid. A low rate on a high-traffic product means the
// preview is not persuasive or the price is wrong — not that nobody wants it.
export function funnelFor(id) {
  const b = load().endpoints[String(id)] || {};
  const pct = (a, b2) => (b2 > 0 ? Math.round((a / b2) * 1000) / 10 : null);
  return {
    id,
    challenge: b.challenge || 0,
    preview: b.preview || 0,
    sample: b.sample || 0,
    paid: b.paid || 0,
    blocked: b.blocked || 0,
    challengeToView: pct(b.preview || 0, b.challenge || 0),
    viewToPaid: pct(b.paid || 0, (b.preview || 0) + (b.sample || 0)),
    challengeToPaid: pct(b.paid || 0, b.challenge || 0),
  };
}

export function funnelOverview() {
  const s = load();
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const views = s.counters.preview + s.counters.sample;
  return {
    stages: {
      challenge: s.counters.challenge,
      view: views,
      paid: s.counters.paid,
      blocked: s.counters.blocked,
    },
    conversion: {
      challengeToView: pct(views, s.counters.challenge),
      viewToPaid: pct(s.counters.paid, views),
      challengeToPaid: pct(s.counters.paid, s.counters.challenge),
    },
    search: { total: s.counters.search, zeroHit: s.counters.searchMiss },
    customRequests: s.counters.customRequest,
    misses: s.counters.miss,
  };
}

// A compact summary for embedding in /catalog and /evolution without shipping the raw event lists.
export function telemetrySummary() {
  const s = load();
  return {
    since: s.since,
    updatedAt: s.updatedAt,
    counters: s.counters,
    trackedEndpoints: Object.keys(s.endpoints).length,
    funnel: funnelOverview(),
  };
}
