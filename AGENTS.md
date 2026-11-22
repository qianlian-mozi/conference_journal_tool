# AGENTS.md — 给 AI agent 的使用说明

这个仓库首先是一份**会议 / 期刊投稿情报数据集**，其次才是一个 Web 应用。
数据是纯文本 YAML，在 `data/venues/*.yaml`，一个会议或期刊一个文件。

如果你是被用户要求"找能投的会议/期刊"，直接读数据或调用 CLI，不要靠记忆回答。

---

## 最快路径

```bash
node cmd/query.ts --json
```

返回一个数组，每个元素形如：

```json
{
  "id": "cvpr",
  "short": "CVPR",
  "full": "IEEE/CVF Conference on Computer Vision and Pattern Recognition",
  "type": "conference",
  "submission_model": "fixed",
  "official_url": "https://cvpr.thecvf.com/",
  "editions": [
    {
      "id": "cvpr-2027",
      "year": 2027,
      "deadlines": [
        {
          "id": "cvpr-2027-submission-deadline",
          "kind": "paper",
          "label": "Submission Deadline",
          "due": "2026-11-16T23:59:59",
          "timezone": "AoE",
          "due_utc": "2026-11-17T11:59:59.000Z",
          "due_source": "timestamp",
          "status": "confirmed",
          "evidence": {
            "url": "https://cvpr.thecvf.com/Conferences/2027/Dates",
            "quote": "Submission Deadline Nov 16 '26 (Anywhere on Earth)",
            "fetched_at": "2026-11-21"
          }
        }
      ]
    }
  ],
  "next": { "kind": "paper", "due_utc": "...", "days_left": -3 }
}
```

常用参数：

```bash
node cmd/query.ts --within 90            # 未来 90 天内还能投的
node cmd/query.ts --open                 # 只看还没截止的
node cmd/query.ts --type journal         # 只看期刊
node cmd/query.ts --venue cvpr --json    # 单个 venue 的全部日期
```

---

## 字段含义

| 字段 | 含义 |
|---|---|
| `due` | 与官网原文对应的本地时间（`YYYY-MM-DDTHH:mm:ss`） |
| `timezone` | `AoE`（UTC-12）/ `UTC` / IANA 时区名 |
| `due_utc` | 换算后的 UTC 瞬时，用于排序与算剩余天数 |
| `due_source` | `timestamp` = 页面内嵌倒计时时间戳（最可信）；`text` = 从页面文本解析 |
| `status` | `confirmed` / `tentative` / `extended` / `cancelled` |
| `evidence.url` | 来源页面 |
| `evidence.quote` | 官网原文片段（可在 `data/snapshots/` 里回验） |
| `evidence.fetched_at` | 最后核验日期 |

---

## 硬规则（请务必遵守）

1. **不要发明日期。** 只能引用数据里已有的 `due` / `due_utc`；没有就回答"未公布"。
2. 条目没有 `due_utc` 时，必须说"待确认"，不能用 `due` 或时区自行推算一个精确时刻。
3. `due_source: text` 的条目，转述时保留不确定性（例如"据官网文本，截止时间为…"）。
4. 期刊 `submission_model: rolling` **没有截止日期**，不要给它们排 deadline，也不要说"还有 N 天"。
5. 回答里带上 `evidence.url` 和 `fetched_at`，让用户能自己核对。
6. 不要为了让答案好看而补全缺失的 venue；数据里没有的，就说没有。

---

## 常见任务映射

| 用户问法 | 做法 |
|---|---|
| "未来三个月还能投的 CV 会议" | `node cmd/query.ts --within 90 --json` |
| "有没有可以随时投的期刊" | `node cmd/query.ts --type journal --json`，筛 `submission_model === "rolling"` |
| "CVPR 2027 什么时候截止" | `node cmd/query.ts --venue cvpr --json` |
| "哪些是 CCF-A" | 读 `qualifications`（目前多数为空，缺数据就说缺） |
| "帮我核对这条日期" | 打开 `evidence.url`，或读 `data/snapshots/<venue>/<sha256>.txt` |
| "接入一个新会议/期刊" | 按 `skills/venue-onboarding/SKILL.md`、`docs/AGENT_ONBOARDING.md` 与 `CONTRIBUTING.md`；先预览和 dry-run，显式确认后才 `--write` |
| "创建自己的领域包" | 按 `docs/PACKS.md` 新建 `data/fields/<pack>.yaml`，用 venue 的 `field_ids` 复用数据；可复制 planned 的 `robotics-learning` |
| "谁延期了 / 最近改了什么" | 读 `data/changelog.yaml` 或调用 `node cmd/query.ts`；只陈述真实 diff，不用模型推断变更 |

---

## MCP（如果你的 agent 支持）

仓库自带一个零依赖的 MCP server（stdio）：

```json
{
  "mcpServers": {
    "cv-venue-radar": {
      "command": "node",
      "args": ["<仓库绝对路径>/mcp/server.ts"]
    }
  }
}
```

它暴露三个工具：

| 工具 | 用途 |
|---|---|
| `search_venues` | 按 field / type / within_days / open_only 筛选 |
| `get_venue` | 取单个 venue 的全部届次与日期 |
| `get_deadlines` | 平铺的截止日期列表，可按 venue_id / within_days 过滤 |

三个工具的返回值都原样带上 `evidence`，不做二次加工。

---

## 不要做的事

- 不要修改 `data/` 里的日期来"修正"你认为不对的值。数据只能通过 `npm run update` 从官网重新采集，并经 `npm run validate` 校验。
- 不要把 `due_source: text` 改成 `timestamp`——那会让下游误以为它是页面时间戳。
- 不要跳过 `evidence` 直接引用 CLI 输出里的 `next.due`；证据是这份数据存在的理由。
