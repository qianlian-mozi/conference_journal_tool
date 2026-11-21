# 发现候选 venue

`discover` 回答的是：**我这个领域还有哪些会议/期刊没收录？下一步怎么接？**

它不会打开搜索引擎抓结果，也不会自动写 `data/`。

## 为什么不做网页搜索

试过 DuckDuckGo、Bing、Brave 的搜索结果页，问题不是「抓不到」，而是**不可复现**：

- 搜索引擎对自动抓取有反爬和 ToS 限制；
- 结果随地区、登录状态、时间变化；
- 同一个会议可能搜出官网、第三方 deadline 站、学院通知三个版本；
- 自动把搜到的 URL 写成信源，等于把未经人确认的页面变成数据依据。

所以这里采用**可 review 的候选清单**：人把「官网已确认」的会议/期刊写进 YAML，`discover` 负责匹配、查重、给出接入命令；官网核验是可选的一步。

## 候选清单

文件：`data/discovery/<field_id>.yaml`

```yaml
schema_version: 2
field_id: computer-vision
candidates:
  - id: example
    names:
      short: EXAMPLE
      full: Example Conference on Vision
    type: conference
    official_url: https://example.org/
    publisher: Example Society          # 可选
    source_url: https://example.org/2027/dates  # 可选：已确认的当届 Dates/CFP 页
    submission_model: fixed             # 可选
    adapter: thecvf                     # 可选：thecvf | table-dates | manual
    cadence: weekly                     # 可选：daily | weekly | monthly | manual
    aliases: [example conf]             # 可选：补充搜索词
    note: 当届 Dates 页待确认             # 可选：给人看的备注
```

规则：

- `id` 必须是小写 slug，且不能与 `data/venues/` 里已有 id 重复；
- `official_url` 必须是 https；
- `source_url` 只放**已经人工打开确认过**的当届页面，不要放搜索页；
- 候选只是「可能值得收录」，不等于已核验；`discover` 不会因为它在清单里就写数据。

## 用法

```bash
npm run discover -- bmvc
npm run discover -- 3dv --all          # 查看已收录候选与登记状态
npm run discover -- "pattern recognition" --type journal
npm run discover -- vision --type journal --limit 5
npm run discover -- --all --type conference
npm run discover -- cviu --verify
node cmd/discover.ts --json          # 纯 JSON；npm run 会在前面打印脚本横幅
```

| 参数 | 作用 |
|---|---|
| 关键词 | 对 id、简称、全称、aliases 做 token AND 匹配；多个词用空格分隔 |
| `--field <id>` | 领域候选清单，默认 `computer-vision` |
| `--type` | `conference` / `journal` |
| `--limit` | 最多返回条数，1–100，默认 20 |
| `--all` | 连已收录的也显示 |
| `--verify` | 访问候选官网，打印 HTTP 状态和页面标题（最多前 10 条） |
| `--json` | 结构化输出 |

默认只显示**未收录**候选。已收录的候选不会生成接入命令。

## 输出怎么读

- **未收录 + 有接入命令**：说明 `source_url` 已确认，可以直接复制命令预览。
- **未收录 + 没有命令**：会议还缺当届 Dates/CFP 页。先人工找页面，再用 `add-venue` 补 `source_url`。
- **验证失败（403 等）**：只代表这台机器/这个 UA 被挡了，不代表官网无效；以浏览器打开为准。
- **已收录**：去跑 `npm run update` 更新日期，不要再 add 一次。

## 接入流程

```bash
# 1. 预览候选给出的命令（不带 --write 时只打印，不落盘）
npm run add-venue -- "<source_url>" --id <id> --short <SHORT> --full "<Full Name>" --type conference

# 2. 确认骨架和 registry diff 后落盘
npm run add-venue -- "<source_url>" ... --write

# 3. 看抓取结果
npm run update:dry -- --venue <id>
npm run update -- --venue <id>

# 4. 校验
npm run validate
```

`add-venue` 只写骨架和信源，**不写任何日期**；日期必须由 `update` 从官网抓取并通过 `quote` 回验。

## 维护候选清单

- 新增候选：在对应 `candidates` 下追加一项，跑 `npm run validate`；
- 候选已收录：保留在清单里也可以，`discover` 会显示「已收录」；不想保留就删掉；
- 官网改版/换域名：更新 `official_url`，并重新确认 `source_url`；
- 不确定的页面不要写进 `source_url`，宁可不生成命令。

## 已知边界

- 候选清单目前由人维护，不是全量会议数据库；
- 自动抽取支持 `adapter: thecvf` 与 `adapter: table-dates`（原生 / ARIA 表格，倒计时时间戳或页面统一明示的 23:59 AoE 文本日期），其他站点需要新适配器或手工补证据；
- `--verify` 只检查官网入口，不证明 Dates 页存在或日期正确；
- 期刊是 rolling 模式，没有「当届截止日期」，不要给它们排 deadline。
