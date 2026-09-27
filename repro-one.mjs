// Pay ONE endpoint and dump everything, to find why some requests come back with a 2-byte body.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const NETWORK = process.env.NETWORK || 'eip155:84532';
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:4243';
const path = process.argv[2] || '/report/macro-gdp?format=json';

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

// Log every hop so we can see the 402 -> pay -> replay sequence.
const loggingFetch = async (url, init = {}) => {
  const hasPay = Object.keys(init.headers || {}).some((h) => h.toLowerCase().includes('payment'));
  console.log(`  --> ${init.method || 'GET'} ${url} ${hasPay ? '(with payment header)' : ''}`);
  const res = await fetch(url, init);
  console.log(`  <-- ${res.status} ${res.headers.get('content-type')} payResp=${res.headers.get('payment-response') ? 'yes' : 'no'}`);
  return res;
};

const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
const pay = wrapFetchWithPayment(loggingFetch, client);

console.log(`\n=== paying ${BASE}${path} ===`);
try {
  const res = await pay(BASE + path);
  const body = await res.text();
  console.log(`\nfinal status : ${res.status}`);
  console.log(`content-type : ${res.headers.get('content-type')}`);
  console.log(`bytes        : ${body.length}`);
  console.log(`body[:400]   : ${body.slice(0, 400)}`);
  console.log(`payment-response: ${(res.headers.get('payment-response') || '').slice(0, 40)}`);
} catch (e) {
  console.log('THREW:', e.message);
  console.log(e.stack.split('\n').slice(0, 6).join('\n'));
}
