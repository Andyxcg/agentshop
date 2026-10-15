// seed-index.js — 充值后一键拓宽 Bazaar 索引 + bundle 破 0（待命脚本，不自动执行）
//
// 背景（来自 MARKETING.md 实测）：
//   - Bazaar 索引是「真实结算的副作用」：一个端点只有被真实付费购买过，才进入 facilitator
//     的 discovery index，下游 agent 目录（Agentic.Market 等）才能发现它。
//   - 当前 facilitator 仅索引 6/115 个资源，覆盖率极低 → agent 几乎发现不了我们。
//   - 买家钱包（EVM_PRIVATE_KEY）已耗尽（~0.005 USDC），无法结算 → 死循环卡点。
//
// 本脚本在「钱包充值后」运行：用买家私钥真实购买一批高需求端点，把索引从 6 拓宽到 ~15+，
// 同时买一次 bundle 让账本出现成交记录（注意：自购均为 kind:"self"，属 seeding 索引，
// 不是真实外部销售 —— 真盈利仍依赖外部 agent 买家，本脚本只负责把「被发现」的概率拉满）。
//
// 用法（需先充值 + 配置）：
//   EVM_PRIVATE_KEY=0x...（买家钱包，Base mainnet 持有 USDC，无需 ETH）
//   node seed-index.js            # 真实购买全部目标端点
//   DRY=1 node seed-index.js      # 只打印将购买的 URL，不付钱
//
// 目标端点取自 MARKETING.md「最高需求未索引集群」表，按搜索词热度排序；优先覆盖
// inflation/gdp 之外的第三高频词 unemployment，以及人口/健康/能源/贸易等常见检索面。

import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import { publicBase } from './brand.js';

const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
const NETWORK = process.env.NETWORK || 'eip155:8453';
const BASE = publicBase();
const DRY = process.env.DRY === '1';

// 高需求、当前未索引（或索引标记 stale）的端点，按检索热度排序。
// 价格区间来自 MARKETING.md：「Cost of widening the index」表。
const TARGETS = [
  '/report/macro-unemployment',   // $0.13 — 第三高频宏观检索词，gdp/inflation 已索引
  '/report/macro-population',     // $0.09 — demographics
  '/report/macro-health',         // $0.08 — healthcare spending
  '/report/macro-life-expectancy',// $0.12 — public health
  '/report/macro-renewable-power',// $0.10 — solar/wind
  '/report/macro-air-quality',    // $0.11 — pollution
  '/report/macro-trade',          // 贸易平衡（常见检索）
  '/report/macro-debt',           // 政府债务（常见检索）
  '/report/region-apac',          // 区域快照
  '/report/pair-us-cn',           // 双经济体对比（最高频 pair）
  '/report/bundle',               // $0.95 — 全目录，账本破 0 成交记录
];

if (!PRIVATE_KEY && !DRY) {
  console.error('Missing EVM_PRIVATE_KEY (buyer wallet on Base mainnet with USDC). Set it, then re-run.');
  process.exit(1);
}

if (DRY) {
  console.log(`[DRY] Would settle ${TARGETS.length} endpoints on ${NETWORK}:`);
  for (const t of TARGETS) console.log('  ', BASE + t);
  process.exit(0);
}

const signer = privateKeyToAccount(PRIVATE_KEY);
console.log('buyer wallet :', signer.address);
console.log('network      :', NETWORK, '(MAINNET — real USDC will be spent)');
console.log('targets      :', TARGETS.length, 'endpoints\n');

const client = new x402Client().register(NETWORK, new ExactEvmScheme(signer));
const fetchWithPay = wrapFetchWithPayment(fetch, client);

let ok = 0, fail = 0;
for (const t of TARGETS) {
  const url = `${BASE}${t}`;
  try {
    const res = await fetchWithPay(url);
    if (res.ok) {
      const body = await res.text();
      console.log(`  [OK]   ${t} -> HTTP ${res.status}, ${body.length} bytes`);
      ok++;
    } else {
      console.log(`  [FAIL] ${t} -> HTTP ${res.status}`);
      fail++;
    }
  } catch (e) {
    console.log(`  [ERR]  ${t} -> ${e.message}`);
    fail++;
  }
}
console.log(`\nDone: ${ok} settled, ${fail} failed.`);
console.log('Verify index widened:');
console.log(`  curl "${process.env.FACILITATOR_URL || 'https://facilitator.payai.network'}/discovery/resources?payTo=${process.env.PAYOUT_ADDRESS}"`);
