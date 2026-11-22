# CV Venue Radar — 产品与技术规划 v2.1

> 状态：v2 主链路已落地；v2.1 将扩展策略明确为「可信核心 + 领域包 + 用户自带 agent」。
> 本文取代上一版以「手工策展 3 个会议 + 倒排计划」为中心的设计。
> 一句话：**一个 clone 下来就能跑、能自己盯着官网更新、每条数据都能溯源、任何领域都能复用接入工作流的开源投稿情报工具。**

---

## 0. 一页摘要

| 项 | 结论 |
|---|---|
| 形态 | 开源仓库，`git clone` → `npm i` → `npm run dev`，本地运行，无账号、无中心服务 |
| 旗舰样例 | 3DGS / 3D Avatar；Computer Vision 作为可信核心数据集，二者通过 field pack 复用 venues |
| 扩展方式 | 用户新增 field pack / venue，或让自己已有的 agent 按 skill + CLI 工作流起草变更；不绑定模型供应商 |
| 核心能力 | 自动更新（抓官方页 → 抽取 → 校验 → 提 PR）、可溯源（每条日期带原文引用）、领域包复用、agent-first 接入、变更历史与 AI 问答（只读结构化数据） |
| 自动更新的实现位置 | GitHub Actions 定时任务 + PR 机器人；不需要服务器 |
| 数据存储 | 仓库内的 YAML 文件（一 venue 一文件），构建时聚合为 JSON |
| 不做什么 | 不做 SaaS、不做登录、不做"水会评分"、不自动替用户投稿 |
| 准确率目标 | **0 条无出处的截止日期**；延期公告 24h 内进入候选区 |

三个阶段：

1. **M1–M2 打通"会自己更新"** —— 没有这条，工具就只是个静态表格。
2. **M3 做可信核心与垂直样板** —— 不追求内置全世界；CV 达到合理覆盖，3DGS / Avatar 做深，滚动投稿单独建模。
3. **M4–M5 做可复用界面和 agent 工作流** —— 默认视图是"接下来该投什么"；用户的模型只起草接入与筛选计划，确定性闸门保留最终裁决权。

---

## 1. 问题与判断

### 1.1 真实场景

一个 CV 方向的研究生/ researcher 的真实问题不是"查不到会议"，而是：

- 我手上这篇稿子，**未来 3 个月还有哪些会能投**？哪个截止最近？
- 上周看还是 11 月 16 日，**现在延期了吗**？
- 这个会是 CCF-A 吗？**审稿是双盲还是单盲**？有没有官方给的录用率/审稿周期？
- 这些信息**从哪来的、什么时候核对的**？我能不能信？

现有工具（WikiCFP、ccfddl、各校 deadline 站）解决"列出来"，但普遍不解决"可追溯"和"变更感知"，而且大多是**别人维护的、你无法自己修**。

### 1.2 上一版为什么不够

上一版做出来的东西是：3 个会议 + 一份静态 JSON + 一个倒排计划表单。问题不在代码质量，在**产品赌注放错了**：

- 把"手工录入的数据"当成了产品，于是数据永远只有 3 条，且会过期。
- 把"倒排计划"当成了核心，但那是任何日历 App 都有的功能。
- 没有采集器，所以"更新"这件事在架构上根本不存在。

保留的部分：证据/核验字段的设计直觉、校验器、ICS 导出、纯函数 + 测试的工程习惯。
丢掉的部分：里程碑表单作为核心、手工维护数据、把所有领域塞进一个 `schedule.json`。

### 1.3 核心赌注

> **把"数据可信"从一句口号，变成机器可以验证的约束。**

具体是三条可执行的规则：

1. 任何一条截止日期，必须携带**官网原文片段（quote）**；quote 必须能在**当次抓取的快照**里逐字命中，否则这条数据不允许入库。
2. 任何一次自动更新，必须产出**可 review 的 diff**（旧值 / 新值 / 出处 / 抓取时间），而不是静默覆盖。
3. 任何模型输出（抽取或问答）**只能引用已有记录**，不能生成新事实；无法引用时输出"未收录/未核验"。

做到了这三条，"自动更新"才敢开到无人值守。

---

## 2. 产品定义

### 2.1 是什么

