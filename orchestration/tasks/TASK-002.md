# TASK-002：建立届次与截止日期校验基础

- 状态：done
- 执行角色：日用模型
- 目标：实现 VenueEdition 与 Deadline 的无依赖校验器、自动化测试和明确虚构的样例。

## 必读上下文

- `orchestration/DATA_CONTRACT.md`
- `orchestration/SUPERVISION.md`
- `scripts/validate-field-pack.mjs`
- 本任务文件

## 允许修改

- `scripts/validate-schedule.mjs`
- `tests/validate-schedule.test.mjs`
- `examples/computer-vision/schedule.example.json`

不得修改其他文件，不得安装依赖，不得访问网络，不得把样例数据写入正式 fields 数据。

## 接口与数据

导出 `validateSchedule(schedule)`，返回字符串错误数组；空数组表示有效。顶层包含 schema_version、field_id、editions 和 deadlines。

Edition 必填 id、venue_id、year、label、official_url、evidence。Deadline 必填 id、edition_id、kind、raw_text、due_local、timezone、status、evidence。详细约束以 DATA_CONTRACT.md 为准。

样例必须明确使用虚构的 `example-cv-conference` 和 `example-cv-conference-2099`，年份为 2099，官方及证据 URL 使用 example.com，不得冒充真实会议信息。

## 验收条件

- 校验必填字段、schema_version、field_id、ID 格式与唯一性、年份、HTTPS、证据日期。
- Deadline 必须引用已存在的 Edition。
- kind 和 status 只接受契约枚举。
- due_local 必须符合 YYYY-MM-DDTHH:mm:ss，并拒绝不存在的日历日期或时间。
- timezone 必须能被 Node.js Intl.DateTimeFormat 接受。
- 测试覆盖有效样例、无效时区、不存在的日期、重复 Edition ID、悬空 Deadline 引用。
- 命令行有效时退出码为 0，无效或读取失败时非零。

## 必须运行的验证

```bash
node --test tests/validate-schedule.test.mjs
node scripts/validate-schedule.mjs examples/computer-vision/schedule.example.json
```

## 返回报告

列出实际变更文件、命令及退出结果、逐项验收状态和偏差。需要越界时停止并报告。
