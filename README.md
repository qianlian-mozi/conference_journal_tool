# CV Venue Radar

一个面向科研人员的**开源、本地优先**会议 / 期刊投稿情报工具。首版聚焦 **Computer Vision**。

它不只是把会议列出来：**它自己盯着官网更新，并且每条日期都能追溯到官网页面上那一行原文。**

> 早期版本（v0.2）。已完成「采集 → 快照 → 抽取 → 校验 → 写回」闭环、GitHub Actions 定时更新、货架式 Web 界面，以及面向 agent 的 CLI / MCP 查询层。目前收录 CVPR / ICCV / ICLR / WACV / TPAMI。

---

## 它解决什么问题

- 我手上这篇稿子，**未来三个月还有哪些会能投**？哪个截止最近？
- 上周看还是 11 月 16 日，**现在延期了吗**？
- 这条日期**从哪来的、什么时候核对的**？我能不能信？

现有 deadline 站点解决「列出来」，但普遍不解决「可追溯」和「变更感知」，而且你没法自己修。
这个项目把数据放在 Git 仓库里：**PR 的 diff 就是审核界面，fork 就能改成你自己要的样子**。

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
npm run add-venue -- https://example.org/2027/dates --id example --short EXAMPLE --full "Example Conference"  # 预览新 venue
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

1. **原文回验**：每条截止日期必须带官网原文 `quote`，且该 `quote` 能在本次快照里**逐字命中**。抽错、编造的一律进不了数据文件。
2. **时区自校**：`due + timezone` 换算出的 UTC 必须与页面上内嵌的 UTC 时间戳一致（容差 60 秒），AoE / UTC / IANA 时区都在校验范围内。
3. **结构变化不覆盖**：页面改版导致抽取为空时，保留旧数据并报警，不会把已有信息清空。

抽取分三级：L1 确定性适配器（CVF 系列，靠页面内嵌的倒计时时间戳）→ L2 家族模板 → L3 LLM 兜底（必须原样引用，找不到就返回 null）。模型只负责「解析」，不负责「发明」。

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
field_ids: [computer-vision]
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

目标：**加一个会议 ≤ 10 分钟，不需要读代码。** 详细参数、交互模式与手工兜底见 [docs/ADD_A_VENUE.md](docs/ADD_A_VENUE.md)。目前自动抽取只支持 `adapter: thecvf`（`*.thecvf.com` 系列）；其他站点需要新适配器，或按数据契约手工补带证据的日期。

---

## 目录结构

```text
core/         schema(zod)、时间与 AoE 换算、YAML 加载
acquire/      抓取、快照、适配器、更新入口
cmd/          validate / update / query / add-venue 命令
mcp/          零依赖 MCP stdio server 与工具实现
data/         fields/ 领域包、venues/ 数据、snapshots/ 快照
sources/      registry.yaml 源登记表
tests/        校验器与适配器测试（vitest）
src/          React 货架式 Web 界面
docs/PLAN.md  产品与技术规划 v2
docs/ADD_A_VENUE.md  新 venue 接入手册
```

---

## 命令

| 命令 | 作用 |
|---|---|
| `npm run validate` | 校验全部数据（schema / 时区 / 原文回验） |
| `npm run update:dry` | 抓官网并打印将要发生的变更 |
| `npm run update` | 抓官网并写回 YAML 与快照 |
| `npm run add-venue -- <url> ...` | 预览新 venue 骨架 + 源登记（`--write` 落盘） |
| `npm run query -- --open --json` | 查询仍可投稿的 venue，保留全部届次与证据 |
| `npm run query -- --venue cvpr --json` | 查询单个 venue 的全部日期 |
| `npm run mcp` | 启动 MCP stdio server（`search_venues` / `get_venue` / `get_deadlines`） |
| `npm run test:all` | 全部单元测试与旧版 CLI 集成测试 |

---

## 路线图

- [x] **M0** 数据契约 v2 + 校验器（含原文回验）
- [x] **M1** 一条真实链路：CVPR / ICCV / WACV 的采集、快照、抽取、写回
- [x] **M2** GitHub Actions 定时 + PR 机器人
- [ ] **M3** 铺开到 8–12 个会议 + 4–6 个期刊（当前 4 个会议 + 1 个 rolling 期刊）
- [x] **M4** Web 界面首版：首页回答「接下来该投什么」
- [ ] **M5** AI 层：自然语言筛选、变更摘要、论文→会议匹配（自带 key，默认关闭）
- [ ] **M6** 发布 v0.1.0：CLI 打包、文档、贡献指南

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
