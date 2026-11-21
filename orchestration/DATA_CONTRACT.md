# 数据契约

## Field 配置

每个领域包包含 `field.json`：

```json
{
  "schema_version": 1,
  "id": "computer-vision",
  "slug": "computer-vision",
  "name_zh": "计算机视觉",
  "name_en": "Computer Vision",
  "status": "active"
}
```

`id` 与 `slug` 使用小写英文和连字符。`status` 首版只允许 active 或 planned。

## Venue 种子文档

领域包的 `venues.json` 使用以下顶层结构：

```json
{
  "schema_version": 1,
  "field_id": "computer-vision",
  "venues": []
}
```

每个 Venue 必须包含：

- `id`：领域内唯一的小写稳定标识。
- `slug`：领域内唯一的小写稳定标识。
- `name`：官方英文全称。
- `short_name`：常用简称。
- `type`：首版为 conference 或 journal。
- `official_url`：HTTPS 官方网站。
- `field_ids`：至少包含当前领域 ID。
- `evidence`：至少一条包含 `url` 和 `last_verified_at` 的证据。

证据 URL 必须为 HTTPS，核验日期使用 YYYY-MM-DD。本轮只记录稳定基础身份，不断言当前届次、截稿日期或资质。

## 后续实体边界

VenueEdition 保存具体年份和届次；Deadline 保存日期类型、原始文本、标准化时间、原始时区、来源和核验时间；Qualification 保存体系、等级、年份和来源。上述实体不得塞入 Venue 基础身份文档。

## 首版校验不变量

- 必填字段存在且类型正确。
- 领域包顶层 `field_id` 必须等于 `field.id`。
- Venue 的 `id` 和 `slug` 分别唯一。
- 官方链接和证据链接必须使用 HTTPS。
- 每个 Venue 必须归属于当前领域。
- 校验失败必须返回可读错误；命令行进程以非零状态退出。

## Schedule：VenueEdition 与 Deadline

Schedule 文档顶层包含 `schema_version: 1`、`field_id`、`editions` 和 `deadlines`。 editions 与 deadlines 均为数组，允许为空；examples 目录中的数据只用于测试，不得作为真实科研信息展示。

Edition 必填：

- `id`：小写字母、数字和连字符组成的稳定标识，在 editions 内唯一。
- `venue_id`：关联 Venue 的稳定标识。
- `year`：2000 至 2200 的整数。
- `label`：非空展示名称。
- `official_url`：HTTPS 官方届次页面。
- `evidence`：至少一条 HTTPS URL 与 YYYY-MM-DD 核验日期。

Deadline 必填：

- `id`：小写字母、数字和连字符组成，在 deadlines 内唯一。
- `edition_id`：必须引用当前文档中已存在的 Edition。
- `kind`：abstract、paper、supplement、rebuttal、camera_ready、notification 或 other。
- `raw_text`：来源中的原始日期文本。
- `due_local`：YYYY-MM-DDTHH:mm:ss 格式的本地时间，不带时区偏移；必须是实际存在的合法日期和时间。
- `timezone`：Node.js Intl.DateTimeFormat 可接受的 IANA 时区名称。
- `status`：tentative、scheduled、extended 或 cancelled。
- `evidence`：至少一条 HTTPS URL 与 YYYY-MM-DD 核验日期。

首版只验证本地时间和时区合法性，不在数据层自动换算 UTC，也不在缺少官方证据时推测截止日期。

## 正式 Schedule 数据

真实届次与截止日期存放在领域包的 `schedule.json`，结构同 Schedule 文档；examples 目录只放虚构测试数据，二者严格分离。

数据写入遵循：

- 只写入有官方来源（官网或官方公告）支撑的字段。
- `status` 语义：scheduled 表示官方已公布的确定日期；tentative 表示第三方推测或官方未最终确认；extended 表示官方延期；cancelled 表示取消。
- 已过去的截止日期仍如实记录，但不得在界面上暗示仍可投稿；展示时须明确标注"已截止"。
- 时区：CVF 系列会议截止日期按 AoE（UTC-12，对应 Etc/GMT+12）记录；非 AoE 会议记录官方公布的本地时区。
- 每条 Deadline 的 evidence.url 指向官方公告页面，last_verified_at 为本次核验日期。
