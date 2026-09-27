// agent-pay-client.js — reference buyer agent: pays per fetch over x402, machine-to-machine.
// Flow: fetch unpaid -> receive 402 -> sign a USDC transfer -> resend with the payment header -> receive the report HTML.
//
// Prerequisites:
//   1) Set EVM_PRIVATE_KEY=0x... for a wallet funded on NETWORK that holds USDC.
//      Mainnet (default) means REAL funds. For testnet use NETWORK=eip155:84532 and
//      claim testnet USDC at https://faucet.circle.com (select Base Sepolia).
//   2) Start the server: node server.js
//   3) Run: REPORT_URL=https://<host>/report/macro-gdp node agent-pay-client.js
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
const NETWORK = process.env.NETWORK || 'eip155:8453'; // Base mainnet
const REPORT_URL = process.env.REPORT_URL || 'http://localhost:4242/report/macro-gdp';

if (!PRIVATE_KEY) {
  console.error(
    'Missing EVM_PRIVATE_KEY.\n' +
    '  1) Prepare a wallet private key funded on ' + NETWORK + ' that holds USDC.\n' +
    '  2) Set EVM_PRIVATE_KEY=0x... in .env\n' +
    '  3) Testnet only: claim USDC at https://faucet.circle.com (Base Sepolia) and set NETWORK=eip155:84532'
  );
  process.exit(1);
}

const signer = privateKeyToAccount(PRIVATE_KEY);
console.log('buyer wallet :', signer.address);
console.log('network      :', NETWORK, NETWORK === 'eip155:8453' ? '(MAINNET — real USDC will be spent)' : '(testnet)');

// Register the exact-scheme payment on this network (the client signs with the signer).
const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
const fetchWithPay = wrapFetchWithPayment(fetch, client);

console.log('-> requesting', REPORT_URL, '(unpaid; a 402 is expected first)');
const res = await fetchWithPay(REPORT_URL);

if (!res.ok) {
  console.error('request failed, HTTP', res.status);
  process.exit(1);
}

const html = await res.text();
console.log('paid and delivered: the request was replayed automatically and the report was returned.');
console.log('  HTTP', res.status, '| report bytes:', html.length);
console.log('  preview:', html.replace(/\s+/g, ' ').slice(0, 120));
