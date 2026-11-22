# 外部 Agent 自定义领域：端到端实测

日期：2026-11-22。目标：模拟一名刚 fork 仓库的 GitHub 用户，只按公开文档和 CLI 操作，用自带 agent 创建自己的领域包；不由维护者替它写日期。

> 这是本地、可回滚的外部用户流程模拟，不是对 GitHub 账号权限或真实 PR 审核的测试。

## 场景

使用仓库自带的 planned 包 `robotics-learning`，让 agent 从候选清单选择 RSS，登记 venue 骨架，再激活包。信源只使用公开官方入口，未生成任何截止日期。

## 按文档执行

```bash
# 1. 看候选并检查入口
node cmd/discover.ts --field robotics-learning --all --verify --json

# 2. 默认预览，不写文件
node cmd/add-venue.ts https://roboticsconference.org/program/ \
  --field robotics-learning --id rss --short RSS \
  --full "Robotics: Science and Systems" \
  --official-url https://roboticsconference.org/ --adapter manual --json

# 3. 用户/agent 明确执行写入
node cmd/add-venue.ts --write https://roboticsconference.org/program/ \
  --field robotics-learning --id rss --short RSS \
  --full "Robotics: Science and Systems" \
  --official-url https://roboticsconference.org/ --adapter manual

# 4. 首个 venue 已接入，把 data/fields/robotics-learning.yaml 改为 active
npm run validate
npm run build
node cmd/discover.ts --field robotics-learning --all --json
```

## 实测发现与修复

首次执行暴露了一个文档/实现不一致：文档要求新包先设 `planned`，但 `add-venue` 只接受 `active` 包，导致用户无法接入首批 venue。

修复为 `cmd/add-venue-field.ts` 的 `chooseOnboardingField`：

- `active` 与 `planned` 都允许接入；
- `archived` 仍拒绝；
- 未指定 `--field` 时仍只自动选择唯一的 active 包，不会误选 planned 包；
- `tests/add-venue-field.test.ts` 固定上述行为。

## 修复后的结果

- `--write` 只生成 `data/venues/rss.yaml` 骨架并追加 registry；`editions: []`，没有编造日期。
- `npm run validate`：**3 个领域、21 个 venue、57 条 deadline、16 条变更，0 错误、0 警告**。
- `npm run build`：成功生成 3 个活跃包；默认包仍是 `3dgs-avatar`。
- `discover --field robotics-learning --all` 正确把 RSS 标为 `registered: true`，不再生成重复接入命令。
- 新包没有日期时仍生成合法但为空的订阅日历，不会伪造事件。

测试完成后删除临时 RSS venue，恢复 registry、包状态和生成文件；实测数据没有混入正式提交。

## 结论与边界

**自定义领域包 + venue 骨架可以由用户自己的 agent 跑通。** 自动日期采集仍取决于页面结构：

- 已有适配器匹配时，继续 `update:dry` → `update --write`；
- 不匹配时，agent 可以起草适配器，但必须带 fixture、测试并经过 code review；
- 不能为了“自助”而允许模型直接写日期、绕过 quote 回验或执行 YAML 中的任意代码。

后续若要让完全不懂代码的用户也能接入，优先做可审计的适配器生成工作台，而不是放宽入库规则。