- **一个本地优先的开源工具**：clone 即可跑；默认不需要 API key，agent/LLM 由用户自己提供。
- **一组可信核心数据 + 可复用领域包**：CI 每周盯已登记官网；用户可新增 pack，不必等待上游收录长尾 venue。
- **一个 agent 可操作的接入工作流**：模型提出候选、adapter 和 patch，CLI 负责 dry-run、证据校验与显式写入。
- **一个能问的界面**：默认回答"我现在能投什么"。

### 2.2 五个核心能力

| # | 能力 | 用户可感知的形态 |
|---|---|---|
| 1 | **自动更新** | `git pull` 后看到"本周 3 个会议更新了截止日期"，其中 1 个延期 |
| 2 | **可溯源** | 每个日期旁边有「官网原文 + 抓取时间 + 快照」三点可点开 |
| 3 | **变更历史** | 会议详情页时间线：11-16 → 11-23（延期 7 天，来源：官方 Dates 页） |
| 4 | **投稿视图** | 首页按"距离截止天数"排序，标红临期、标灰已截止、标黄待确认 |
| 5 | **AI 问答（grounded）** | "未来三个月还能投的 CCF-A 会议" → 结构化筛选 + 结果 + 引用；答不出就说答不出 |

### 2.3 非目标（明确不做）

- 不做需要注册登录的托管服务。
- 不做"这个会水不水"的评分（无法客观化，且会误导）。
- 不做自动投稿、自动催稿、代写。
- 不由维护者内置全学科、全 venue；可信核心只承担质量样板，长尾由用户、社区和 agent 通过领域包扩展。
- 不保证"所有会议都能自动抓"——长尾会议靠社区提交 + 用户自带 agent 起草适配器，且必须通过确定性校验与人工确认。

---

## 3. 设计原则

1. **无证据不显示。** 宁可显示"2028 信息未公布"，也不显示一个猜的日期。
2. **人不做录入员。** 人只做三件事：确认冲突、批准结构化变更、提交新 venue 的源地址。录入是机器的活。
3. **文件即数据库。** 数据是 Git 里的 YAML，diff 可读、PR 可审、fork 可改。引入数据库就失去了开源协作的最大优势。
4. **确定性优先，模型兜底。** 能写死解析器的（CVF 家族等）就写死；模型只处理"页面结构没见过"的那 20%。
5. **失败要显性。** 抓取失败、结构变化、多源冲突，都要在页面上可见（"此数据 9 天未成功核验"），不能静默沿用旧值。
6. **默认离线可读。** 没有 API key 时，除 AI 问答外全部功能可用。

---

## 4. 系统架构

### 4.1 三层 + 一条流水线

```
┌────────────────────────── 展示层 (packages/web) ──────────────────────────┐
│  静态 React 应用，构建时把 data/*.yaml 聚合成 JSON 打进 bundle             │
│  首页 = 投稿视图  │  会议/期刊列表  │  详情（证据/历史）  │  AI 问答（可选）│
└───────────────────────────────────▲──────────────────────────────────────┘
                                    │ 读取（构建期）
┌────────────────────────── 数据层 (data/) ────────────────────────────────┐
│  fields/computer-vision.yaml      领域包                                  │
│  venues/cvpr.yaml  iccv.yaml  ... 一 venue 一文件（含 editions/deadlines） │
│  sources/registry.yaml            每个 venue 的官方页 + 抓取频率 + 适配器   │
│  snapshots/<venue>/<date>.txt     当次抓取的规范化文本（用于 quote 回验）   │
└───────────────────────────────────▲──────────────────────────────────────┘
                                    │ 写入（仅通过 PR）
┌────────────────────── 采集层 (packages/acquire) ─────────────────────────┐
│  scheduler → fetcher → snapshot → extractor(3 级) → reconciler → differ   │
│           → gate(quote 回验 + schema + 冲突) → PR writer                 │
│  运行位置：GitHub Actions（定时）或本地 `npm run update`（自带 key）       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 领域包与 agent 的边界

- `data/fields/<pack-id>.yaml` 声明包的名称、状态、信任层级与默认展示。
- venue 通过 `field_ids` 同时属于多个包；pack 不复制日期、证据或 registry。
- `data/discovery/<pack-id>.yaml` 是可选的人工/agent 候选索引，不是搜索引擎结果缓存。
- `core / community / local` 表示维护关系，不降低任何一层的证据要求。
- agent 使用 `discover → add-venue → update:dry → update --write → validate`；模型只能提出方案和 patch。
- 暂不提供动态第三方插件运行时；adapter 是需要 fixture、测试和 review 的 TypeScript 模块。

### 4.3 为什么是"文件即数据库"

- **PR 就是审核界面**：一次数据变更 = 一个 diff，reviewer 看到的是"日期从 A 改成 B，出处是这句话"，比任何后台管理界面都好审。
- **fork 即分叉**：别人想加机器人领域，fork 后加自己的 `fields/robotics.yaml`，不冲突。
- **无需运维**：没有数据库迁移、没有备份、没有连接串。
- **代价**：数据量上限约几千个 venue（远超 CV 领域需求）；不适合高频写入（我们一周几次）。

### 4.4 为什么自动更新放 GitHub Actions

- 用户 clone 的是"最新数据"，不是"一份 2026 年的快照"。
- 仓库维护者付一次 API 费用（约几美元/月），所有用户受益；不想依赖上游的人可以 fork 后配自己的 key。
- PR 机器人天然提供审计日志：谁改的、什么时候、依据什么。

---

## 5. 数据模型 v2

### 5.1 Venue（身份 + 资质 + 投稿模式）

```yaml
# data/venues/cvpr.yaml
schema_version: 2
id: cvpr
type: conference                # conference | journal
names:
  short: CVPR
  full: IEEE/CVF Conference on Computer Vision and Pattern Recognition
