// watch-orders.js — watch for the first external agent purchase.
//
// Two independent signals, because either can be the first to fire:
//   1. On-chain: an inbound USDC Transfer to the payout address on Base mainnet. This is the
//      authoritative signal and the only one the facilitator's index reacts to.
//   2. Off-chain: the live /catalog sales counters, which move the moment a paid request is served.
//
// Scans are incremental: the last scanned block is persisted, so each run only covers the delta.
// Sender addresses listed in SELF_ADDRESSES are treated as our own test traffic and never as
// the "first external customer".
//
// Usage:
//   node watch-orders.js                 # incremental scan (24h backfill on first run)
//   node watch-orders.js --backfill=200000
//   node watch-orders.js --json          # machine-readable output only
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createPublicClient, http, formatUnits, parseAbiItem } from 'viem';
import { publicBase } from './brand.js';

const CACHE_DIR = process.env.CACHE_DIR || '.cache';
const STATE_FILE = `${CACHE_DIR}/watch-state.json`;
const ORDERS_FILE = `${CACHE_DIR}/orders.json`;
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const PAYOUT_ADDRESS = (process.env.PAYOUT_ADDRESS || '').toLowerCase();
const NETWORK = process.env.NETWORK || 'eip155:8453';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://facilitator.payai.network';
const PUBLIC_URL = publicBase();

// Base mainnet native USDC (6 decimals).
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Addresses that are our own testing identities, not customers.
const SELF_ADDRESSES = (process.env.SELF_ADDRESSES || '0x7b616184f3f87d623b0435bcf05212cc87cf3047')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const BACKFILL = Number((process.argv.find((a) => a.startsWith('--backfill=')) || '').split('=')[1]) || 43200; // ~24h of Base blocks
const JSON_ONLY = process.argv.includes('--json');
// The public Base RPC caps response size and 413s a wide eth_getLogs window — observed even at
// 1,900 blocks when filtering by recipient. 900 is the working window; getLogsSafe() bisects any
// window that still fails, so no range is silently skipped.
const CHUNK = 900;

const args = { PAYOUT_ADDRESS, NETWORK };

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const shorten = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-6)}` : '—');

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${j.error.code}: ${j.error.message}`);
  return j.result;
}

