# 贡献指南

感谢贡献 venue、领域包或采集适配器。这个仓库首先是**可回验的数据集**，其次才是 Web 应用；review 的核心不是数量，而是证据和可重复采集。

## 最小环境

- Node.js 22+
- 不提交 API key、cookie、个人路径、邮箱或本地锁文件
- 写命令默认先预览；只有你明确确认后才使用 `--write`

提交前至少运行：

```bash
npm run validate
npm run test:all
npm run build
```

准备公开仓库或修改快照/隐私规则时再运行 `npm run audit:privacy`。

## 贡献一个已有候选 venue

1. 用 `npm run discover -- --field <pack-id> --all` 找候选。
2. 打开候选 `official_url` 与 `source_url`，确认是当届官方页面。没有 `source_url` 的固定会议不能直接接入。
3. 运行候选给出的 `add-venue` 命令，先去掉 `--write` 预览，再显式写入。
4. `npm run update:dry -- --venue <id>` 检查节点、时区和移除项。
5. 确认后 `npm run update -- --venue <id>`；真实 diff 会追加到 `data/changelog.yaml`。
6. 检查 YAML、快照和 changelog，再运行完整验收。

未公布日期时，`no_published_dates` 是合法结果。不要用上一届日期、第三方 tracker 或会期倒计时补齐。

## 贡献一个新领域包

仓库内的 `robotics-learning` 是一个 **planned 示例包**，用于走通贡献流程，而不会出现在正式 Web 货架。

1. 复制 `data/fields/robotics-learning.yaml`，修改 id/slug、名称和描述；新包先设 `status: planned`、`tier: community`、`is_default: false`。
2. 复制 `data/discovery/robotics-learning.yaml`，逐项确认官方入口。`source_url` 只能在确认当届论文日期页与适配策略后填写。
3. 运行：

   ```bash
   npm run discover -- --field <pack-id> --all
   npm run discover -- --field <pack-id> --verify --json
   npm run validate
   ```

4. 复用已有 venue 时，只在其 `field_ids` 添加 pack id，不复制 YAML、日期或证据。
5. 新 venue 按上节流程接入。包内至少有一个 venue 后，才把 `status` 改为 `active`。
6. 若希望设默认包，确保其他包都不是默认；本地私有包用 `tier: local`，不必提交上游。

完整字段说明见 [docs/PACKS.md](docs/PACKS.md)，agent 操作顺序见 [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md) 和 [skills/venue-onboarding/SKILL.md](skills/venue-onboarding/SKILL.md)。

## 贡献一个采集适配器

- 先保存真实 HTML 的最小化测试 fixture，覆盖正常、未公布、缺时区、页面损坏和卫星活动过滤。
- 优先机器可读时间；文本日期只有在页面或行内明确时区时才可解析。
- `raw_text` / `evidence.quote` 必须来自 `htmlToText` 后的快照，而不是只存在于 HTML 属性里的字符串。时间戳属性需要由采集器显式保留进快照。
- 本地钟面与 UTC 必须互校；不一致时跳过并报警，不猜。
- 如果抽取缺项会导致删除旧 deadline，`update --write` 必须拒绝。
- 在 `core/schema.ts`、`core/add-venue.ts`、`core/discover.ts`、`cmd/add-venue-args.ts`、`cmd/update.ts` 同步显式 adapter 契约，并补文档。

参考实现：`thecvf`、`table-dates`、`section-dates`、`siggraph-widget`。

## PR 自查

- [ ] 官方 URL 与当届信源已由人工打开确认
- [ ] 没有发明日期、时区、资质或 rolling 期刊 deadline
- [ ] edition 与 deadline 的证据均能回验到对应快照
- [ ] dry-run 已检查，新增/修改/移除符合官网
- [ ] changelog 只包含真实写入的 diff，没有 dry-run 伪事件；venue/changelog 写入失败会回滚并可重试
- [ ] 测试夹具不依赖生产数据条数，新测试在数据增长后仍稳定
- [ ] `validate`、`test:all`、`build` 全绿
