# 领域包（Field Pack）

领域包是项目的**复用单元**：一组有共同研究兴趣的 venues，加上可选的候选清单和接入说明。

它不是动态插件系统。日期、证据和抓取规则仍由同一套确定性契约校验；换一个领域，不会换一套可信度标准。

## 一个 pack 由什么组成

| 文件 | 必需 | 作用 |
|---|---|---|
| `data/fields/<pack-id>.yaml` | 是 | 名称、状态、信任层级、默认展示配置 |
| `data/venues/<venue-id>.yaml` 的 `field_ids` | 是 | 声明 venue 属于哪些 pack；同一 venue 可复用 |
| `data/discovery/<pack-id>.yaml` | 否 | 该方向待接入的候选，供 `discover --field` 使用 |
| `sources/registry.yaml` | 新 venue 必需 | 全局唯一的抓取入口；不随 pack 复制 |
| `data/snapshots/<venue>/<sha256>.txt` | 有日期时必需 | 官网证据快照；全仓库共享 |

pack 只保存 `venue_ids` 视图，**不复制日期和 evidence**。CVPR 可以同时属于 `computer-vision` 和 `3dgs-avatar`，但真相仍只有一份。

## 包定义

```yaml
schema_version: 2
id: robotics
slug: robotics             # 必须与 id 一致，并用于分享链接
names:
  zh: 机器人
  en: Robotics
status: active             # active 进入 Web；planned 仅表示筹备中
tier: community            # core / community / local
is_default: false          # 所有活跃包中最多一个 true
tagline_zh: 面向机器人研究的可溯源投稿雷达。
description_zh: 说明这个包服务谁，以及收录边界。
qualification_systems: [ccf, core]
```

### 字段语义

- `tier: core`：仓库维护者持续维护的高质量样例。
- `tier: community`：通过 PR 审核的社区扩展；仍须通过全部校验。
- `tier: local`：用户自己的本地扩展，不代表上游背书。
- `status: active` 必须至少包含一个 venue；没有内容时用 `planned`。
- `is_default` 决定 `npm run dev` 的首屏；未指定时按 id 选择第一个活跃包。
- `qualification_systems` 只是声明该领域使用的评级体系，不等于 venue 已有评级。

## 创建只复用已有 venues 的包

以 3DGS / Avatar 为例：

1. 新建 `data/fields/3dgs-avatar.yaml`。
2. 在相关 venue 中追加 `field_ids`：

   ```yaml
   field_ids:
     - computer-vision
     - 3dgs-avatar
   ```

3. 可选：新建 `data/discovery/3dgs-avatar.yaml`，列出待接入的 SIGGRAPH、TVCG 等候选。
4. 运行：

   ```bash
   npm run validate
   npm run build
   npm run dev
   ```

5. 打开 `http://localhost:5173/?pack=3dgs-avatar`，或在首页「领域包」下拉框切换。

## 创建包含新 venues 的包

仓库自带一个 **planned 示例包** `robotics-learning`（`data/fields/robotics-learning.yaml` + `data/discovery/robotics-learning.yaml`），它只用于走通贡献流程，不会出现在正式 Web 货架。复制它开始：

```bash
npm run discover -- --field robotics-learning --all
npm run discover -- --field robotics-learning --verify --json
npm run add-venue -- <官方 Dates URL> --field robotics-learning --id <id> --short <简称> --full "<全称>"
npm run add-venue -- --write <官方 Dates URL> --field robotics-learning --id <id> --short <简称> --full "<全称>"
npm run update:dry -- --venue <id>
npm run update -- --venue <id>
npm run validate
```

新包先设 `status: planned`；至少接入一个 venue 后再改为 `active`。完整贡献步骤与 PR 清单见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

`add-venue` 只生成骨架，不生成日期。`update` 只能从已登记官网抽取；quote 不在快照里就拒绝写入。

## 适配器如何扩展

当前适配器是仓库内经过测试和 code review 的 TypeScript 模块，不允许 YAML 直接执行任意代码。

页面不符合现有结构时：

1. 保存一个最小化、公开的 HTML fixture。
2. 新建 adapter，返回标准 `AdapterResult`。
3. 复用统一的 deadline 分类、快照和 quote 闸门。
4. 加入 schema、update 分派和参数解析。
5. 用真实官网做 dry-run，再提交数据。

不要为了让页面“能跑”而关闭证据校验，也不要把用户提供的模型输出当作免审代码。

## 验收清单

- [ ] pack id、slug、文件名一致。
- [ ] active 包至少有一个 venue；默认包唯一且为 active。
- [ ] 所有 `field_ids` 指向已声明的 pack。
- [ ] 新 venue 有全局唯一 id 和 registry 条目。
- [ ] 所有日期通过 schema、时区和快照 quote 回验。
- [ ] rolling 期刊没有固定 deadline。
- [ ] 候选页只使用人工或 agent 确认过的官方 URL。
- [ ] `npm run validate`、`npm run test:all`、`npm run build` 全绿。
- [ ] 公开前运行 `npm run audit:privacy`。

用户自带 agent 的具体操作流程见 [AGENT_ONBOARDING.md](AGENT_ONBOARDING.md)。