async function main() {
  if (!/^0x[0-9a-f]{40}$/.test(PAYOUT_ADDRESS)) {
    console.error('PAYOUT_ADDRESS is missing or malformed; cannot watch on-chain orders.');
    process.exit(2);
  }

  const state = loadJson(STATE_FILE, { lastBlock: null, firstRunAt: null });
  const orders = loadJson(ORDERS_FILE, { updatedAt: null, scannedFromBlock: null, scannedToBlock: null, orders: [], firstExternalOrder: null });

  let head;
  try {
    head = Number(await rpc('eth_blockNumber', []));
  } catch (e) {
    console.error(`[watch] RPC unavailable: ${e.message}`);
    head = null;
  }

  const newOrders = [];
  let scannedFrom = null;
  let scannedTo = null;

  if (head != null) {
    scannedFrom = state.lastBlock != null ? state.lastBlock + 1 : Math.max(0, head - BACKFILL);
    scannedTo = head;

    // topic2 = the indexed `to` address, left-padded to 32 bytes.
    const topicTo = `0x${PAYOUT_ADDRESS.slice(2).padStart(64, '0')}`;

    // The public RPC caps response size, so a wide window can 413. Split the window on failure
    // rather than skipping it — a skipped chunk is a missed first sale.
    const getLogsSafe = async (from, to) => {
      try {
        return await rpc('eth_getLogs', [{
          address: USDC,
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          topics: [TRANSFER_TOPIC, null, topicTo],
        }]);
      } catch (e) {
        if (from >= to) {
          console.error(`[watch] getLogs ${from} failed: ${e.message}`);
          return [];
        }
        const mid = Math.floor((from + to) / 2);
        return [...(await getLogsSafe(from, mid)), ...(await getLogsSafe(mid + 1, to))];
      }
    };

    for (let from = scannedFrom; from <= scannedTo; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, scannedTo);
      const logs = await getLogsSafe(from, to);
      for (const l of logs) {
        const sender = `0x${l.topics[1].slice(26)}`.toLowerCase();
        const amount = formatUnits(BigInt(l.data), 6);
        newOrders.push({
          txHash: l.transactionHash,
          block: Number(l.blockNumber),
          from: sender,
          to: PAYOUT_ADDRESS,
          amountUSDC: amount,
          kind: SELF_ADDRESSES.includes(sender) ? 'self' : 'external',
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Merge, newest last, deduped by tx hash + block.
  const known = new Set(orders.orders.map((o) => `${o.txHash}:${o.block}`));
  const merged = [...orders.orders];
  for (const o of newOrders) {
    const k = `${o.txHash}:${o.block}`;
    if (!known.has(k)) { merged.push(o); known.add(k); }
  }
  merged.sort((a, b) => a.block - b.block);

  const external = merged.filter((o) => o.kind === 'external');
  const firstExternal = orders.firstExternalOrder || (external.length ? external[0] : null);

  // Off-chain signal: sales counters on the live service.
  let live = null;
  try {
    const r = await fetch(`${PUBLIC_URL}/catalog`, { signal: AbortSignal.timeout(20000) });
    if (r.ok) {
      const j = await r.json();
      live = {
        ok: true,
        count: j.count,
        totalSales: j.totalSales,
        topSellers: (j.items || [])
          .filter((i) => i.sales > 0)
          .sort((a, b) => b.sales - a.sales)
          .map((i) => ({ id: i.id, sales: i.sales, price: i.price })),
      };
    } else {
      live = { ok: false, status: r.status };
    }
  } catch (e) {
    live = { ok: false, error: e.message };
  }

  // Discovery index: the facilitator lists a resource only after a real settlement on that network.
  let index = null;
  try {
    const r = await fetch(`${FACILITATOR_URL}/discovery/resources?payTo=${PAYOUT_ADDRESS}`, { signal: AbortSignal.timeout(25000) });
    if (r.ok) {
      const j = await r.json();
      const items = j.items || [];
      index = {
        indexed: items.length > 0,
        listedResources: items.length,
        resources: items.map((i) => i.resource).slice(0, 50),
        // Per-resource settlement counts are the facilitator's own attribution of paid demand to
        // individual endpoints, which the on-chain scan cannot recover (it only sees an amount).
        stats: [],
      };
      for (const i of items.slice(0, 50)) {
        try {
          const sr = await fetch(`${FACILITATOR_URL}/discovery/resources/${encodeURIComponent(i.resource)}/stats`, { signal: AbortSignal.timeout(20000) });
          if (!sr.ok) continue;
          const s = await sr.json();
          index.stats.push({
            resource: i.resource.replace(PUBLIC_URL, ''),
            settlements: s.settlements?.total ?? null,
            last24h: s.settlements?.last24h ?? null,
            uniqueBuyers: s.buyers?.unique ?? null,
            volumeUsd: s.volume?.totalUsd ?? null,
            reliability: s.reliability ?? null,
          });
        } catch { /* a missing stats row must not fail the watch */ }
      }
    } else {
      index = { indexed: false, error: `HTTP ${r.status}` };
    }
  } catch (e) {
    index = { indexed: false, error: e.message };
  }

  // Downstream directories. Agentic.Market keys one listing per domain and has no submission form,
  // so the only way in is its own ingest; polling for our hostname is how we learn it landed.
  const HOST = PUBLIC_URL.replace(/^https?:\/\//, '');
  let agentic = null;
  try {
    const r = await fetch(`https://api.agentic.market/v1/services/search?q=${encodeURIComponent(HOST)}`, { signal: AbortSignal.timeout(25000) });
    if (r.ok) {
      const j = await r.json();
      const svcs = j.services || j.items || [];
      const hit = svcs.find((s) => JSON.stringify(s).includes(HOST));
      agentic = { ok: true, listed: Boolean(hit), serviceId: hit?.id || null, scanned: svcs.length };
    } else {
      agentic = { ok: false, error: `HTTP ${r.status}` };
    }
  } catch (e) {
    agentic = { ok: false, error: e.message };
  }

  const report = {
    checkedAt: new Date().toISOString(),
    network: NETWORK,
    payTo: PAYOUT_ADDRESS,
    chain: { headBlock: head, scannedFromBlock: scannedFrom, scannedToBlock: scannedTo },
    onchain: {
      totalInbound: merged.length,
      externalInbound: external.length,
      selfInbound: merged.length - external.length,
      totalUSDC: merged.reduce((a, o) => a + Number(o.amountUSDC), 0).toFixed(6),
      externalUSDC: external.reduce((a, o) => a + Number(o.amountUSDC), 0).toFixed(6),
      latest: merged.slice(-5).map((o) => ({ ...o, fromShort: shorten(o.from) })),
    },
    firstExternalOrder: firstExternal,
    discoveryIndex: index,
    agenticMarket: agentic,
    service: live,
    verdict: firstExternal
      ? `FIRST EXTERNAL ORDER RECEIVED — ${firstExternal.amountUSDC} USDC from ${shorten(firstExternal.from)} in ${firstExternal.txHash}`
      : external.length === 0 && merged.length === 0
        ? 'No inbound settlements yet. The service is live, the index entry requires the first real settlement.'
        : 'Only self-test settlements seen so far; no external customer yet.',
  };

  saveJson(ORDERS_FILE, {
    updatedAt: report.checkedAt,
    scannedFromBlock: scannedFrom,
    scannedToBlock: scannedTo,
    firstExternalOrder: firstExternal,
    orders: merged,
  });
  saveJson(STATE_FILE, { lastBlock: scannedTo ?? state.lastBlock, firstRunAt: state.firstRunAt || report.checkedAt });

  if (JSON_ONLY) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Order watch @ ${report.checkedAt} ===`);
    console.log(`network        : ${NETWORK}`);
    console.log(`payTo          : ${PAYOUT_ADDRESS}`);
    console.log(`block range    : ${scannedFrom ?? '—'} → ${scannedTo ?? '—'} (head ${head ?? '—'})`);
    console.log(`inbound USDC   : ${report.onchain.totalInbound} transfer(s), ${report.onchain.totalUSDC} USDC`);
    console.log(`  external     : ${report.onchain.externalInbound} transfer(s), ${report.onchain.externalUSDC} USDC`);
    console.log(`  self-test    : ${report.onchain.selfInbound} transfer(s)`);
    if (report.onchain.latest.length) {
      console.log('  latest:');
      for (const o of report.onchain.latest) {
        console.log(`    ${o.block}  ${o.amountUSDC.padStart(10)} USDC  from ${o.fromShort}  [${o.kind}]  ${o.txHash.slice(0, 20)}…`);
      }
    }
    console.log(`indexed        : ${report.discoveryIndex.indexed ? 'YES' : 'no'} (${report.discoveryIndex.listedResources ?? 0} resource(s))`);
    if (report.discoveryIndex.error) console.log(`  index note   : ${report.discoveryIndex.error}`);
    for (const s of report.discoveryIndex.stats || []) {
      console.log(`    ${String(s.resource).padEnd(28)} settlements=${String(s.settlements).padEnd(6)} last24h=${String(s.last24h).padEnd(4)} buyers=${String(s.uniqueBuyers).padEnd(6)} vol=${s.volumeUsd} reliability=${s.reliability ?? '—'}`);
    }
    console.log(`agentic.market : ${report.agenticMarket?.listed ? 'LISTED' : 'not listed'}${report.agenticMarket?.serviceId ? ` (id ${report.agenticMarket.serviceId})` : ''}${report.agenticMarket?.error ? ` [${report.agenticMarket.error}]` : ''}`);
    if (live?.ok) {
      console.log(`service        : up, ${live.count} reports, ${live.totalSales} recorded sale(s)`);
      for (const s of live.topSellers) console.log(`    ${s.id}  sales=${s.sales}  price=${s.price}`);
    } else {
      console.log(`service        : UNREACHABLE (${live?.status || live?.error})`);
    }
    console.log(`\nVERDICT: ${report.verdict}\n`);
  }

  // Non-zero exit when a first external order exists, so a scheduler can branch on it.
  process.exit(firstExternal ? 0 : 0);
}

main().catch((e) => {
  console.error('watch failed:', e);
  process.exit(1);
});
