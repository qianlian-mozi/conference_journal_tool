# 项目状态（供后续会话/接手者阅读）

> 最后更新：2026-11-21
> 仓库：https://github.com/qianlian-mozi/conference_journal_tool （Private）

## 一句话

CV 会议/期刊投稿情报工具：仓库里是**带证据的数据**（YAML），由 GitHub Actions 定时抓官网更新，前端做成"按截止天数排序的货架"。

## 已完成

| 模块 | 状态 | 说明 |
|---|---|---|
| M0 数据契约 v2 | ✅ | `core/schema.ts`（zod）；`cmd/validate.ts` 校验 schema、时区互校、原文回验 |
| M1 采集链路 | ✅ | `acquire/`：抓取、内容寻址快照、CVF 家族与 table-dates 适配器、quote 闸门；`cmd/update.ts` 抓取→diff→写回 |
| M2 Actions | ✅ | `.github/workflows/ci.yml`（validate + privacy + test + build）、`update-data.yml`（每周一 + 手动，自动开 PR） |
| M3 数据 | 🟡 部分 | 7 会议：CVPR 2027、ICCV 2027（未公布）、ICLR 2027、WACV 2027、NeurIPS 2026（已结束）、3DV 2027、ICIP 2027；6 期刊：TPAMI / IJCV / IEEE TIP / Pattern Recognition / CVIU / MVA（均 rolling，期刊目标已达标） |
| M4 前端 | ✅ 首个版本 | 货架视图：按截止天数排序、状态色、筛选、详情带来源 |
| M5 AI 层 | 🟡 基线 | 确定性自然语言筛选 CLI：`core/ask.ts` + `cmd/ask.ts`，12 条固定问句测试；未接模型，变更摘要与论文匹配未做 |
| Agent 层（CLI/MCP/AGENTS.md） | ✅ 首版 | 共用查询引擎；CLI 与 MCP 保留全部届次和 evidence；有契约回归测试 |
| 接入层（add-venue） | ✅ 首版 | 生成可校验骨架与源登记；默认预览、`--write` 才落盘；不会生成日期 |
| 发现层（discover） | ✅ 首版 | 领域候选 YAML + 人工确认；匹配未收录 venue、可选官网核验、生成 add-venue 命令；不抓搜索页、不写数据 |

## 仓库结构

```text
core/          schema(zod)、时间/AoE 换算、YAML 加载、查询引擎、确定性 NL 筛选
acquire/       fetch、snapshot（sha256 内容寻址）、adapters/thecvf.ts、adapters/table-dates.ts
cmd/           update（抓取→diff→写回）、validate（三道闸门）、query、ask、add-venue、discover
mcp/           MCP stdio server 与三个查询工具
data/          fields/ 领域包、venues/ 数据、snapshots/ 快照、discovery/ 候选清单
sources/       registry.yaml 源登记表
scripts/       build-data.mjs（YAML→JSON）、check-privacy.mjs
src/           React 货架视图；generated/venues.json 是构建产物
docs/PLAN.md   产品与技术规划 v2
docs/ADD_A_VENUE.md  新 venue 接入手册
docs/DISCOVER.md     候选发现与人工确认流程
docs/ASK.md          自然语言筛选的边界与支持问法
```

## 常用命令

```bash
npm install
npm run validate      # 数据校验（schema + 时区 + 原文回验）
npm run update:dry    # 抓官网看会改什么（不落盘）
npm run update        # 抓官网并写回 YAML + 快照
npm run add-venue -- <url> --id <id> --short <简称> --full "<全称>"  # 预览新 venue 骨架
npm run add-venue -- --write <url> ...                              # 落盘
npm run discover -- bmvc                                             # 在候选清单里找未收录 venue
npm run ask -- "未来三个月还能投的会议"                             # 确定性自然语言筛选
npm run dev           # 本地货架视图（先 build-data）
npm run test:all      # 全部单元测试与旧版 CLI 集成测试
npm run audit:privacy # 公开前自查：路径/邮箱/密钥/机器名
```

## 关键决策

- **数据放仓库 YAML**，不用数据库：PR diff 就是审核界面，fork 即可分叉。
- **quote 闸门**：edition 与每条日期必须带官网原文，且能在对应快照里逐字命中，否则拒收；`validate` 两层都回验。
- **两种时间口径**：页面上有倒计时时间戳就用它（`due_source: timestamp`），没有才从文本解析（`text`），后者在数据里可辨认。
- **滚动期刊**：`submission_model: rolling`，没有 deadline，`validate` 强制这一点。
- **幂等更新**：值没变就沿用原证据（含 `fetched_at`），避免"只改时间戳"的伪 PR。
- **构建可复现**：`generated_at` 取数据里最新的核验日期，不取当前时钟。

## 已知问题 / 待办

1. **候选清单仍靠人工维护**。`discover` 只匹配 `data/discovery/<field>.yaml`，不做搜索引擎抓取；新增会议/期刊仍需人工确认官网后补候选。
2. **自动抽取覆盖 CVF / NeurIPS 同模板与 3DV / ICIP 风格表格**；ACM、Springer、EasyChair 等平台仍需要新适配器。`table-dates` 支持原生与 ARIA 表格：优先信页面自带时间戳并保留进快照；无时间戳时只接受页面统一明示的 23:59 AoE 纯文本日期。本地时区必须与时间戳互校，抽取失败若会删除既有日期则中止写入。
3. **"真实变更 → 自动开 PR" 路径尚未被真实触发**（官网一直没变）。
4. **前端只有货架**，没有"论文→期刊推荐"，也没有 AI 问答。
5. **仓库仍为 Private**；公开前需跑 `npm run audit:privacy` 并决定 LICENSE 署名、`orchestration/` 是否保留。
6. **NL 筛选是确定性规则，不是模型**。只覆盖文档列出的说法；新增问法需要改解析器与测试，不能指望它自由理解。当前没有变更摘要、论文匹配，也没有默认开启的 LLM 调用。

## 下一步建议

1. 扩充 `data/discovery/computer-vision.yaml` 候选，并给候选补当届 Dates/CFP 页；只加人工确认过的官网。
2. 扩展其他非 CVF 平台适配器（ACM、Springer、EasyChair 等），同时保持 quote 回验硬闸门。
3. 继续补 M3 数据覆盖（目标 8–12 会议 + 4–6 期刊）。截至 2026-11-21 已有 7 个会议，第 8 个暂时被官网发布时间阻塞：ICPR 2028、ACM MM 2027、MICCAI 2027、ICRA 2027、BMVC 2027 的论文日期均尚未公布；它们已列入 discover 候选，公布后再接入。数据侧可先转 M5 的自然语言筛选。
4. 在 M5-A 的确定性解析器之上，可选接 OpenAI 兼容端点：模型只产出 `AskPlan`（筛选对象），执行仍由 `queryVenues` 完成；必须保留 12 条拒绝/不编造回归。
