# 用自己的 agent / LLM 接入信源

项目不绑定模型供应商，也不要求把 API key 放进仓库。你可以使用 Claude Code、Codex、DSH、Cursor 或任何能执行命令、读取网页的 agent。

职责边界只有一句话：

> **模型负责寻找、解释和起草；确定性工具负责抓取、换算、校验和写入。**

模型升级时，换掉 agent 即可；数据契约和证据门槛不变。

## 可用工具

| 工具 | 权限 | 用途 |
|---|---|---|
| `discover` | 只读 | 在指定 pack 的候选清单中匹配、去重、给出接入命令 |
| `add-venue` | 默认只读 | 预览 venue 骨架和 registry 条目 |
| `add-venue --write` | 显式写入 | 原子创建 venue 并登记信源，不生成日期 |
| `update:dry` | 网络 + 只读数据 | 抓取、抽取、生成 diff，不写 YAML |
| `update --write` | 显式写入 | 通过证据闸门后写 YAML、内容寻址快照与 `data/changelog.yaml` |
| `validate` | 只读 | schema、时区、edition/deadline 双层 quote 回验，以及 changelog 证据 |
| MCP server | 只读 | 查询已经收录的 venues；当前不提供写入工具 |

接入新信源使用 CLI；查询已有数据可使用 MCP。不要把 MCP 的只读查询能力描述成自动写入能力。

## 标准工作流

以下命令都在仓库根目录执行。

### 1. 明确目标和 pack

至少确认：

- 官方会议/期刊名称
- 官方 URL
- 目标 pack，例如 `3dgs-avatar`
- 用户是否允许写文件

先看现有候选：

```bash
node cmd/discover.ts --field 3dgs-avatar --all
node cmd/discover.ts --field 3dgs-avatar <关键词>
```

没有候选文件不代表不能接入；只说明需要用户或 agent 额外确认官网。新领域可以先复制 planned 的 `data/fields/robotics-learning.yaml` 与同名 discovery 文件走通流程。`add-venue` 接受 active 和 planned 包，因此可以先接首批 venue，再把包改为 active；archived 包仍拒绝。

### 2. 确认官方信源

只接受官方 Dates / CFP / Journal 页面。搜索引擎结果、WikiCFP、社交媒体只能作为线索，不能作为日期证据。

记录：

- venue 官方入口
- 当届 Dates / CFP 页面
- 页面是否明确给出时区
- 页面结构属于 CVF、表格、主会文本区块、日期列表时间线，还是需要新 adapter

无法确认时停止并报告，不要填一个“看起来合理”的 URL。

### 3. 预览骨架

```bash
node cmd/add-venue.ts <官方 Dates URL> \
  --field 3dgs-avatar \
  --id <venue-id> \
  --short <简称> \
  --full "<全称>"
```

检查 id、类型、submission model、official_url、adapter 和 registry diff。默认预览不会抓页面，也不会写文件。

### 4. 获得确认后写入骨架

```bash
node cmd/add-venue.ts --write <同一 URL> <同一组参数>
```

写入使用 registry 锁和原子替换。不要并发手工编辑同一 registry。

### 5. 先做 dry-run

```bash
node cmd/update.ts --venue <venue-id> --dry-run
```

逐项检查：

- 是否误收 workshop、tutorial、注册入口等非主会节点
- 没有时区的日期是否被跳过
- `due_source: text` 是否确有文本依据
- diff 是否会意外删除旧日期
- 警告是否需要新 adapter，而不是放宽规则

抽取失败时不应通过手工编日期来“修好”。

### 6. 写入并验收

```bash
node cmd/update.ts --venue <venue-id> --write
npm run validate
npm run test:all
npm run build
```

提交前展示 `git diff`，列出新增/修改/删除的日期和对应证据。`--write` 还会把真实 diff 追加到 `data/changelog.yaml`；dry-run 不产生事件。公开仓库前再运行 `npm run audit:privacy`。贡献流程以 [CONTRIBUTING.md](../CONTRIBUTING.md) 为准。

## 模型可以输出什么

可以输出：

- 候选官网及其确认理由
- `add-venue` 命令草案
- adapter 代码和测试 fixture
- 结构化的更新摘要
- 需要人工决策的问题

不能作为事实直接输出：

- 未在快照出现的日期
- 猜测的时区或 UTC 时间
- 没有来源的 CCF/CORE 评级
- rolling 期刊的固定 deadline

## 失败时怎么做

- **404 / 未公布**：保留空 editions，明确写“未公布”。
- **403 / 反爬**：报告访问受限；403 不等于 venue 无效，但也不能伪造抓取成功。
- **没有匹配 adapter**：提交 adapter 草案和 fixture，不改用错误模板硬抽。
- **quote 不命中**：检查快照与原文；不要删 quote 或跳过 validate。
- **时区未知**：跳过该日期并保留警告。
- **需要写权限但未获确认**：只给预览和下一步命令。

仓库内置了可复制的 [venue-onboarding skill](../skills/venue-onboarding/SKILL.md)。它只是一套操作约束，不包含模型 API，也不会绕过上述闸门。

外部用户视角的完整实测（含 planned 包阻塞点与修复）见 [EXTERNAL_ONBOARDING_TEST.md](EXTERNAL_ONBOARDING_TEST.md)。
