# CV Venue Radar

一个面向科研人员的**开源、本地优先**会议 / 期刊投稿情报工具。以 **3DGS / 3D Avatar** 为旗舰样例，以 Computer Vision 为可信核心数据集。

目标不是内置全世界 venue，而是提供一套**用户和 agent 都能复用的、带证据的接入工作流**。

它不只是把会议列出来：**它自己盯着官网更新，并且每条日期都能追溯到官网页面上那一行原文。**

> 早期版本（v0.2）。已完成「采集 → 快照 → 抽取 → 校验 → 写回」闭环、GitHub Actions 定时更新、可切换领域包的 Web 界面，以及面向 agent 的 CLI / MCP 查询层。3DGS / Avatar 包精选 CVPR / ICCV / 3DV / NeurIPS / ICLR 与 TPAMI / IJCV / IEEE TIP；完整 CV 包另含 WACV / ICIP / ICPR 和更多 rolling 期刊。

---

## 它解决什么问题

- 我手上这篇稿子，**未来三个月还有哪些会能投**？哪个截止最近？
- 上周看还是 11 月 16 日，**现在延期了吗**？
- 这条日期**从哪来的、什么时候核对的**？我能不能信？

现有 deadline 站点解决「列出来」，但普遍不解决「可追溯」和「变更感知」，而且你没法自己修。
这个项目把数据放在 Git 仓库里：**PR 的 diff 就是审核界面，fork 就能改成你自己要的样子**。

---

## 先看 3DGS / Avatar 样例

```bash
npm install
npm run dev
# 打开 http://localhost:5173/?pack=3dgs-avatar
```

默认首页只展示这个方向真正相关的 8 个 venues；切换「领域包」即可查看完整 CV 数据。每个 pack 只声明 venue 成员，不复制日期和证据。

想继续扩展这个方向：

```bash
npm run discover -- --field 3dgs-avatar --all
npm run discover -- --field 3dgs-avatar siggraph
```

候选清单里还有 SIGGRAPH / SIGGRAPH Asia / Eurographics / IEEE VR / ISMAR，以及 TOG / TVCG / CGF。没有确认当届 Dates 页的候选**不会生成接入命令**，也不会出现猜测日期。

---

## 快速开始

需要 Node.js ≥ 22（开发时用 24）。

```bash
git clone <your-fork-url> cv-venue-radar
cd cv-venue-radar
npm install

npm run validate     # 校验数据：schema、时区换算、原文回验
npm run update:dry   # 抓官网，看看会改什么（不落盘，需要联网）
npm run dev          # 本地货架式 Web 界面（按截止时间与状态排序）
npm run query -- --within 90 --json  # 给脚本 / agent 的结构化查询
npm run ask -- "未来三个月还能投的会议"  # 确定性自然语言筛选，不调用模型
npm run add-venue -- https://example.org/2027/dates --id example --short EXAMPLE --full "Example Conference"  # 预览新 venue
npm run discover -- bmvc                     # 在领域候选清单里找还没收录的 venue
```

没有任何账号、没有后端服务、没有数据库。数据就是仓库里的 YAML 文件。

---

## 自动更新是怎么工作的

```
sources/registry.yaml            每个 venue 的官方页 + 抓取频率
        │
        ▼
fetch  ──► 规范化文本快照 ──► sha256
        │                        │
        │                  与上次相同？──是──► 结束（0 成本，占 80%+）
        │                        │否
        ▼                        ▼
   抽取（三级）  ──►  与现有 YAML 做字段级 diff  ──►  闸门  ──►  写回 / 开 PR
```

三道闸门，缺一不可：

1. **原文回验**：edition 与每条截止日期必须带官网原文 `quote`，且该 `quote` 能在对应快照里**逐字命中**。抽错、编造的一律进不了数据文件；`validate` 会同时检查两层证据。
2. **时区自校**：`due + timezone` 换算出的 UTC 必须与页面上内嵌的 UTC 时间戳一致（容差 60 秒），AoE / UTC / IANA 时区都在校验范围内。
3. **结构变化不覆盖**：页面改版导致抽取为空时，保留旧数据并报警，不会把已有信息清空。

抽取链路分为确定性适配器与可复用模板；遇到新站点时，外部 agent 可以协助阅读页面、起草适配器或 patch，但必须重新经过快照、quote 和时区闸门。当前仓库**不内置 LLM 自动兜底**：模型可以协助「解析」，不能「发明」或直接决定入库。

---

## 数据长什么样

一个 venue 一个文件：`data/venues/cvpr.yaml`

```yaml
schema_version: 2
id: cvpr
type: conference
names:
  short: CVPR
  full: IEEE/CVF Conference on Computer Vision and Pattern Recognition
field_ids: [computer-vision, 3dgs-avatar]
official_url: https://cvpr.thecvf.com/
submission_model: fixed        # fixed（有截止日期）| rolling（期刊常态）
editions:
  - id: cvpr-2027
    year: 2027
    dates: { start: 2027-06-22, end: 2027-06-24 }
    deadlines:
      - id: cvpr-2027-submission-deadline
        kind: paper
        raw_text: Submission Deadline Nov 16 '26 (Anywhere on Earth)
        due: 2026-11-16T23:59:59
        timezone: AoE
        due_utc: 2026-11-17T11:59:59.000Z
        due_source: timestamp   # timestamp = 页面内嵌时间戳；text = 从页面文本解析
        status: confirmed
        evidence:
          url: https://cvpr.thecvf.com/Conferences/2027/Dates
          quote: Submission Deadline Nov 16 '26 (Anywhere on Earth)
          fetched_at: 2026-11-21
          snapshot_hash: bf9325da...
```

