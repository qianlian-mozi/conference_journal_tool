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
| M3 数据 | 🟡 部分 | 5 会议：CVPR 2027、ICCV 2027（未公布）、ICLR 2027、WACV 2027、NeurIPS 2026（已结束）；6 期刊：TPAMI / IJCV / IEEE TIP / Pattern Recognition / CVIU / MVA（均 rolling，期刊目标已达标） |
| M4 前端 | ✅ 首个版本 | 货架视图：按截止天数排序、状态色、筛选、详情带来源 |
| M5 AI 层 | ❌ | 未开始 |
| Agent 层（CLI/MCP/AGENTS.md） | ✅ 首版 | 共用查询引擎；CLI 与 MCP 保留全部届次和 evidence；有契约回归测试 |
| 接入层（add-venue） | ✅ 首版 | 生成可校验骨架与源登记；默认预览、`--write` 才落盘；不会生成日期 |
| 发现层（discover） | ✅ 首版 | 领域候选 YAML + 人工确认；匹配未收录 venue、可选官网核验、生成 add-venue 命令；不抓搜索页、不写数据 |

## 仓库结构

```text
core/          schema(zod)、时间/AoE 换算、YAML 加载
acquire/       fetch、snapshot（sha256 内容寻址）、adapters/thecvf.ts
cmd/           update（抓取→diff→写回）、validate（三道闸门）、query、add-venue、discover
mcp/           MCP stdio server 与三个查询工具
data/          fields/ 领域包、venues/ 数据、snapshots/ 快照、discovery/ 候选清单
sources/       registry.yaml 源登记表
scripts/       build-data.mjs（YAML→JSON）、check-privacy.mjs
src/           React 货架视图；generated/venues.json 是构建产物
docs/PLAN.md   产品与技术规划 v2
docs/ADD_A_VENUE.md  新 venue 接入手册
docs/DISCOVER.md     候选发现与人工确认流程
```

## 常用命令

```bash
npm install
npm run validate      # 数据校验（schema + 时区 + 原文回验）
npm run update:dry    # 抓官网看会改什么（不落盘）
npm run update        # 抓官网并写回 YAML + 快照
npm run add-venue -- <url> --id <id> --short <简称> --full "<全称>"  # 预览新 venue 骨架
npm run add-venue -- --write <url> ...                              # 落盘
npm run discover -- 3dv                                             # 在候选清单里找未收录 venue
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

1. **候选清单仍靠人工维护**。`discover` 只匹配 `data/discovery/<field>.yaml`，不做搜索引擎抓取；新增会议/期刊仍需人工确认官网后补候选。
2. **只覆盖 CVF 家族 / NeurIPS 同模板页面**；其他平台（ACM、Springer、EasyChair）需要新适配器。3DV 等简单 Dates 页也还不能自动抽取。
3. **"真实变更 → 自动开 PR" 路径尚未被真实触发**（官网一直没变）。
4. **前端只有货架**，没有"论文→期刊推荐"，也没有 AI 问答。
5. **仓库仍为 Private**；公开前需跑 `npm run audit:privacy` 并决定 LICENSE 署名、`orchestration/` 是否保留。

## 下一步建议

1. 扩充 `data/discovery/computer-vision.yaml` 候选，并给候选补当届 Dates/CFP 页；只加人工确认过的官网。
2. 扩展非 CVF 平台适配器（先做 3DV 这类简单 Dates 页），同时保持 quote 回验硬闸门。
3. 继续补 M3 数据覆盖（目标 8–12 会议 + 4–6 期刊），再评估 M5 自然语言筛选与变更摘要。
