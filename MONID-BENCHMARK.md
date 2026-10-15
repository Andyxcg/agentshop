# 竞品对标：Monid.ai vs agentshop（reportbazaar）

> 研究日期：2026-10-11
> 对象：https://monid.ai/（注意 `fpr=puhmmk` 是 affiliate 推荐参数，研究用途）
> 结论前置：**Monid 是横向工具路由器，我们是垂直数据商店；它最大的价值不是当竞品，而是当我们的分发渠道——它开放 provider 入驻。**

---

## 一、Monid 是什么（模式拆解）

定位：**"Agent 界的 OpenRouter"**——统一工具调用 + 统一支付基础设施，干掉海量 API Key 与订阅。

- **横向聚合**：2400+ 工具 / 88+ 提供商（搜索、社媒爬取、销售线索、电商、链上 DeFiLlama、音视频、3D、私有商业数据等）。
- **一个 balance 付所有**：中心化（法币）统一余额，pay-per-call，单价极低（$0.001–0.01 / call）。
- **三种接入**：Skill（一行注入）/ MCP（远程 MCP server）/ CLI。
- **discover → inspect → run 工作流**：agent 自主语义发现工具、看 schema 与实时报价、再调用；免费发现+检查，只付实际调用。
- **破冰**：起步 $1 免费额度，无订阅。
- **开放 provider 入驻**：「Have an API agents should be calling? List it on Monid. We route agent traffic, meter every call, share revenue.」另提 "Monid is open source. Contribute your tool → Contribute on GitHub"。
- **GTM**：极强内容营销（每个用例一篇 blog + 真实 receipt 透明账单）+ affiliate 推荐链接 + 各 AI 工具目录。
- **公司**：Monid Inc，Delaware C-Corp，San Francisco。

---

## 二、对标维度表

| 维度 | Monid | agentshop (reportbazaar) |
|---|---|---|
| 定位 | 横向工具路由器（OpenRouter for tools） | 垂直宏观数据商店 |
| 品类广度 | 2400+ 工具 / 88+ 提供商 / 多域 | 115 报告 / 单一宏观域 / 自有 WB 数据 |
| 支付机制 | 中心化法币 balance（非链上） | x402 真链上 USDC on Base |
| 定价 | 微支付 $0.001–0.01 / call | $0.07–0.95 / 报告，bundle $0.95 |
| 接入方式 | Skill / MCP / CLI | MCP + HTTP 402 |
| 发现机制 | 语义 discover + 按 fit&price 排序 | 须真实结算才被 Bazaar 索引（死循环） |
| GTM | $1 免费额度 + 强内容营销 + affiliate | x402 目录 + Glama（刚收录） |
| 收入模型 | 路由抽成（provider 分成） | 100% 自有销售 |
| 失败保护 | 调用失败不扣费 | 链上支付即结算 |

---

## 三、对我们的启示（可抄的打法）

1. **最大机会——入驻 Monid 当 provider**：把 115 个宏观报告挂到 Monid，借它的 2400+ 工具流量 + 统一法币支付，**直接绕过我们的"买家钱包耗尽 → 0 成交"死循环**。这是把"有入口"变成"有收入"性价比最高的动作。
2. **微定价破冰**：我们单份最低 $0.07 对 agent 偏贵。可学 $1 免费额度 / 更慷慨免费预览 / 单指标免费+完整报告付费。
3. **内容营销 = 用例 receipt**：Monid 每篇 blog 展示"跑了什么、花了多少"，增强信任。我们几乎零内容营销。
4. **affiliate 机制**：Monid 用 `fpr=` 推荐链接（用户给的链接即 affiliate）。我们可建自己的推荐/分销。

---

## 四、风险与取舍

- **哲学冲突**：Monid 中心化法币 balance；我们是 x402 去中心化真支付。入驻 Monid 等于接受它中间路由——对"变现"是好事，对"x402 理念"是妥协（但 x402 自有目录仍保留）。
- **价格劣势**：Monid 单价 $0.001 级，我们 $0.07+。入驻后需用"独家 WB 宏观深度"差异化，或下调单价靠量走。
- **分成稀释**：provider 收入要被 Monid 抽成，单笔更低，但换的是它带来的 agent 流量——边际远大于当前 0。

---

## 五、建议下一步（单一推荐）

**把 agentshop 作为 provider 入驻 Monid**。

- 路径 A（开源）：GitHub contribute 工具 → 进开源目录（免费，但未必进托管付费版）。
- 路径 B（商业）：app.monid.ai 或联系团队，进托管版按调用分成。
- 包装：把现有 `/report/:id`（402 端点）+ catalog 包成 Monid 工具，定价可降到 $0.02–0.05 / 报告，用"独家 20 经济体宏观数据"做差异化。
- 同时抄它的内容营销 + 透明 receipt，补我们 0 内容短板。

待用户拍板是否动手入驻（涉及对外提交、定价策略调整）。