快照按内容寻址存放在 `data/snapshots/<venue>/<sha256>.txt`，所以任何时候都能回答「这条数据当时来自哪一版页面」。

---

## 怎么加一个会议

1. `npm run add-venue -- <官方 Dates URL> --id <id> --short <简称> --full "<全称>"` 先预览骨架与源登记。
2. 确认无误后加 `--write` 落盘；命令会同时更新 `data/venues/<id>.yaml` 与 `sources/registry.yaml`。
3. `npm run update:dry -- --venue <id>` 看抽取结果；确认无误后 `npm run update -- --venue <id>`。
4. `npm run validate` 必须全绿，然后提 PR。

目标：**加一个会议 ≤ 10 分钟，不需要读代码。** 详细参数、交互模式与手工兜底见 [docs/ADD_A_VENUE.md](docs/ADD_A_VENUE.md)。自动抽取支持 `adapter: thecvf`（CVF / NeurIPS 同模板）、`adapter: table-dates`（3DV 的 countdown 表格、ICIP 的 ARIA 表格 + 页面明示 AoE 文本日期）与 `adapter: section-dates`（ICPR 的主会文本区块，只接收行内显式 AoE 日期）；其他站点需要新适配器，或按数据契约手工补带证据的日期。

---

## 复用到自己的领域，或交给自己的 agent

一个领域包由 `data/fields/<pack-id>.yaml`、venue 的 `field_ids` 和可选的 `data/discovery/<pack-id>.yaml` 组成。`core` / `community` / `local` 三种层级共用同一套数据契约，活跃包可直接在 Web 中切换。完整格式与验收清单见 [docs/PACKS.md](docs/PACKS.md)。

项目**不绑定模型供应商，也不需要把 API key 放进仓库**。你可以让 Claude Code、Codex、DSH、Cursor 或其他 agent 使用仓库提供的流程：

```text
寻找并确认官网 → discover → add-venue 预览 → 显式写入骨架
→ update dry-run → 检查 diff → update 写入 → validate / test / build
```

模型可以寻找候选、解释页面、起草 adapter 和生成 patch；**只有确定性校验器能决定数据是否入库**。模型升级时直接换 agent，证据链不变。操作手册见 [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md)，可复制技能见 [skills/venue-onboarding/SKILL.md](skills/venue-onboarding/SKILL.md)。

---

## 目录结构

```text
core/         schema(zod)、领域包契约、时间与 AoE 换算、YAML 加载、查询
acquire/      抓取、快照、适配器、更新入口
cmd/          validate / update / query / ask / add-venue / discover 命令
mcp/          零依赖 MCP stdio server 与工具实现
data/         fields/ 领域包、venues/ 数据、snapshots/ 快照、discovery/ 候选清单
sources/      registry.yaml 源登记表
skills/       可复制给 agent 的 venue-onboarding 技能
tests/        校验器、pack、适配器与 Agent 契约测试（vitest）
src/          支持 pack 切换的 React 货架式 Web 界面
docs/PLAN.md  产品与技术规划 v2.1
docs/PACKS.md 领域包契约与复用指南
docs/AGENT_ONBOARDING.md  用户自带 agent / LLM 的接入流程
docs/ADD_A_VENUE.md  新 venue 接入手册
docs/DISCOVER.md     候选发现与人工确认流程
```

---

## 命令

| 命令 | 作用 |
|---|---|
| `npm run validate` | 校验全部数据（schema / 时区 / 原文回验） |
| `npm run update:dry` | 抓官网并打印将要发生的变更 |
| `npm run update` | 抓官网并写回 YAML 与快照 |
| `npm run add-venue -- <url> ...` | 预览新 venue 骨架 + 源登记（`--write` 落盘） |
| `npm run discover -- <关键词>` | 在领域候选清单里找未收录的 venue，给出下一步 |
| `npm run query -- --open --json` | 查询仍可投稿的 venue，保留全部届次与证据 |
| `npm run query -- --venue cvpr --json` | 查询单个 venue 的全部日期 |
| `npm run ask -- "<问题>"` | 自然语言筛选（确定性规则；未识别会明确拒绝） |
| `npm run mcp` | 启动 MCP stdio server（`search_venues` / `get_venue` / `get_deadlines`） |
| `npm run test:all` | 全部单元测试与旧版 CLI 集成测试 |

---

## 路线图

- [x] **M0** 数据契约 v2 + 校验器（含原文回验）
- [x] **M1** 一条真实链路：CVPR / ICCV / WACV 的采集、快照、抽取、写回
- [x] **M2** GitHub Actions 定时 + PR 机器人
- [x] **M3** 铺开到至少 8 个会议 + 4–6 个期刊（当前 8 个会议 + 6 个 rolling 期刊；继续向 12 个会议扩展）
- [x] **M4** Web 界面首版：首页回答「接下来该投什么」
- [ ] **M5** Agent / AI 层：✅ 确定性自然语言筛选基线；✅ 领域包 + 用户自带 agent 的接入工作流；⬜ 变更摘要、可选模型编译、论文→会议匹配
- [ ] **M6** 发布 v0.1.0：CLI 打包、截图式 demo、贡献指南

详见 [docs/PLAN.md](docs/PLAN.md)。

---

## 数据原则

- 官方来源优先；**没有出处的日期不入库**。
- 官方事实、第三方统计、个人经验分开记录，不合成一个分数。
- 未核验或未公布的信息，明确显示「未公布」，绝不用占位数据冒充。
- 抓取遵守 robots.txt，串行、限速，只抓 CFP / Dates 页面。

## 免责声明

本项目提供的信息仅供科研参考，不构成投稿建议。会议与期刊的截止日期可能随时调整，请以官方网站的最新公告为准。

## License

代码 MIT，见 [LICENSE](./LICENSE)。
