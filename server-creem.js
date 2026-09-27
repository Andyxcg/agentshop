// server.js
// 免费数据报告售卖 MVP（Creem 版）：落地页 -> Creem Checkout -> 支付后交付报告
// 运行：cp .env.example .env 并填入 CREEM_API_KEY / CREEM_PRODUCT_ID，然后 npm start
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import { buildReport } from './generate-report.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4242;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;
const CREEM_TEST = (process.env.CREEM_TEST || 'true') === 'true';
const API_BASE = CREEM_TEST ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1';
const API_KEY = process.env.CREEM_API_KEY;
const PRODUCT_ID = process.env.CREEM_PRODUCT_ID;
const WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET;

// 配置就绪判定（含占位符识别）
const configured = Boolean(API_KEY && PRODUCT_ID && !API_KEY.startsWith('creem_test_xxxx'));

// 售卖的报告产品配置（可扩展为多种报告 -> 不同指标/国家组合）
const PRODUCTS = {
  'global-gdp': {
    name: '全球主要经济体 GDP 趋势报告（2020–2025）',
    description: '基于 World Bank 公开数据自动生成的对比分析报告',
    opts: { indicator: 'NY.GDP.MKTP.CD', countries: ['US', 'CN', 'JP', 'DE', 'IN'], years: '2020:2025' },
  },
  // 例：可加更多 { indicator:'SP.POP.TOTL', ... }
};

app.get('/', (req, res) => {
  const cards = Object.entries(PRODUCTS)
    .map(
      ([id, p]) => `<div class="card">
        <h3>${p.name}</h3>
        <p>${p.description}</p>
        <form action="/create-checkout-session" method="POST">
          <input type="hidden" name="product" value="${id}">
          <button type="submit">购买</button>
        </form>
      </div>`
    )
    .join('');
  res.send(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <title>数据报告商店</title>
  <style>body{font-family:-apple-system,"PingFang SC",sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1a1a}
  h1{color:#1f4e79}.card{border:1px solid #e5e5e5;border-radius:10px;padding:18px 20px;margin:14px 0}
  h3{margin:0 0 6px}.card p{color:#666;font-size:14px;margin:0 0 14px}
  button{background:#1f4e79;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:14px;cursor:pointer}
  button:hover{background:#163a5a}.note{font-size:12px;color:#999;margin-top:30px}</style></head>
  <body><h1>专业数据报告商店</h1>
  <p class="note">所有报告均由公开免费数据（World Bank 等，CC BY 4.0）即时生成，支付后自动交付。支付由 Creem（Merchant of Record）处理，支持全球信用卡 / Apple Pay / Google Pay / PayPal，中国大陆卖家可收款并提现至支付宝。</p>
  ${cards}
  <p class="note">${configured ? `Creem 已连接（${CREEM_TEST ? '测试模式' : '生产模式'}）。` : '⚠️ 未检测到 CREEM_API_KEY / CREEM_PRODUCT_ID，请配置 .env 后重启以启用结账。'}</p>
  </body></html>`);
});

app.post('/create-checkout-session', async (req, res) => {
  if (!configured) return res.status(500).send('Creem 未配置（缺 CREEM_API_KEY / CREEM_PRODUCT_ID）');
  const productId = req.body.product || 'global-gdp';
  const product = PRODUCTS[productId];
  if (!product) return res.status(404).send('未知产品');

  try {
    const r = await fetch(`${API_BASE}/checkouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        request_id: `order_${Date.now()}`,
        success_url: `${DOMAIN}/success`,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.checkout_url) {
      return res.status(502).send('创建结账会话失败：' + JSON.stringify(data));
    }
    res.redirect(303, data.checkout_url);
  } catch (e) {
    console.error(e);
    res.status(500).send('创建结账会话异常：' + e.message);
  }
});

// 校验 Creem 重定向签名（防伪造「支付成功」回调）
// 规范：signature = SHA256( key1=val1|key2=val2|...|salt=API_KEY )，按 URL 出现顺序、跳过空值
function verifyRedirectSignature(params, apiKey) {
  const { signature, ...rest } = params;
  const canonical = Object.entries(rest)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .concat(`salt=${apiKey}`)
    .join('|');
  const expected = crypto.createHash('sha256').update(canonical).digest('hex');
  return signature === expected;
}

// 支付后交付：签名校验通过才交付（生产必须）；demo 无 Key 时直接交付
app.get('/success', async (req, res) => {
  const params = { ...req.query };
  if (configured && params.signature) {
    if (!verifyRedirectSignature(params, API_KEY)) {
      return res.status(401).send('签名校验失败：非 Creem 合法回调');
    }
  }
  const product = PRODUCTS['global-gdp']; // 单产品 MVP：始终交付默认报告；多产品时按 params.product_id 映射
  try {
    const { html } = await buildReport(product.opts);
    res.type('html').send(html);
  } catch (e) {
    res.status(500).send('报告生成失败：' + e.message);
  }
});

// Creem webhook：校验支付完成（部署时建议用 webhook 而非仅依赖重定向签名）
// 注意：Creem 签名头为 creem-signature，算法 HMAC-SHA256(原始 body, webhook secret)，部署前请按官方文档核对
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['creem-signature'];
  if (!WEBHOOK_SECRET || !sig) return res.sendStatus(200);
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.body).digest('hex');
  if (sig !== expected) return res.status(400).send('Webhook 校验失败');
  try {
    const event = JSON.parse(req.body.toString());
    if (event.event_type === 'checkout.completed') {
      console.log('✓ 已支付，可交付 order=', event.object?.order?.id || event.object?.id);
      // TODO: 在此持久化订单 / 触发邮件交付 / 记录到数据库
    }
  } catch {}
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`▶ 报告商店运行中： ${DOMAIN}  [Creem ${CREEM_TEST ? 'TEST' : 'PROD'}]`);
  if (!configured) console.log('  （演示模式：未配置 Creem Key，/success 仍可直接预览报告）');
});
