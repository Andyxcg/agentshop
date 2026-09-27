// Pay a set of x402 endpoints in each delivery format and validate what comes back.
// Runs against a local testnet-configured server so no real funds are spent.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { writeFileSync } from 'node:fs';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const KEY = process.env.EVM_PRIVATE_KEY;
const NETWORK = process.env.NETWORK || 'eip155:84532';
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:4243';

const signer = privateKeyToAccount(KEY);
const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
const pay = wrapFetchWithPayment(fetch, client);

const targets = [
  ['html', '/report/macro-gdp'],
  ['json', '/report/macro-gdp?format=json'],
  ['csv', '/report/macro-gdp?format=csv'],
  ['summary-csv', '/report/macro-gdp?format=summary-csv'],
  ['json', '/report/theme-growth-quality?format=json'],
  ['csv', '/report/theme-energy-transition?format=csv'],
  ['json', '/report/bundle?format=json'],
  ['csv', '/report/bundle?format=csv'],
  ['json', '/report/custom?indicators=NY.GDP.MKTP.CD,FP.CPI.TOTL.ZG&countries=US,CN,JP&years=2020:2024&format=json'],
];

// Content negotiation: no ?format= at all, only an Accept header.
const acceptHeader = ['json', '/report/macro-inflation', { Accept: 'application/json' }];

const results = [];
for (const [kind, path] of targets) {
  const url = BASE + path;
  try {
    const res = await pay(url);
    const body = await res.text();
    const ct = res.headers.get('content-type') || '';
    const rec = { kind, path, status: res.status, contentType: ct, bytes: body.length, body };
    if (res.status !== 200) {
      console.log(`  !! ${path} -> HTTP ${res.status}; payment-response=${(res.headers.get('payment-response') || '').slice(0, 60)}`);
      console.log(`     body: ${body.slice(0, 300)}`);
    }
    // Validate the shape rather than just the status: a 200 carrying an error page would pass a
    // byte-count check but fail a buyer.
    if (kind === 'json') {
      try {
        const d = JSON.parse(body);
        rec.parsed = true;
        rec.toplevel = Object.keys(d).slice(0, 8);
        rec.kindField = d.kind || (d.reports ? 'bundle-with-' + d.reports.length + '-reports' : '—');
      } catch (e) {
        rec.parsed = false;
        rec.error = 'invalid JSON: ' + e.message;
      }
    } else if (kind === 'csv' || kind === 'summary-csv') {
      const lines = body.trim().split('\n');
      rec.rows = lines.length - 1;
      rec.columns = lines[0].split(',').length;
      rec.header = lines[0].slice(0, 110);
    } else {
      rec.hasHtml = body.startsWith('<!DOCTYPE html');
      rec.title = (body.match(/<title>([^<]*)<\/title>/) || [])[1] || null;
    }
    writeFileSync(`.fmt-out/fmt-${kind}-${path.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.out`, body);
    results.push(rec);
  } catch (e) {
    results.push({ kind, path, error: e.message });
  }
}

// Content negotiation via Accept header only.
try {
  const [, path, headers] = acceptHeader;
  const res = await pay(BASE + path, { headers });
  const body = await res.text();
  let parsed = false;
  try { JSON.parse(body); parsed = true; } catch {}
  results.push({ kind: 'accept-header', path, status: res.status, contentType: res.headers.get('content-type'), bytes: body.length, parsed });
} catch (e) {
  results.push({ kind: 'accept-header', error: e.message });
}

for (const r of results) {
  if (r.error) { console.log('FAIL', r.path, '->', r.error); continue; }
  const detail = r.parsed !== undefined ? `parsed=${r.parsed}`
    : r.rows !== undefined ? `rows=${r.rows} cols=${r.columns}`
    : r.title ? `title="${r.title}"`
    : '';
  console.log(
    `${r.status === 200 ? 'OK  ' : 'BAD '} ${String(r.kind).padEnd(12)} ${String(r.bytes).padStart(9)}B ${String(r.contentType).padEnd(26)} ${detail}`
  );
  if (r.header) console.log(`      csv header: ${r.header}`);
  if (r.kindField) console.log(`      payload kind: ${r.kindField}`);
}
