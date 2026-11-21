# 自然语言筛选（M5-A 基线）

`ask` 把有限的中英文问法编译成结构化 `QueryOptions`，再由现有查询引擎执行。

**它不调用模型，也不生成日期。** 无法识别时会明确说“不支持”或“未收录”，不会拿相近的
venue、别的届次或推测的时间顶替。

```bash
npm run ask -- "未来三个月还能投的会议"
npm run ask -- "有没有随时可以投的期刊"
npm run ask -- "CVPR 2027 什么时候截止"
node cmd/ask.ts --json "3DV 2027 什么时候截止"   # 纯 JSON，避免 npm 横幅
```

## 支持的筛选

| 说法 | 结构化结果 |
|---|---|
| 会议 / 期刊 | `type` |
| 未来 N 天/周/月/年、半年、within N days | `withinDays` |
| 还能投 / 可投 / 未截止 / open | `openOnly` |
| 已截止 / passed | `states: [passed]` |
| 即将截止 / 临期 | `states: [soon]`（14 天内） |
| 随时投 / 滚动 / rolling | `submissionModel: rolling` |
| CCF-A/B/C、CORE A*/A/B/C | `qualification` |
| CVPR、3DV、TPAMI 等已收录 id/简称/全称 | `venueId` |

venue 问法带年份时，只查该届；未收录该届就明确返回“未收录 2028”，不回退到其他年份。

## 不支持的问法

- “帮我选刊”“这篇论文适合投哪里”等论文—venue 匹配：尚未实现，明确拒绝。
- 同时要会议和期刊：明确拒绝，不擅自二选一。
- 没有可执行条件的泛问：“最近怎么样？”。

## 缺数据时的行为

资质筛选依赖 `qualifications`。当前收录的 venue 大多还没有 CCF/CORE 数据，因此
`CCF-A 会议` 会返回空结果，并说明**“没有资质数据”不等于“没有符合条件的会议”**。
同理，`未来三个月还能投` 在当前日期下可能确实为空；回答不会为了好看而补 venue。

## 测试

```bash
npx vitest run tests/ask.test.ts
```

12 条问句覆盖 venue/届次、时间窗、rolling、资质缺失、passed、未收录 venue、未收录届次、
论文匹配拒绝、空问题与类型冲突。时间依赖统一使用固定 `now`，不随运行日期漂移。

## 后续接模型时的边界

如果以后接 LLM，模型只允许产出同一种 `AskPlan`（筛选对象 + 解释），执行仍由
`queryVenues` 完成；模型输出不得直接包含日期、地点、等级或 venue 列表。任何新增字段必须
先在 `QueryOptions` 里有确定语义与测试。
