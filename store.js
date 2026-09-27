// store.js — local ledger and report cache.
// The sales counter drives dynamic pricing; report HTML is cached so delivery is instant.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Bump CACHE_VERSION whenever the rendered report format changes. Deployments sync files
// incrementally and keep whatever is already on the container's volume, so a report cached under
// the old format would otherwise be served forever. A version segment in the path forces every
// artefact to be re-uploaded and makes stale caches unreachable.
//
// v3: multi-format delivery (html / json / csv) and the richer analysis layer.
// v4: reports widened from ten to twenty economies, so every rendered artefact changed. A content
// change needs the same treatment as a format change — the container keeps files it already has.
// v5: the bundle artefact embeds a brand token instead of a hard-coded name. The bundle is the only
// artefact that carries a brand, so this is a bundle-only change, but the container is still holding
// a v4 bundle rendered under the previous name — a version segment is the only way to displace it.
// From v5 on, renaming no longer requires a bump: the cached bytes carry the token and the server
// resolves it at delivery.
const CACHE_VERSION = 5;
const MAINNET = 'eip155:8453';
// The sales ledger is revenue evidence: a local testnet run must never inflate the mainnet numbers,
// because those drive both the published sales counters and the demand factor in pricing. So the
// ledger directory is per-network. Mainnet keeps the historical plain path so an existing volume
// (and everything already uploaded from it) stays where it is.
const ACTIVE_NETWORK = process.env.NETWORK || MAINNET;
const LEDGER_DIR =
  process.env.LEDGER_DIR ||
  (ACTIVE_NETWORK === MAINNET ? '.cache' : `.cache/net-${ACTIVE_NETWORK.replace(/[^a-z0-9]/gi, '_')}`);
const CACHE_DIR = process.env.CACHE_DIR || `.cache/v${CACHE_VERSION}`;
// The sales ledger lives outside the versioned cache: revenue history must survive a cache bump.
const LEDGER_FILE = `${LEDGER_DIR}/ledger.json`;

