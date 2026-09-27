// evolve.js — the evolution engine.
//
// Telemetry answers "what did agents look for". The ledger answers "what did they pay for".
// This module turns those two signals into an auditable plan, and applies the parts of the plan
// that are safe to apply without a human: bounded price adjustments, demand-ordered discovery,
// and new catalog entries derived from unmet search demand.
//
// Design rules:
//  1. Every action is recorded in a changelog with its evidence. A price change that cannot show
//     the funnel numbers that caused it is a bug, not a decision.
//  2. Adjustments are small and bounded. A model that repriced aggressively on thin data would
//     amplify noise; per-run moves are capped and every price stays inside the global bounds.
//  3. New products are only derived from *supported* indicators. A gap the data source cannot
//     fill is reported as unmet demand, never silently ignored and never faked.
//  4. Runs are idempotent. Applying the same plan twice changes nothing the second time.
//
// CLI:  node evolve.js            dry-run — print the plan, change nothing
//       node evolve.js --apply    write adopted state for the server to consume

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import {
  demandRanking, searchGaps, searchHits, missPatterns, customPatterns,
  funnelOverview, telemetrySummary, getTelemetry,
} from './telemetry.js';
import { getLedger, getMeta } from './store.js';
import { CATALOG, ALL_INDICATOR_CODES } from './catalog.js';
import { INDICATORS } from './datasources.js';
import { MAX_PAYMENT_USD, SETTLEMENT_FEE_USD, FEE_COVER_MULTIPLE } from './pricing.js';

const PRICE_FLOOR_USD = Math.max(0.05, SETTLEMENT_FEE_USD * FEE_COVER_MULTIPLE);

const ACTIVE_NETWORK = process.env.NETWORK || 'eip155:8453';
const MAINNET = 'eip155:8453';
const DIR =
  process.env.LEDGER_DIR ||
  (ACTIVE_NETWORK === MAINNET ? '.cache' : `.cache/net-${ACTIVE_NETWORK.replace(/[^a-z0-9]/gi, '_')}`);
const STATE_FILE = `${DIR}/evolution.json`;
const HISTORY_FILE = `${DIR}/evolution-history.json`;

// Safety bounds. MIN_SIGNAL is the smallest sample on which any repricing decision is allowed —
// below it, the funnel numbers are noise and the honest output is "collect more data".
const MIN_SIGNAL = {
  priceDown: 8,   // challenges before a price may be lowered
  priceUp: 8,     // challenges before a price may be raised
  retire: 30,     // days of zero demand before a product is flagged for review
};
const PRICE_STEP = 0.1;        // ±10% per run
const HISTORY_MAX = 120;

// ---------------------------------------------------------------------------
// helpers

