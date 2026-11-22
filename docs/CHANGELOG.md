# 截止日期变更日志

`data/changelog.yaml` 是“谁新增、延期或撤回了日期”的事实来源；Web 首页的“近 7 天变更”只读取这里，不从当前时钟或模型生成事件。

## 何时记录

- `node cmd/update.ts --write`（或 `npm run update`）只有在 venue 数据真正写入时才记录 diff。
- `--dry-run`、只刷新抓取时间、抓取失败、页面未公布日期都不会生成事件。
- `added`：新 deadline；`changed`：due、UTC、时区、原文、类型或状态改变；`removed`：官网确认节点消失。
- 同一天重复写入同一变化是幂等的；以后再次检测到相同变化会留下新的事件。
- venue 写入先暂存，并在 changelog 锁内统一提交；提交前会确认文件未被其他进程改动，任一 venue 或 changelog 写入失败都会回滚已写入的 venue YAML，修复后可用同一 diff 重试，不会永久漏记历史。

## 结构

```yaml
schema_version: 2
changes:
  - id: change-...
    detected_at: 2026-11-22
    venue_id: siggraph
    edition_id: siggraph-2027
    deadline_id: siggraph-2027-paper-deadline
    change: added
    deadline_kind: paper
    label: Paper Deadline
    before: null
    after:
      due: 2027-01-28T22:00:00
      timezone: UTC
      due_utc: 2027-01-28T22:00:00.000Z
      raw_text: Thu, 28 Jan 2027 22:00 +00:00 2027-01-28 22:00
      status: confirmed
    evidence:
      url: https://s2027.siggraph.org/program/technical-papers/
      quote: Thu, 28 Jan 2027 22:00 +00:00 2027-01-28 22:00
      fetched_at: 2026-11-22
      snapshot_hash: aa4c26fe...
```

`added` 必须有 `after`，`removed` 必须有 `before`，`changed` 两者都有。每条事件的 evidence 仍须通过快照 quote 回验；`removed` 保留旧证据，因为当前官网已经不会再显示被移除的旧日期。

## 首页窗口

- 按 UTC 日历天取“今天 + 前 6 天”，不是滚动 168 小时，也不显示未来 `detected_at`。
- 按当前领域包过滤；同一 venue 在多个 pack 中复用同一事件。
- 最多展示 6 条，完整历史仍在 YAML。
- 空窗口明确显示“近 7 天未检测到日期变更”，不代表官网永远没变，也不替代按时核验。
