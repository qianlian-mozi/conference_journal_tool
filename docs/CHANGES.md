# 变更摘要（M5-B）

变更摘要把 `data/changelog.yaml` 里已经记录的真实 diff 翻译成一句可核对的中文，**不调用模型，也不读取官网之外的故事**。

```bash
npm run changes
npm run changes -- --days 30
npm run changes -- --pack 3dgs-avatar --venue siggraph
npm run changes -- --venue eurographics --json
```

## 它为什么不会编

每条摘要只消费一条 changelog 记录：

- `added`：新增节点及其官网本地时间、时区
- `removed`：被移除节点和保留的旧时间
- `changed`：日期/时区变化、状态变化，或仅原文更新
- 日期、时区、状态都逐字来自 `before` / `after`，不重新推算 `due_utc`，也不猜测延期原因
- 仅 `raw_text` 变化时会明说“日期与状态未变”，不会包装成延期
- 记录保留 `due_source`；`text` 来源会标注“（据官网文本）”，不把解析时间伪装成页面时间戳
- 文本输出逐条带 changelog id 与 `evidence.url`；JSON 保留完整 evidence

## 窗口

默认近 7 个 UTC 日历日（含今天）。`--days` 接受 1–3650 的整数。历史只从 changelog 首次真实写回开始，没有 retroactive 编年史：

- dry-run 不写 changelog
- 抓取失败或 quote 闸门拒绝时不写
- 因新增/移除节点而写的事件与日期本身一样需要快照回验

## JSON

```json
{
  "window_days": 30,
  "pack": "3dgs-avatar",
  "venue": "siggraph",
  "count": 3,
  "entries": [
    {
      "id": "change-f6e74d85a6b3281f",
      "venue_id": "siggraph",
      "edition_id": "siggraph-2027",
      "change": "added",
      "detected_at": "2026-11-22",
      "text": "SIGGRAPH 新增「Paper Deadline」：2027-01-28 22:00 UTC",
      "evidence": { "url": "https://s2027.siggraph.org/program/technical-papers/" }
    }
  ]
}
```

Web 首页的「近 7 天变更」复用同一个 `core/summary.ts`，不再维护第二套文案。

## 边界

- **这是变更记录，不是投稿建议**。原因、影响和“值不值得投”不在数据里。
- 论文 → 会议匹配仍是 PLAN 里的可选项，未实现；接入任何模型时也只能产出筛选计划或接入补丁，确定性校验器保留最终裁决权。
- 摘要的中文文案由模板决定；新增变化类型必须先扩展 schema/changelog 测试，再由模板呈现。
