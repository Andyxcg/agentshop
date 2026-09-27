// Pay the same endpoint repeatedly and decode the facilitator's settlement response each time,
// to separate an intermittent facilitator rejection from a deterministic server bug.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const NETWORK = process.env.NETWORK || 'eip155:84532';
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:4243';
const path = process.argv[2] || '/report/custom?indicators=NY.GDP.MKTP.CD&countries=US,CN&format=json';
const tries = Number(process.argv[3] || 6);

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
const pay = wrapFetchWithPayment(fetch, client);

const decode = (h) => {
  if (!h) return '(none)';
  try { return Buffer.from(h, 'base64').toString('utf8'); } catch { return '(undecodable) ' + h.slice(0, 40); }
};

let ok = 0, fail = 0;
for (let i = 1; i <= tries; i++) {
  try {
    const res = await pay(BASE + path);
    const body = await res.text();
    const pr = decode(res.headers.get('payment-response'));
    if (res.status === 200) {
      ok++;
      console.log(`  ${i}. 200  ${String(body.length).padStart(8)}B  settlement=${pr.slice(0, 90)}`);
    } else {
      fail++;
      console.log(`  ${i}. ${res.status}  body="${body.slice(0, 60)}"  settlement=${pr.slice(0, 200)}`);
    }
  } catch (e) {
    fail++;
    console.log(`  ${i}. THREW ${e.message.slice(0, 160)}`);
  }
}
console.log(`\n  ${ok}/${tries} delivered, ${fail} failed`);