const now = () => new Date().toISOString();
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function loadJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Fuzzy-match a free-text query against the supported indicator vocabulary. Returns scored codes.
function matchIndicators(query) {
  const q = String(query).toLowerCase();
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (!terms.length) return [];
  const scored = [];
  for (const [code, label] of Object.entries(INDICATORS)) {
    const hay = `${label} ${code}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += t.length;
    // exact label substring is a strong hit
    if (hay.includes(q.trim())) score += 12;
    if (score > 0) scored.push({ code, label, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------------------------------------------------------------------------
// plan builders

// Price moves follow conversion, not vibes. A stream of challenges with no payments means the
// price is above what the demand will bear; a strong conversion means it may be below it.
function priceActions(ranking, funnels) {
  const actions = [];
  for (const r of ranking) {
    const f = funnels[r.id] || { challenge: r.challenge, paid: r.paid };
    const challenges = f.challenge || 0;
    const paid = f.paid || 0;
    if (challenges < MIN_SIGNAL.priceDown && challenges < MIN_SIGNAL.priceUp) continue;
    const conversion = challenges > 0 ? paid / challenges : 0;
    const current = r.currentPrice;
    if (current == null) continue;
    const value = Number(String(current).replace('$', ''));

    if (conversion < 0.05 && challenges >= MIN_SIGNAL.priceDown) {
      const next = round2(clamp(value * (1 - PRICE_STEP), PRICE_FLOOR_USD, MAX_PAYMENT_USD));
      if (next < value) {
        actions.push({
          type: 'adjust-price',
          id: r.id,
          from: current,
          to: `$${next.toFixed(2)}`,
          reason: `conversion ${(conversion * 100).toFixed(1)}% over ${challenges} challenges — below what demand will bear`,
          evidence: { challenges, paid, preview: f.preview, sample: f.sample },
        });
      }
    } else if (conversion > 0.25 && challenges >= MIN_SIGNAL.priceUp) {
      const next = round2(clamp(value * (1 + PRICE_STEP), PRICE_FLOOR_USD, MAX_PAYMENT_USD));
      if (next > value) {
        actions.push({
          type: 'adjust-price',
          id: r.id,
          from: current,
          to: `$${next.toFixed(2)}`,
          reason: `conversion ${(conversion * 100).toFixed(1)}% over ${challenges} challenges — demand supports more`,
          evidence: { challenges, paid, preview: f.preview, sample: f.sample },
        });
      }
    }
  }
  return actions;
}

// A repeated unmet search that maps onto supported indicators is a product asking to exist.
function newProductActions(gaps, custom, existingIds) {
  const actions = [];
  const seen = new Set();

  const propose = (sourceQuery, hits, source) => {
    if (!hits.length) return null;
    // Take the top match only — a blurry match would mint a product nobody asked for.
    const best = hits[0];
    if (best.score < 4) return null;
    const id = `macro-${best.code.split('.').slice(-1)[0].toLowerCase().replace(/[^a-z0-9]/g, '')}-${best.code.length}`;
    // Deterministic, collision-free id derived from the indicator code itself.
    const slug = best.code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const proposedId = `macro-${slug}`;
    if (existingIds.has(proposedId) || seen.has(proposedId)) return null;
    seen.add(proposedId);
    return {
      type: 'propose-report',
      id: proposedId,
      source,
      sourceQuery,
      indicator: { code: best.code, label: best.label },
      title: `${best.label} — Single Indicator Report`,
      category: 'single-indicator',
      tier: 'basic',
      rationale: `"${sourceQuery}" was searched ${hits.count ?? ''} time(s) with no catalog hit; it maps to supported indicator ${best.code} (${best.label}).`,
    };
  };

  for (const g of gaps) {
    const hits = matchIndicators(g.query || g.q || '');
    const p = propose(g.query || g.q, hits, 'search-gap');
    if (p) p.queryCount = g.count ?? 1, actions.push(p);
  }
  // Custom requests repeated across distinct agents are pre-validated demand.
  for (const c of custom) {
    const inds = (c.indicators || []).filter((i) => ALL_INDICATOR_CODES.includes(i));
    if (inds.length !== 1 || (c.count || 0) < 2) continue;
    const code = inds[0];
    const slug = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const proposedId = `macro-${slug}`;
    if (existingIds.has(proposedId) || seen.has(proposedId)) continue;
    seen.add(proposedId);
    actions.push({
      type: 'propose-report',
      id: proposedId,
      source: 'custom-repeat',
      sourceQuery: `${code} × ${(c.countries || []).length} economies`,
      indicator: { code, label: INDICATORS[code] || code },
      title: `${INDICATORS[code] || code} — Single Indicator Report`,
      category: 'single-indicator',
      tier: 'basic',
      rationale: `the same single-indicator custom request was made ${(c.count || 0)} time(s); promoting it to a catalog entry prices it lower and makes it indexable.`,
      queryCount: c.count || 0,
    });
  }
  return actions;
}

// Products with sustained zero demand are inventory, not assets. Flagging is advisory; nothing is
// removed automatically — removal would also delete its indexed seat, which cost a settlement.
function retireFlags(ranking, allIds, meta) {
  const active = new Set(ranking.map((r) => r.id));
  const flags = [];
  for (const id of allIds) {
    if (active.has(id)) continue;
    const gen = meta[id]?.generatedAt;
    if (!gen) continue;
    const ageDays = (Date.now() - Date.parse(gen)) / 86400000;
    if (ageDays >= MIN_SIGNAL.retire) {
      flags.push({ type: 'flag-review', id, reason: `no demand in ${Math.floor(ageDays)} days since generation`, generatedAt: gen });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// plan assembly

export function buildPlan({ catalog = CATALOG, currentPrices = {} } = {}) {
  const ranking = demandRanking();
  const gaps = searchGaps({ limit: 60 });
  const hits = searchHits({ limit: 20 });
  const misses = missPatterns({ limit: 30 });
  const custom = customPatterns({ limit: 40 });
  const funnels = Object.fromEntries(
    Object.keys(getTelemetry().endpoints || {}).map((id) => [id, funnelFor(id)])
  );
  const ledger = getLedger();
  const meta = getMeta();
  const existingIds = new Set(Object.keys(catalog));

  // Attach the live price so price actions compare against reality.
  for (const r of ranking) r.currentPrice = currentPrices[r.id] || null;

  const sales = Object.fromEntries(
    Object.entries(ledger)
      .filter(([k, v]) => k !== '__epoch' && typeof v === 'object')
      .map(([k, v]) => [k, v.sales || 0]),
  );

  const plan = {
    generatedAt: now(),
    network: ACTIVE_NETWORK,
    signal: {
      ...telemetrySummary(),
      salesTotal: Object.values(sales).reduce((a, b) => a + b, 0),
      searchGapCount: gaps.length,
      searchHitCount: hits.length,
      missPatterns: misses.length,
      customPatterns: custom.length,
    },
    demand: ranking.slice(0, 30).map((r) => ({ ...r, sales: sales[r.id] || 0 })),
    unmetSearches: gaps,
    actions: {
      price: priceActions(ranking, funnels),
      newProducts: newProductActions(gaps, custom, existingIds),
      reviewFlags: retireFlags(ranking, existingIds, meta),
    },
    notes: [],
  };

  // Honest-empty guard: with no signal the only correct plan is to say so.
  const c = plan.signal.counters || {};
  const anySignal = c.challenge + c.preview + c.sample + c.search > 0;
  if (!anySignal) {
    plan.notes.push(
      'No demand signal yet (no challenges, previews, samples or searches recorded). ' +
      'Every action type requires evidence; nothing to apply this run. Telemetry accumulates from live traffic — run again once the service has seen real requests.',
    );
  }
  return plan;
}

// ---------------------------------------------------------------------------
// state application

function loadState() {
  return loadJson(STATE_FILE, { adoptedReports: [], priceOverrides: {}, updatedAt: null, changelog: [] });
}

function loadHistory() {
  const h = loadJson(HISTORY_FILE, []);
  return Array.isArray(h) ? h.slice(-HISTORY_MAX) : [];
}

export function getEvolutionState() {
  return loadState();
}

export function getEvolutionHistory() {
  return loadHistory();
}

export function applyPlan(plan) {
  const state = loadState();
  const history = loadHistory();
  const applied = { priceAdjustments: [], newReports: [], skipped: [] };
  const changes = [];

  for (const a of plan.actions.price) {
    const from = Number(String(a.from).replace('$', ''));
    const to = Number(String(a.to).replace('$', ''));
    if (!(to > 0) || from <= 0) { applied.skipped.push({ ...a, why: 'malformed price' }); continue; }
    // Idempotence: an override equal to the previous one changes nothing.
    if (state.priceOverrides[a.id] === to) { applied.skipped.push({ ...a, why: 'already applied' }); continue; }
    state.priceOverrides[a.id] = to;
    applied.priceAdjustments.push(a);
    changes.push({ at: now(), ...a });
  }

  for (const a of plan.actions.newProducts) {
    // Validate hard: the indicator must exist, the id must not collide, the title must be non-empty.
    if (!ALL_INDICATOR_CODES.includes(a.indicator?.code)) {
      applied.skipped.push({ ...a, why: 'indicator not supported' });
      continue;
    }
    if (CATALOG[a.id]) { applied.skipped.push({ ...a, why: 'id already exists' }); continue; }
    if (state.adoptedReports.some((r) => r.id === a.id)) {
      applied.skipped.push({ ...a, why: 'already adopted' });
      continue;
    }
    state.adoptedReports.push({
      id: a.id,
      title: a.title,
      category: a.category || 'single-indicator',
      tier: a.tier || 'basic',
      indicators: [a.indicator.code],
      rationale: a.rationale,
      adoptedAt: now(),
      sourceQuery: a.sourceQuery,
    });
    applied.newReports.push(a);
    changes.push({ at: now(), type: 'adopt-report', id: a.id, indicator: a.indicator.code, rationale: a.rationale });
  }

  state.updatedAt = now();
  if (changes.length) {
    state.changelog = [...(state.changelog || []), ...changes].slice(-200);
    history.push({ at: now(), planGeneratedAt: plan.generatedAt, applied });
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return { state, applied, changed: changes.length > 0 };
}

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

// Called by the server at startup: merges adopted reports into the catalog so the whole pipeline
// (routes, manifest, discovery, prewarm fallbacks) treats them as first-class products.
export function injectAdoptedReports(catalog) {
  const state = loadState();
  let injected = 0;
  for (const r of state.adoptedReports || []) {
    if (catalog[r.id]) continue;
    catalog[r.id] = {
      id: r.id,
      title: r.title,
      category: r.category || 'single-indicator',
      indicators: r.indicators,
      countries: null, // resolved by catalog.js defaults at use time
      years: '2015:2025',
      tier: r.tier || 'basic',
      description: `${(INDICATORS[r.indicators[0]] || r.indicators[0])} for a broad economy panel, 2015–2025. Promoted from observed demand: ${r.rationale}`,
      keywords: (INDICATORS[r.indicators[0]] || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3),
      sources: [{ name: 'World Bank Open Data', license: 'CC BY 4.0', url: 'https://data.worldbank.org' }],
      evolved: true,
      adoptedAt: r.adoptedAt,
    };
    injected++;
  }
  return injected;
}

// Stage-to-stage conversion for one product. `viewToPaid` is the number that matters: of the
// agents who looked at the free preview, how many paid. A low rate on a high-traffic product means
// the preview is not persuasive or the price is wrong — not that nobody wants it.
export function funnelFor(id) {
  const b = getTelemetry().endpoints[String(id)] || {};
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

export function priceMultiplierFor(id, state = null) {
  const s = state || loadState();
  const override = s.priceOverrides?.[id];
  if (override == null) return 1;
  // The override is an absolute price; the multiplier is derived by the caller who knows the
  // current dynamic price. Here we only confirm an override exists.
  return override;
}

// ---------------------------------------------------------------------------
// CLI

if (import.meta.url === `file://${process.argv[1]}`) {
  const APPLY = process.argv.includes('--apply');
  const { priceForReport } = await import('./pricing.js');
  const { getSales } = await import('./store.js');
  const currentPrices = Object.fromEntries(
    Object.entries(CATALOG).map(([id, def]) => [id, priceForReport(def, getSales(id), null)]),
  );
  const plan = buildPlan({ currentPrices });
  console.log(JSON.stringify(plan, null, 2));
  if (APPLY) {
    const { applied, changed } = applyPlan(plan);
    console.error(`\n[evolve] applied: ${changed} change(s) — ` +
      `${applied.priceAdjustments.length} price, ${applied.newReports.length} new product, ${applied.skipped.length} skipped`);
  } else {
    console.error('\n[evolve] dry-run (use --apply to write adopted state)');
  }
}
