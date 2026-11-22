# 项目状态（供后续会话/接手者阅读）

> 最后更新：2026-11-22
> 仓库：https://github.com/qianlian-mozi/conference_journal_tool （Private）

## 一句话

可复用的会议/期刊投稿情报工作流：仓库里是**带证据的数据**（YAML），由 GitHub Actions 定时抓官网更新；以 3DGS / Avatar 为旗舰包、CV 为可信核心，用户可带自己的 agent 扩展其他领域。

## 已完成

| 模块 | 状态 | 说明 |
|---|---|---|
| M0 数据契约 v2 | ✅ | `core/schema.ts`（zod）；`cmd/validate.ts` 校验 schema、时区互校、原文回验 |
| M1 采集链路 | ✅ | `acquire/`：抓取、内容寻址快照、CVF 家族 / table-dates / section-dates / SIGGRAPH widget / list-timeline 适配器、quote 闸门；`cmd/update.ts` 抓取→diff→写回→changelog |
| M2 Actions | ✅ | `.github/workflows/ci.yml`（validate + privacy + test + build）、`update-data.yml`（每周一 + 手动，自动开 PR） |
| M3 数据 | ✅ 达到目标 | 12 会议：CVPR 2027、ICCV 2027（未公布）、ICLR 2027、WACV 2027、NeurIPS 2026（已结束）、3DV 2027、ICIP 2027、ICPR 2026、SIGGRAPH 2027、ISMAR 2027（未公布）、IEEE VR 2027、Eurographics 2027；8 期刊：TPAMI / IJCV / IEEE TIP / Pattern Recognition / CVIU / MVA / TOG / TVCG（均 rolling） |
| M4 前端 | ✅ 首版 | 货架视图、状态色、筛选、详情证据；pack 切换与分享；首页近 7 天真实 deadline 变更；当前列表 ICS 下载与每包订阅文件 |
| M5 Agent / AI 层 | 🟡 基线 | 确定性自然语言筛选 CLI；领域包 + agent-first 接入文档 + 可复制 skill；planned 包外部用户流程已实测；未绑定模型，变更摘要与论文匹配未做 |
| Agent 层（CLI/MCP/AGENTS.md） | ✅ 首版 | 共用查询引擎；CLI 与 MCP 保留全部届次和 evidence；有契约回归测试 |
| 接入层（add-venue） | ✅ 首版 | 生成可校验骨架与源登记；默认预览、`--write` 才落盘；不会生成日期 |
| 发现层（discover） | ✅ 首版 | 领域候选 YAML + 人工确认；匹配未收录 venue、可选官网核验、生成 add-venue 命令；不抓搜索页、不写数据 |
| 领域包（field packs） | ✅ 首版 | core/community/local、唯一默认包、多对多 venue 复用；3DGS / Avatar 与 CV 包各覆盖 14 个 venue（有重叠）；构建与 Web 支持多包 |

## 仓库结构

