// pricing.js — dynamic pricing engine (USDC).
// Price = tier base x freshness factor x demand factor, clamped to a sane range.
// Every function returns a "$x.xx" string, which is what x402 accepts directly.

const TIER_BASE = {
  basic: 0.08,
  standard: 0.12,
  premium: 0.25,
};

// The facilitator charges the seller per settled payment. On Base mainnet the PayAI facilitator
// line is $0.00212 per settlement (eip3009) with effect from 2026-09-21T12:00Z; before that point
// the rate table was empty and settlement was free. The price floor is derived from the fee rather
// than hard-coded so a sale always clears its own settlement cost several times over.
export const SETTLEMENT_FEE_USD = Number(process.env.SETTLEMENT_FEE_USD || 0.00212);
export const FEE_COVER_MULTIPLE = 10;

// The hard ceiling on any single payment, and the most commercially important number in this file.
//
// The official x402 buyer libraries refuse to sign a payment above a per-payment spend cap that
// they apply by default: `@x402/core` ships `DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1"`. The check runs
// client-side, before anything reaches the network, and the buyer sees
// "All payment requirements were rejected by spendControls.maxAmountPerPayment" — they cannot buy
// even if they wanted to. Measured, not assumed: a $3.88 bundle was refused outright by the
// reference client, while every sub-$1 request went through.
//
// So every product is priced under that ceiling. A higher headline price that most agents are
// structurally unable to pay is worth less than a lower price they can. Buyers who raise their own
// cap lose nothing, and larger purchases are reached by buying several products rather than by
// pricing one product out of reach.
export const MAX_PAYMENT_USD = 0.95;

// Ceiling for a category subset, kept below the full-catalog price so the product ladder is
// monotonic: more content always costs more, and the whole catalog is always the best value.
export const SUBSET_CAP_USD = 0.6;

const BOUNDS = { min: Math.max(0.05, SETTLEMENT_FEE_USD * FEE_COVER_MULTIPLE), max: MAX_PAYMENT_USD };

// Freshness: how many years old the newest observation is. Newer data commands a premium.
function freshnessFactor(latestYear) {
  const age = new Date().getFullYear() - Number(latestYear || new Date().getFullYear());
  if (age <= 0) return 1.25; // current-year data
  if (age <= 1) return 1.1;
  if (age <= 2) return 1.0;
  if (age <= 4) return 0.9;
  return 0.8; // stale data is discounted
}

// Demand: each sale nudges the price up, with a hard ceiling so it never runs away.
function demandFactor(sales) {
  const s = Number(sales || 0);
  if (s <= 0) return 1.0;
  if (s < 10) return 1.0 + s * 0.01; // +1% per sale, up to +10%
  if (s < 100) return 1.1 + (s - 10) * 0.002;
  return 1.28; // long-run popular cap: +28%
}

function money(n) {
  return '$' + (Math.round(n * 100) / 100).toFixed(2);
}

function clamp(n, { min, max }) {
  return Math.min(max, Math.max(min, n));
}

export function computePrice({ tier = 'standard', latestYear = null, sales = 0 } = {}) {
  const base = TIER_BASE[tier] ?? TIER_BASE.standard;
  const price = clamp(base * freshnessFactor(latestYear) * demandFactor(sales), BOUNDS);
  return money(price);
}

// Price for a catalog report.
export function priceForReport(reportDef, sales = 0, latestYear = null) {
  return computePrice({ tier: reportDef.tier, latestYear, sales });
}

// Price for a bespoke report. Bespoke work is priced by request size: each extra indicator and
// each extra economy adds cost, because each one is another upstream series to fetch and render.
// The ceiling is the buyer's default spend cap, not a judgement about the value of a wide panel.
const CUSTOM = {
  base: 0.10,
  perIndicator: 0.03,
  perCountry: 0.01,
  min: Math.max(0.20, SETTLEMENT_FEE_USD * FEE_COVER_MULTIPLE),
  max: MAX_PAYMENT_USD,
};

export function priceForCustom({ indicatorCount = 1, countryCount = 10, latestYear = null } = {}) {
  const raw =
    CUSTOM.base +
    CUSTOM.perIndicator * Math.max(1, indicatorCount) +
    CUSTOM.perCountry * Math.max(1, countryCount);
  const price = clamp(raw * freshnessFactor(latestYear), { min: CUSTOM.min, max: CUSTOM.max });
  return money(price);
}

// Price for a bundle: the sum of the constituent prices at a steep discount, because the marginal
// cost of the extra documents is near zero. Clamped to the same single-payment ceiling as
// everything else, which for the full catalog means the discount deepens as the catalog grows.
export function priceForBundle(individualPrices = [], { discount = 0.4 } = {}) {
  const sum = individualPrices.reduce((a, p) => a + Number(String(p).replace('$', '')), 0);
  const price = clamp(sum * discount, { min: 0.50, max: MAX_PAYMENT_USD });
  return money(price);
}

// Price for a subset bundle (one category, say). Same discount logic as the full bundle, but capped
// below it: without a lower ceiling the largest categories land within a few cents of the
// full-catalog price, which makes the ladder incoherent — a buyer would be foolish to take a
// category when the whole catalog costs barely more. Keeping subsets clearly below the top rung
// means the ladder means something, and it steers volume to the single cheapest-to-serve product.
export function priceForSubset(individualPrices = [], { discount = 0.4 } = {}) {
  const sum = individualPrices.reduce((a, p) => a + Number(String(p).replace('$', '')), 0);
  const price = clamp(sum * discount, {
    min: Math.max(0.10, SETTLEMENT_FEE_USD * FEE_COVER_MULTIPLE),
    max: SUBSET_CAP_USD,
  });
  return money(price);
}

export const PRICE_TABLE = TIER_BASE;
