// Attempt a real mainnet payment from a fresh, unfunded wallet. The authorisation is signed fine
// (EIP-3009 needs no gas) but settlement must fail on insufficient balance — which is exactly the
// path that used to answer with an opaque `{}`. Verifies the structured error a buyer now receives.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits } from 'viem';

const NETWORK = process.env.NETWORK || 'eip155:8453';
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:4244';
const path = process.argv[2] || '/report/macro-patents?format=json';

const key = generatePrivateKey();
const signer = privateKeyToAccount(key);
const chain = createPublicClient({ transport: http('https://mainnet.base.org') });
const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const abi = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }];
const bal = await chain.readContract({ address: usdc, abi, functionName: 'balanceOf', args: [signer.address] });
console.log(`\nthrowaway buyer ${signer.address} USDC=${formatUnits(bal, 6)} (deliberately unfunded)`);
console.log(`paying ${BASE}${path}\n`);

const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
const pay = wrapFetchWithPayment(fetch, client);

const res = await pay(BASE + path);
const body = await res.text();
console.log(`status       : ${res.status}`);
console.log(`content-type : ${res.headers.get('content-type')}`);
console.log(`bytes        : ${body.length}`);
const dec = (h) => { try { return Buffer.from(h, 'base64').toString('utf8'); } catch { return null; } };
console.log('\n--- all response headers ---');
for (const [k, v] of res.headers.entries()) {
  console.log(`  ${k}: ${String(v).slice(0, 220)}`);
}
const pr = dec(res.headers.get('payment-response'));
console.log(`\nsettlement   : ${pr ? pr.slice(0, 200) : '(none)'}`);
const pq = dec(res.headers.get('payment-required'));
if (pq) {
  try {
    const d = JSON.parse(pq);
    console.log(`challenge.error : ${JSON.stringify(d.error)}`);
    console.log(`challenge.keys  : ${Object.keys(d).join(', ')}`);
  } catch { console.log(`challenge(decoded): ${pq.slice(0, 300)}`); }
}
console.log('\nbody:');
try { console.log(JSON.stringify(JSON.parse(body), null, 2).slice(0, 1200)); }
catch { console.log(body.slice(0, 400)); }