function ensureDir() {
  for (const dir of [CACHE_DIR, LEDGER_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

// Ledger ids can be report ids, or synthetic keys such as custom:<hash>. Filenames must stay safe.
function safeSlug(id) {
  const s = String(id).replace(/[^a-zA-Z0-9._-]/g, '_');
  return s.length > 80 ? `${s.slice(0, 60)}_${createHash('sha1').update(String(id)).digest('hex').slice(0, 12)}` : s;
}

function readLedger() {
  ensureDir();
  if (!existsSync(LEDGER_FILE)) return {};
  try {
    return JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeLedger(data) {
  ensureDir();
  writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function getSales(id) {
  return readLedger()[id]?.sales || 0;
}

export function getLedger() {
  return readLedger();
}

export function incrementSales(id) {
  const l = readLedger();
  l[id] = { ...(l[id] || {}), sales: (l[id]?.sales || 0) + 1, lastSoldAt: new Date().toISOString() };
  writeLedger(l);
  return l[id].sales;
}

// Ledger migration. Before the delivery-idempotency fix a single settled payment could advance the
// counter several times, so the pre-fix counters overstated revenue and fed an inflated demand
// factor into every price. The container keeps its own volume across deployments (files already on
// disk are preserved), so the correction has to travel with the code rather than with the deploy
// bundle. The epoch marker makes the reset run exactly once.
const LEDGER_EPOCH = '2026-09-21-mainnet-truth-v2';
const EPOCH_KEY = '__epoch';

export function reconcileLedger(baseline) {
  const current = readLedger();
  if (current[EPOCH_KEY] === LEDGER_EPOCH) return { changed: false, epoch: LEDGER_EPOCH };
  const before = Object.entries(current)
    .filter(([k]) => k !== EPOCH_KEY)
    .reduce((a, [, v]) => a + (v?.sales || 0), 0);
  writeLedger({ [EPOCH_KEY]: LEDGER_EPOCH, ...baseline });
  return { changed: true, epoch: LEDGER_EPOCH, before, after: totalSales() };
}

// A parameterised product is recorded twice: once against the product ("custom", "bundle") and once
// against the exact request variant ("custom-<hash>", "bundle-<category>"). The variant row is a
// breakdown of the same sale, not a second sale, so anything with a variant suffix is excluded from
// the headline total. The suffix must never be hyphen-free, or a catalog id would be mistaken for a
// variant of another product.
export function totalSales() {
  return Object.entries(readLedger())
    .filter(([id]) => id !== EPOCH_KEY && !/^(custom|bundle)-/.test(id))
    .reduce((a, [, v]) => a + (v?.sales || 0), 0);
}

// Delivery dedupe. One x402 payment authorises exactly one delivery, but a request can reach the
// handler more than once: the middleware buffers the response until on-chain settlement completes,
// and a reverse proxy in front of the service will happily retry a request that looks slow. Each
// retry carries the same signed payment payload, so every replay looked like a fresh sale — the
// ledger overstated revenue and the demand factor inflated prices. Keying on the payment signature
// makes delivery idempotent, which is what the protocol actually promises the buyer.
const DELIVERIES_FILE = `${LEDGER_DIR}/deliveries.json`;
const DELIVERY_HISTORY = 5000;

function readDeliveries() {
  if (!existsSync(DELIVERIES_FILE)) return {};
  try {
    const d = JSON.parse(readFileSync(DELIVERIES_FILE, 'utf8'));
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

export function isDuplicateDelivery(key) {
  if (!key) return false;
  return Boolean(readDeliveries()[key]);
}

export function markDelivery(key, id) {
  if (!key) return;
  const all = readDeliveries();
  all[key] = { id, at: new Date().toISOString() };
  // Bounded history: keep the most recent keys so the file cannot grow without limit.
  const keys = Object.keys(all);
  if (keys.length > DELIVERY_HISTORY) {
    const trimmed = {};
    for (const k of keys.slice(-DELIVERY_HISTORY)) trimmed[k] = all[k];
    ensureDir();
    writeFileSync(DELIVERIES_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    return;
  }
  ensureDir();
  writeFileSync(DELIVERIES_FILE, JSON.stringify(all, null, 2), 'utf8');
}

export function deliveryStats() {
  const all = readDeliveries();
  return { unique: Object.keys(all).length };
}

// Purchase history derived from the idempotency ledger. Each unique signature is one paid delivery.
// Returns newest-first, capped at `limit`. This survives container restarts because the ledger is
// persisted under LEDGER_DIR.
export function getDeliveries(limit = 100) {
  const all = readDeliveries();
  const rows = Object.entries(all)
    .map(([sig, v]) => ({ sig, id: v.id, at: v.at }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return limit ? rows.slice(0, limit) : rows;
}

// Delivery attempt log. The sales counter has been observed to advance more than once per settled
// payment, and the settled transactions on chain are the only ground truth: exactly one payment
// produced four counter increments. A bounded log of attempts — with whether a payment signature
// was actually present — is what makes that class of bug diagnosable instead of arguable.
const ATTEMPTS_FILE = `${LEDGER_DIR}/delivery-attempts.json`;
const ATTEMPT_HISTORY = 200;

export function recordAttempt(entry) {
  let all = [];
  if (existsSync(ATTEMPTS_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(ATTEMPTS_FILE, 'utf8'));
      if (Array.isArray(parsed)) all = parsed;
    } catch {
      all = [];
    }
  }
  all.push({ at: new Date().toISOString(), ...entry });
  if (all.length > ATTEMPT_HISTORY) all = all.slice(-ATTEMPT_HISTORY);
  ensureDir();
  writeFileSync(ATTEMPTS_FILE, JSON.stringify(all, null, 2), 'utf8');
  return all.length;
}

export function deliveryAttempts(limit = 50) {
  if (!existsSync(ATTEMPTS_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(ATTEMPTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.slice(-limit) : [];
  } catch {
    return [];
  }
}

// Report cache: generate once, reuse on delivery.
//
// Keyed by extension so one report can be cached in several delivery formats without collisions.
// Everything under CACHE_DIR is a pure function of the report definition, so a cache hit is always
// safe to serve directly.
export function cacheArtifact(id, ext, content) {
  ensureDir();
  const file = `${CACHE_DIR}/${safeSlug(id)}.${ext}`;
  writeFileSync(file, content, 'utf8');
  return file;
}

export function readArtifact(id, ext = 'html') {
  const file = `${CACHE_DIR}/${safeSlug(id)}.${ext}`;
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function cacheReport(id, html) {
  return cacheArtifact(id, 'html', html);
}

export function readCachedReport(id) {
  return readArtifact(id, 'html');
}

export function cacheJson(id, obj) {
  return cacheArtifact(id, 'json', JSON.stringify(obj));
}

export function readCachedJson(id) {
  const raw = readArtifact(id, 'json');
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasArtifact(id, ext) {
  return existsSync(`${CACHE_DIR}/${safeSlug(id)}.${ext}`);
}

// Report metadata (latest observation year, coverage, generation time). This is persisted rather
// than derived at startup because the latest year feeds the dynamic-pricing freshness factor, and
// a report served from cache would otherwise be priced as if its data were brand new.
const META_FILE = `${CACHE_DIR}/meta.json`;

export function getMeta() {
  if (!existsSync(META_FILE)) return {};
  try {
    return JSON.parse(readFileSync(META_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function setMeta(id, meta) {
  const all = getMeta();
  all[id] = { ...(all[id] || {}), ...meta };
  ensureDir();
  writeFileSync(META_FILE, JSON.stringify(all, null, 2), 'utf8');
  return all[id];
}

// Derive the newest observation year straight from a rendered report. The year-by-year matrix
// carries the actual years present in the data, which makes this the authoritative source when the
// metadata sidecar is missing — for example when a deployment ships the report cache but not the
// generated metadata file. Without this, a cached report would be priced as if freshly published.
export function latestYearFromHtml(html) {
  if (!html) return null;
  const m = html.match(/<table class="matrix"><thead><tr><th>Economy<\/th>((?:<th class="num">\d{4}<\/th>)+)/);
  if (!m) return null;
  const years = [...m[1].matchAll(/<th class="num">(\d{4})<\/th>/g)].map((x) => Number(x[1]));
  return years.length ? Math.max(...years) : null;
}