```text
core/          schema(zod)、pack 契约、时间/AoE 换算、YAML 加载、查询引擎、确定性 NL 筛选
acquire/       fetch、snapshot（sha256 内容寻址）、adapters/thecvf.ts、table-dates.ts、section-dates.ts、siggraph-widget.ts、list-timeline.ts
cmd/           update（抓取→diff→写回）、validate（三道闸门）、query、ask、add-venue、discover
mcp/           MCP stdio server 与三个查询工具
data/          fields/ 领域包、venues/ 数据、snapshots/ 快照、discovery/ 候选清单、changelog.yaml 变更日志
sources/       registry.yaml 源登记表
scripts/       build-data.mjs（YAML→JSON）、export-calendars.mjs（每包 ICS）、check-privacy.mjs
src/           React 货架视图；generated/venues.json 是构建产物
docs/PLAN.md   产品与技术规划 v2.1
docs/PACKS.md  领域包契约、复用与验收清单
docs/AGENT_ONBOARDING.md  用户自带 agent / LLM 的接入工作流
docs/ADD_A_VENUE.md  新 venue 接入手册
docs/DISCOVER.md     候选发现与人工确认流程
docs/ASK.md          自然语言筛选的边界与支持问法
docs/CHANGELOG.md     变更日志与首页近 7 天窗口
docs/CALENDAR.md      ICS 导入、订阅与时区边界
docs/EXTERNAL_ONBOARDING_TEST.md  外部用户自定义领域实测
CONTRIBUTING.md       数据、领域包、适配器贡献流程与 PR 清单
skills/venue-onboarding/SKILL.md  可复制的 agent 技能
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
- **变更只记真实 diff**：`update --write` 才写 `data/changelog.yaml`；dry-run、抓取失败、未公布日期都不产生事件；removed 保留旧证据；venue 与 changelog 采用带回滚的统一提交，失败重试不会漏记。
- **构建可复现**：`generated_at` 取数据里最新的核验日期，不取当前时钟；订阅 ICS 的 `DTSTAMP` 则取本次构建时间，确保同一核验日内修订也能被日历客户端识别。
- **日历不猜时刻**：只导出已有 `due_utc`，原时区与证据保留在事件描述；rolling 和待确认日期不生成事件。
- **不内置全世界**：可信核心负责证明质量，field pack 负责领域复用；同一 venue 可共享，数据真相只有一份。
- **用户自带 agent/LLM**：不绑定供应商、不存 API key；模型起草候选和 patch，确定性工具保留写入与验收权。

## 已知问题 / 待办

1. **候选清单仍靠人工维护**。`discover` 只匹配 `data/discovery/<field>.yaml`，不做搜索引擎抓取；新增会议/期刊仍需人工确认官网后补候选。
2. **自动抽取覆盖 CVF / NeurIPS 同模板、3DV / ICIP / IEEE VR 表格、ICPR 主会文本区块、SIGGRAPH Technical Papers widget 与 Eurographics 日期时间线**；ACM、Springer、EasyChair 等平台仍需要新适配器。`table-dates` 支持原生与 ARIA 表格：优先信页面自带时间戳并保留进快照；无时间戳时只接受页面统一明示的 23:59 AoE 纯文本日期。`section-dates` 只接受主会区块内行内显式 AoE 的日期。`siggraph-widget` 只接受与可见文本一致的 UTC 隐藏字段。`list-timeline` 只读日期开头的列表项，遵循页面级 AoE 声明、官网明确延期与划掉的旧节点。本地时区必须与时间戳互校，抽取失败若会删除既有日期则中止写入。
3. **"真实变更 → 自动开 PR" 路径尚未被真实触发**（官网一直没变）；changelog 已能记录真实 diff，SIGGRAPH 首次接入已产生新增事件。
4. **前端已有货架 + 近 7 天变更 + ICS**；论文→期刊推荐和 AI 问答仍未做。
5. **仓库仍为 Private**；公开前需跑 `npm run audit:privacy` 并决定 LICENSE 署名、`orchestration/` 是否保留。
6. **NL 筛选是确定性规则，不是模型**。只覆盖文档列出的说法；新增问法需要改解析器与测试，不能指望它自由理解。当前没有变更摘要、论文匹配，也没有默认开启的 LLM 调用。

## 下一步建议

1. **继续把 3DGS / Avatar 包做深**：SIGGRAPH、IEEE VR、Eurographics、TOG、TVCG 已接入，ISMAR 保留未公布空状态；SIGGRAPH Asia 2027 尚未发布 Technical Papers 日期页，等官网给出可回验来源后再接入，不能拿 2026 页面冒充。
2. **邀请真实外部用户跑 agent onboarding**：本地模拟已跑通 planned 包→RSS 骨架→active→validate/build/discover，并修复 planned 包不能接入的阻塞点，见 docs/EXTERNAL_ONBOARDING_TEST.md；下一步用真实 fork/PR 检验权限、审核体验和文档可理解性，再决定是否抽象插件 API。
3. 补 GitHub 首页截图式 demo；公开前继续隐私审计与 License 检查。
4. 扩展 ACM、Springer、EasyChair 等平台适配器，同时保持 quote 回验硬闸门。
5. 后续再做变更摘要与可选模型编译：模型只产计划/patch，执行仍由确定性工具完成。
