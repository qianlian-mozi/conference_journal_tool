# 项目状态（供后续会话/接手者阅读）

> 最后更新：2026-11-21
> 仓库：https://github.com/qianlian-mozi/conference_journal_tool （Private）

## 一句话

CV 会议/期刊投稿情报工具：仓库里是**带证据的数据**（YAML），由 GitHub Actions 定时抓官网更新，前端做成"按截止天数排序的货架"。

## 已完成

| 模块 | 状态 | 说明 |
|---|---|---|
| M0 数据契约 v2 | ✅ | `core/schema.ts`（zod）；`cmd/validate.ts` 校验 schema、时区互校、原文回验 |
| M1 采集链路 | ✅ | `acquire/`：抓取、内容寻址快照、CVF 家族适配器、quote 闸门；`cmd/update.ts` 抓取→diff→写回 |
| M2 Actions | ✅ | `.github/workflows/ci.yml`（validate + privacy + test + build）、`update-data.yml`（每周一 + 手动，自动开 PR） |
| M3 数据 | 🟡 部分 | CVPR 2027、ICCV 2027（未公布）、ICLR 2027、WACV 2027、TPAMI（rolling） |
| M4 前端 | ✅ 首个版本 | 货架视图：按截止天数排序、状态色、筛选、详情带来源 |
| M5 AI 层 | ❌ | 未开始 |
| Agent 层（CLI/MCP/AGENTS.md） | ✅ 首版 | 共用查询引擎；CLI 与 MCP 保留全部届次和 evidence；有契约回归测试 |

## 仓库结构

```text
core/          schema(zod)、时间/AoE 换算、YAML 加载
acquire/       fetch、snapshot（sha256 内容寻址）、adapters/thecvf.ts
cmd/           update（抓取→diff→写回）、validate（三道闸门）、query
mcp/           MCP stdio server 与三个查询工具
data/          fields/ 领域包、venues/ 数据、snapshots/ 快照
sources/       registry.yaml 源登记表
scripts/       build-data.mjs（YAML→JSON）、check-privacy.mjs
src/           React 货架视图；generated/venues.json 是构建产物
docs/PLAN.md   产品与技术规划 v2
```

## 常用命令

```bash
npm install
npm run validate      # 数据校验（schema + 时区 + 原文回验）
npm run update:dry    # 抓官网看会改什么（不落盘）
npm run update        # 抓官网并写回 YAML + 快照
npm run dev           # 本地货架视图（先 build-data）
npm run test:all      # 全部单元测试与旧版 CLI 集成测试
npm run audit:privacy # 公开前自查：路径/邮箱/密钥/机器名
```

## 关键决策

- **数据放仓库 YAML**，不用数据库：PR diff 就是审核界面，fork 即可分叉。
- **quote 闸门**：每条日期必须带官网原文，且能在当次快照里逐字命中，否则拒收。
- **两种时间口径**：页面上有倒计时时间戳就用它（`due_source: timestamp`），没有才从文本解析（`text`），后者在数据里可辨认。
- **滚动期刊**：`submission_model: rolling`，没有 deadline，`validate` 强制这一点。
- **幂等更新**：值没变就沿用原证据（含 `fetched_at`），避免"只改时间戳"的伪 PR。
- **构建可复现**：`generated_at` 取数据里最新的核验日期，不取当前时钟。

## 已知问题 / 待办

1. **信源是手工预置的**（`sources/registry.yaml` 一条条写 URL）。规模化需要 `discover`（搜索 → 判定官网 → LLM 抽取 + quote 回验）。
2. **只覆盖 CVF 家族模板**；ICLR/NeurIPS 同源已验证，其他平台（ACM、Springer、EasyChair）需要新适配器。
3. **"真实变更 → 自动开 PR" 路径尚未被真实触发**（官网一直没变）。
4. **前端只有货架**，没有"论文→期刊推荐"，也没有 AI 问答。
5. **仓库仍为 Private**；公开前需跑 `npm run audit:privacy` 并决定 LICENSE 署名、`orchestration/` 是否保留。

## 下一步建议

1. 做 `discover` / `add-venue`，解决信源登记与新 venue 接入成本。
2. 扩展非 CVF 平台适配器，同时保持 quote 回验硬闸门。
3. 继续补 M3 数据覆盖，再评估 M5 自然语言筛选与变更摘要。
