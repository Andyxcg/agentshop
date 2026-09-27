// 自动领水（Base Sepolia）：支持两种无验证码通道，谁有 key 用谁
//   1) Circle Faucet API  -> 仅 USDC（免费 TEST_API_KEY: developers.circle.com）
//   2) Coinbase CDP      -> ETH + USDC 同时给（免费 key: portal.cdp.coinbase.com）
// 买家地址自动从 EVM_PRIVATE_KEY 派生，无需手填。
import dotenv from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';

dotenv.config();
dotenv.config({ path: '.env.local' });

function derive(addr) {
  return addr;
}
const PK = process.env.EVM_PRIVATE_KEY;
const ADDR = process.env.BUYER_ADDRESS || (PK ? privateKeyToAccount(PK).address : null);

async function main() {
  if (!ADDR) {
    console.error('✗ 缺少 BUYER_ADDRESS / EVM_PRIVATE_KEY');
    process.exit(1);
  }
  console.log('目标地址:', ADDR, '\n');

  const cdpId = process.env.CDP_API_KEY_ID;
  const cdpSecret = process.env.CDP_API_KEY_SECRET;
  const circleKey = process.env.CIRCLE_TEST_API_KEY;

  if (cdpId && cdpSecret) {
    console.log('▶ 使用 Coinbase CDP 通道（同时领 ETH + USDC）');
    const { CdpClient } = await import('@coinbase/cdp-sdk');
    const cdp = new CdpClient();
    for (const token of ['eth', 'usdc']) {
      try {
        const tx = await cdp.evm.requestFaucet({ address: ADDR, network: 'base-sepolia', token });
        console.log(`✓ ${token.toUpperCase()} 已申领 ->`, JSON.stringify(tx).slice(0, 200));
      } catch (e) {
        console.log(`✗ ${token.toUpperCase()} 失败:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    fs.appendFileSync('.faucet-log', `${new Date().toISOString()} CDP claimed eth+usdc for ${ADDR}\n`);
    return;
  }

  if (circleKey) {
    console.log('▶ 使用 Circle Faucet API 通道（USDC）');
    console.log('  ⚠ 已知限制：Circle 官方注明 /v1/faucet/drips 需「升级主网」权限，免费 TEST_API_KEY 通常返回 403 Forbidden。');
    console.log('    若看到 403，请改用 CDP 通道（见下方指引）。');
    const ENDPOINT = 'https://api.circle.com/v1/faucet/drips';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${circleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: ADDR, blockchain: 'BASE-SEPOLIA', native: false, usdc: true }),
      });
      const text = await res.text();
      if (res.status < 300) {
        console.log(`✓ USDC -> HTTP ${res.status}`, text.slice(0, 200));
      } else if (res.status === 403) {
        console.log(`✗ USDC -> HTTP 403 Forbidden（Circle 沙箱 key 无权调水龙头，需主网账户或换 CDP 通道）`);
      } else {
        console.log(`✗ USDC -> HTTP ${res.status}`, text.slice(0, 200));
      }
    } catch (e) {
      console.log(`✗ USDC 失败:`, e.message);
    }
    fs.appendFileSync('.faucet-log', `${new Date().toISOString()} Circle attempt for ${ADDR}\n`);
    return;
  }

  console.log('⚠ 两个通道都缺 key，无法自动领水。二选一（免费，1 分钟）：');
  console.log('');
  console.log('【A. Coinbase CDP — 推荐，一次给 ETH+USDC】');
  console.log('   1) 打开 https://portal.cdp.coinbase.com 注册/登录');
  console.log('   2) 创建 API Key，复制 Key ID 与 Secret');
  console.log('   3) 在 .env 填：CDP_API_KEY_ID=...  CDP_API_KEY_SECRET=...');
  console.log('   4) 运行：node faucet-claim.js');
  console.log('');
  console.log('【B. Circle Faucet API — 仅 USDC，ETH 需另走 CDP/控制台】');
  console.log('   1) 打开 https://developers.circle.com 创建 TEST_API_KEY（形如 TEST_API_KEY:xxx:xxx）');
  console.log('   2) 在 .env 填：CIRCLE_TEST_API_KEY=TEST_API_KEY:xxx:xxx');
  console.log('   3) 运行：node faucet-claim.js');
  console.log('');
  console.log('提示：x402 演示买家需同时持有 USDC（付款）与 ETH（付 gas）。CDP 通道可一次补齐。');
  process.exit(2);
}

main();