field_ids: [computer-vision]
official_url: https://cvpr.thecvf.com/
publisher: IEEE / CVF
submission_model: fixed         # fixed（有截止日期）| rolling（期刊常态）

scope:                          # 用于"论文→会议"匹配，必须来自官方 CFP 描述
  summary_zh: 计算机视觉全领域，偏方法与实证
  keywords: [object detection, segmentation, 3D vision, diffusion, ...]
  evidence:
    url: https://cvpr.thecvf.com/
    quote: "papers presenting new research in computer vision and pattern recognition"
    fetched_at: 2026-11-20

qualifications:                 # 资质：体系 + 等级 + 年份 + 来源，绝不写死成单一枚举
  - system: ccf
    level: A
    year: 2022
    evidence: { url: https://www.ccf.org.cn/..., quote: "...", fetched_at: 2026-11-20 }
  - system: core
    level: A*
    year: 2023
    evidence: { url: http://portal.core.edu.au/conf-ranks/..., quote: "...", fetched_at: 2026-11-20 }

review:                         # 审稿制度：只记官方明示的
  model: double_blind
  evidence: { url: ..., quote: "...", fetched_at: ... }

editions:
  - id: cvpr-2027
    year: 2027
    location: Seattle, USA
    dates: { start: 2027-06-20, end: 2027-06-25 }
    official_url: https://cvpr.thecvf.com/Conferences/2027
    deadlines:
      - id: cvpr-2027-paper
        kind: paper             # abstract|paper|supplement|rebuttal|camera_ready|notification|other
        raw_text: "Submission Deadline Nov 16 '26 (Anywhere on Earth); Date is fixed, no extension will be given"
        due: 2026-11-16T23:59:59
        timezone: AoE           # AoE | UTC | IANA 时区名；保存原值，不擅自换算
        status: confirmed       # confirmed|tentative|extended|cancelled
        evidence:
          url: https://cvpr.thecvf.com/Conferences/2027/Dates
          quote: "Submission Deadline Nov 16 '26 (Anywhere on Earth)"
          fetched_at: 2026-11-20
          snapshot_hash: 9f2c...
```

### 5.2 关键约束（由校验器强制）

- `edition.evidence[].quote` 与 `deadline.evidence.quote` 必须是对应 `snapshot_hash` 快照文本的子串；否则校验失败。
- `due` 必须能由 `raw_text` + `timezone` 推导出一致结果（防止手改 due 忘了改原文）。
- `status: tentative` 的 deadline 必须带 `tentative_reason`（例如"官方 CFP 未发布，来自第三方 tracker"）。
- 同一 edition 的 deadline `kind` 不应重复（允许覆盖时用 `superseded_by`）。
- `fetched_at` 不得晚于当天；超过 30 天未核验的数据在 UI 上显示"陈旧"。

### 5.3 期刊：没有截止日期的"投稿模型"

期刊是滚动投稿，`submission_model: rolling`，不产生 `deadlines`。取而代之：

```yaml
review_metrics:
  - metric: time_to_first_decision
    value: "约 3 个月"
    kind: official            # official | third_party_statistic | user_experience
    sample: null
    evidence: { url: ..., quote: "...", fetched_at: ... }
```

`kind` 是硬字段：**官方说法、第三方统计、个人经验永远不混在一起展示**，也不合成一个分数。没有官方数据就留空。

### 5.4 变更日志

每次数据提升写入 `data/changelog/<yyyy-mm>.yaml`，结构化记录字段级变化：

```yaml
- at: 2026-11-23T02:10:00Z
  venue_id: cvpr
  edition_id: cvpr-2027
  field: deadlines[cvpr-2027-paper].due
  old: 2026-11-16T23:59:59
  new: 2026-11-23T23:59:59
  change_type: date_move    # date_move|new_edition|location_change|structure_change
  evidence: { url: ..., quote: "...", fetched_at: ... }
  pr: 128
```

这是"谁延期了"功能的唯一数据来源，也是用户判断信息新鲜度的依据。

---

## 6. 采集与更新管道（本项目最核心的部分）

### 6.1 源登记表

```yaml
# sources/registry.yaml
- venue_id: cvpr
  adapter: thecvf               # 确定性适配器名
  cadence: daily                # daily|weekly；临期自动加密
  pages:
    - role: dates
      url: https://cvpr.thecvf.com/Conferences/{year}/Dates
    - role: cfp
      url: https://cvpr.thecvf.com/Conferences/{year}/CallForPapers
  cross_check:                  # 仅用于冲突检测，永不作为唯一真相
    - https://ccfddl.github.io/
```

`{year}` 由"下一个未过期的 edition"推导，避免每年手工改 URL。

### 6.2 三级抽取器

| 级别 | 适用 | 实现 | 成本 |
|---|---|---|---|
| L1 确定性 | CVF 家族（CVPR/ICCV/WACV）、NeurIPS/ICLR 的 Dates 表格、ECCV | 选择器 + 正则 + 表格解析，配 golden fixture 测试 | 0 |
| L2 家族模板 | 同一套模板建站的会议（如 ACM、Springer 系列） | 配置化模板，无代码 | 0 |
| L3 LLM 兜底 | 结构没见过的页面 | 强约束 JSON 输出 + **原文 quote 必填** | 每次约 1–2k token |

L3 的提示词只有一句硬要求：**"只允许输出页面中逐字出现的文本片段作为 quote；找不到就返回 null，不要推断。"** 返回后由代码回验 quote，这是防幻觉的关键——模型可以错，但错的输出进不了库。

### 6.3 多源对账

- 同一 deadline 若官方页与 cross_check 源不一致 → 标记 `conflict`，进入人工队列，**不自动合并**。
- 只有官方源才算 `confirmed`；第三方源单独标 `tentative` 并写 `tentative_reason`。
- 冲突记录进 `data/conflicts.yaml`，UI 上以"官方与第三方不一致，已按官方显示"呈现。

### 6.4 快照与变更检测

```
fetch → 规范化文本（去脚本/样式/导航）→ sha256
  ├─ hash 与上次相同 → 直接结束（0 成本，占日常 80%+）
  └─ hash 变化 → 抽取 → 与现有 YAML 做字段级 diff → 进入闸门
```

原始 HTML 不作为仓库内容（会膨胀），只存**规范化文本**（几 KB/页），原始 HTML 放 Actions artifact 保留 90 天，供争议时回查。

### 6.5 调度策略

- 默认每周一次（周一 UTC 02:00）。
- **临期加密**：某 edition 距截止 ≤ 60 天 → 每日；≤ 7 天 → 每 6 小时。延期公告最常发生在临近期。
- 抓取礼仪：串行 + 每站 ≥ 2s 间隔、带 UA、遵守 robots.txt、只抓 CFP/Dates 页，不全站爬。

### 6.6 PR 机器人

```
分支：data/auto/<yyyy-mm-dd>
标题：[data] 2026-11-23 自动更新：3 处变更（1 延期）
正文：
  - 变更表：venue / 字段 / 旧值 / 新值 / 出处 / 原文片段
  - 校验结果：schema ✅ quote 回验 ✅ 多源一致 ✅
  - 自动合并条件是否满足
```

**自动合并**（`gh pr merge --auto`）需同时满足：

1. 变更全部来自官方源；
2. 每条 quote 在快照中命中；
3. 无冲突；
4. 变更为 `date_move` 且幅度 ≤ 60 天，或为新增 deadline；
5. 校验器全绿。

其余情况（结构变化、地点变更、幅度异常）→ 留给人工，PR 里 @ maintainer。

### 6.7 失败与降级

| 情况 | 行为 |
|---|---|
| 404 / 域名变更 | 该 venue 标记 `source_broken`，开 issue，UI 显示"来源失联" |
| 页面结构变化导致抽取为空 | 不覆盖旧数据；标记 `needs_adapter_update`；L3 兜底一次 |
| 连续 N 次抓取失败 | 降频 + 告警，数据保留但打上"X 天未核验" |
| 抽取出的日期不合常理（早于今天 1 年/晚于 5 年） | 拒绝入库，进人工队列 |

### 6.8 成本估算

20 个 venue × 每周 1 次 = 80 次抓取/周；hash 未变则 0 LLM 调用。假设 10% 需要 L3 抽取、每次 2k token，约 16k token/周，成本可忽略（< $1/月）。临期加密期间最多 20×4×7=560 次抓取/周，仍可接受。

---

## 7. AI 前端

### 7.1 三个能力，按风险从低到高

**A. 自然语言 → 结构化筛选（低风险，先做）**

> "未来三个月还能投的 CCF-A 会议，最好在亚洲"

模型只做一件事：把这句话编译成筛选对象，**展示给用户看**，再由纯函数执行：

```json
{ "deadline_within_days": 90, "qualification": {"system":"ccf","level":"A"},
  "region": "asia", "status": ["confirmed","tentative"] }
```

结果来自本地数据，不经过模型生成。模型出错最多是筛错，不会编造日期。

**B. 变更摘要（低风险）**

把本周 diff 翻译成人话："CVPR 2027 投稿截止从 11/16 延到 11/23；ICCV 2027 新增 workshop 截止。" 每条摘要带 changelog 记录 id。

**C. 论文 → 会议匹配（中风险，最后做）**

输入标题/摘要 → 候选 venue 排序 + 理由。理由必须引用该 venue 的 `scope.evidence.quote`。明确标注"基于收录范围描述的建议，不构成投稿建议"。

### 7.2 防幻觉边界（硬规则）

1. 模型**不能**输出数据层没有的日期、地点、等级。
2. 每个回答必须带引用（venue id + 证据 URL + 核验日期）；无引用视为失败，UI 显示"未找到依据"。
3. 数据缺失时，标准话术是"该会议下一届信息尚未公布"，而不是推测。
4. 所有 AI 功能默认关闭；开启需用户自己填 key（`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`，兼容 OpenAI 协议，可接本地 Ollama）。

### 7.3 UI 信息架构

```
首页（投稿视图）     ← 默认落地页，不是列表
  ├ 倒计时卡片：最近 3 个可投会议的截止
  ├ 本周变更：延期/新增（来自 changelog）
  └ 筛选条：领域 / 类型 / 资质 / 时间窗

会议/期刊列表
  ├ 排序：截止日期（默认）/ 名称 / 资质
  ├ 徽章：CCF-A / CORE A* / 双盲 / 滚动投稿
  └ 状态：可投 / 临期(≤14d) / 已截止 / 待确认 / 未公布

详情页
  ├ 重要日期表（原文 + 标准化 + 时区 + 状态 + 证据）
  ├ 变更历史（时间线）
  ├ 资质与审稿制度（分来源标签）
  ├ 收录范围（用于判断 fit）
  └ 操作：加入投稿计划 / 导出 ICS / 复制引用

投稿计划（保留上一版逻辑，降级为辅助功能）
```

### 7.4 运行形态

- 默认：`npm run dev` 本地 Vite 服务，数据在构建时打包。
- 可选：`npm run build` 出静态站，用户自己扔 GitHub Pages / Vercel。
- AI 调用：浏览器 → 用户配置的 OpenAI 兼容端点（key 存 localStorage，或本地 `vite` 中间件读 `.env`，避免 CORS）。
- 不托管任何用户数据。

---

## 8. 开源工程

### 8.1 仓库结构

```
cv-venue-radar/
├─ data/
│  ├─ fields/computer-vision.yaml
│  ├─ venues/*.yaml                 # 一 venue 一文件
│  ├─ snapshots/<venue>/*.txt        # 规范化快照（用于 quote 回验）
│  ├─ changelog/*.yaml
│  └─ conflicts.yaml
├─ sources/registry.yaml
├─ packages/
│  ├─ core/       # schema(zod)、加载器、查询引擎、AoE/时区、changelog
│  ├─ acquire/    # fetch、snapshot、adapters、llm-extract、reconcile、diff、gate、pr
│  ├─ cli/        # cvr update / validate / add-venue / export
│  └─ web/        # Vite + React
├─ .github/workflows/{ci.yml, update-data.yml}
├─ docs/{PLAN.md, DATA_MODEL.md, ADD_A_VENUE.md, ARCHITECTURE.md}
├─ CONTRIBUTING.md  README.md  LICENSE (MIT)  .env.example
└─ package.json     # npm workspaces，无额外包管理器依赖
```

技术选型：Node 22 + TypeScript + npm workspaces；`zod`（schema 共享给 CLI 与 Web）、`cheerio`（HTML 解析）、原生 `fetch`；Web 侧 React 19 + Vite，样式手写 CSS（不引入 UI 框架，降低贡献门槛）。

### 8.2 CLI

```bash
npx cvr validate                 # 校验数据 + quote 回验（CI 同款）
npx cvr update [--venue cvpr]    # 抓取 → 候选 → diff（本地，需网络）
npx cvr update --dry-run         # 只报告会改什么，不落盘
npx cvr add-venue <url>          # 交互式登记新 venue + 生成 YAML 骨架
npx cvr export --ics             # 导出日历
```

### 8.3 CI

```yaml
# ci.yml：每个 PR —— validate + 单测 + build（不联网）
# update-data.yml：cron —— update → 有变更则开 PR → 满足条件则自动合并
```

### 8.4 贡献流程（加一个会议要做的事）

1. `npx cvr add-venue https://example.org/2027/dates`
2. 填 `names / type / official_url / qualifications`
3. `npx cvr update --venue example` → 自动生成 deadlines 草稿（带 quote）
4. `npx cvr validate` → 提交 PR
5. CI 校验 quote 是否真的在快照里；reviewer 只看 diff

目标：**新加一个会议 ≤ 10 分钟，不需要读代码。**

### 8.5 领域包

`data/fields/<field>.yaml` 定义领域元信息 + 默认资质体系 + 默认源模板。Web 侧用 `/fields/<id>` 路由，未激活的领域不显示入口（避免空页面）。新增领域 = 新增一个 YAML + 一批 venue 文件，不改核心代码。

### 8.6 治理

- License：MIT（数据用 CC0/CC-BY 单独声明，避免"数据能不能转载"的争议）。
- 数据免责声明放 README 顶部与每个页面 footer。
- 维护者只保证"有出处的数据"，不保证"数据一定最新"；用 `last_verified_at` 让用户自己判断。

---

## 9. 路线图

| 里程碑 | 目标 | 关键交付 | 验收标准 | 预估 |
|---|---|---|---|---|
| **M0** | 立地基 | schema v2 + 校验器（含 quote 回验）+ 目录骨架 + 迁移现有 3 条数据 + CI | `npm run validate` 全绿；schema 有单测 | 0.5 天 |
| **M1** | 打通一条自动更新链路 | fetcher/snapshot/differ/gate + thecvf 适配器（CVPR/ICCV/WACV） | 对 CVPR 2027 页跑 `update --dry-run`，能正确报出 5 条 deadline；删掉页面某行后能报出 diff | 1–2 天 |
| **M2** | 无人值守 | GitHub Actions 定时 + PR 机器人 + 冲突队列 | 手动触发 workflow → 自动开 PR；满足条件自动合并；失败有 issue | 1 天 |
| **M3** | 铺数据 | 8–12 个会议 + 4–6 个期刊（含 rolling 模型）+ changelog | 每个 venue 有 ≥1 条 quote 可回验的证据；无 quote 的数据为 0 | 2–3 天 |
| **M4** | 好用的前端 | 首页投稿视图、列表排序/徽章、详情时间线、ICS | 首屏 3 秒内看出"下一个截止是什么"；键盘可操作；移动端可用 | 2–3 天 |
| **M5** | AI 层 | NL 筛选、变更摘要、（可选）论文匹配 | 10 条测试问句全部落到正确筛选或明确说"未收录"；0 条编造 | 2 天 |
| **M6** | 可分发 | CLI 打包、README/文档、CONTRIBUTING、示例配置、v0.1.0 release | 陌生人按 README 在 10 分钟内跑起来 | 1 天 |

**建议顺序**：M0 → M1 → M2 先把"会自己更新"证明出来（这是你最在意的能力，也是最大的技术风险），再铺数据、做界面。不要先做 UI——UI 做完发现数据层要重构，等于白做。

---

## 10. 与现有代码的关系

| 现有资产 | 处置 | 原因 |
|---|---|---|
| `scripts/validate-field-pack.mjs`、`scripts/validate-schedule.mjs` | **保留思路，重写** | 校验不变量是对的，但要加 quote 回验、schema v2 |
| `fields/computer-vision/*.json` | **迁移**为 `data/venues/*.yaml` | 数据本身（CVPR/ICCV 2027）可复用 |
| `src/lib/{planner,ics}.ts` + 测试 | **保留** | 倒排计划与 ICS 逻辑独立且已测试，降级为辅助功能 |
| `src/components/*` | **重写** | 现有列表无截止排序、无证据展示、无变更历史 |
| `orchestration/*` | **归档**到 `docs/archive/` | 作为历史决策记录保留，不再作为产品组织方式 |
| `dist/`、`node_modules/` | 清理，`.gitignore` | 不应进仓库 |
| `vitest.config.ts` 的 `pool: 'threads'` | 保留 | 受限沙箱下 forks 池无法建立 IPC（`Timeout terminating forks worker`） |

---

## 11. 风险清单

| 风险 | 影响 | 对策 |
|---|---|---|
| 会议官网改版，解析器集体失效 | 数据停更 | golden fixture 测试 + 失败即告警 + L3 兜底；结构变化不覆盖旧数据 |
| LLM 抽取幻觉 | 假截止日期 | quote 必须逐字命中快照，否则拒收；这是硬闸门，不靠提示词 |
| 第三方 tracker 与官方冲突 | 用户困惑 | 双源并列展示，官方优先，冲突显式标注 |
| 时区/AoE 换算错误 | 差一天 | 存原始文本 + 原始时区，展示层同时给出"原文"和"换算后本地时间" |
| GitHub Actions 额度/限流 | 更新延迟 | 默认每周 + 临期加密；串行 + 间隔 2s；hash 未变不调 LLM |
| 数据版权/转载 | 法务风险 | 只存短引用（quote）+ 链接，不整页转载；数据 CC-BY |
| 只有一个人维护 | 项目死掉 | 领域包 + add-venue 流程降低贡献门槛；数据自动更新减少维护负担 |
| 范围膨胀到全学科 | 质量下降 | 只激活 CV；其他领域接受"planned"状态，不显示入口 |

---

## 12. 第一周

1. **D1**：定稿本文；建仓库骨架；schema v2 + 校验器（含 quote 回验）+ 迁移 3 条数据。
2. **D2–D3**：fetcher + snapshot + thecvf 适配器；用 CVPR/ICCV/WACV 三个真实页面跑通 `update --dry-run`，产出第一份 diff。
3. **D4**：GitHub Actions + PR 机器人；手动触发一次，看到自动 PR。
4. **D5**：复盘的三个问题——抽取准确率、diff 是否可读、失败是否可见。据此决定 M3 铺数据的节奏。

**验收这一周的唯一标准**：一个陌生人打开仓库，能在不知道任何背景的情况下，看懂"这个工具怎么自己更新数据"，并且能跑起来。

---

## 附：待你确认的三个决策

1. **数据格式 YAML vs JSON**：建议 YAML（可写注释、diff 干净、贡献者友好），代价是构建期需要一个 YAML 解析依赖。
2. **自动更新跑在哪**：建议"上游仓库 Actions 定时 + PR"，用户 `git pull` 拿更新；同时也支持本地 `npm run update`（自带 key）。如果你更希望"每个用户自己跑"，架构不变，只是默认 cadence 改成手动。
3. **M1 先覆盖哪些 venue**：建议 CVPR / ICCV / WACV（同一套 CVF 模板，一个适配器覆盖三个），风险最低、验证最快。
