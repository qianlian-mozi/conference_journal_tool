# 日历导出与订阅

把当前领域包或筛选结果中的截止日期导入 Windows、Google、Apple 或 Outlook 日历。事件只使用数据里已有的 `due_utc`，不根据本地时间或时区自行推算。

## 网页：下载 `.ics`

1. 选择领域包，按需使用搜索、会议/期刊筛选和“只看还能投”。
2. 点击工具栏的 **导出日历**。
3. 浏览器下载 `venue-radar-<pack>.ics`；**导出范围就是当前列表**。
4. 用日历应用打开或导入文件。

每个截止节点生成一个 15 分钟事件：

- 标题包含 venue、届次与节点名；
- `DTSTART` 使用已有 UTC 瞬时，日历应用负责转换为设备本地时间；
- 描述保留官网本地时间、时区、`due_source`、核验日期、原文 quote 与来源 URL；
- 默认带截止前 24 小时提醒，事件设为“透明”，不会把日程显示为忙碌；
- `tentative` / `cancelled` 映射为对应日历状态。

没有 `due_utc` 的条目会被跳过并在页面提示；rolling 期刊没有固定截止日期，不会制造事件。提醒是否导入由各日历应用决定。

## 导入常见工具

界面名称可能随版本变化，但操作类型相同：

- **Windows / Outlook**：双击 `.ics`，或在 Outlook 日历中选择“添加日历 → 从文件上传”。
- **Google 日历**：设置 → 导入和导出 → 导入；也可按下面的 URL 订阅。
- **Apple 日历**：文件 → 导入；macOS/iOS 也可订阅 URL。
- **Outlook 网页版**：添加日历 → 从文件上传，或“从 Web 订阅”。

**导入是快照**：之后仓库里的日期变化不会自动更新已经导入的事件。需要持续更新时使用订阅 URL，或重新导出并导入。

## 构建产物：订阅 URL

`npm run build` 除 Web 页面外，还生成：

```text
dist/calendars/3dgs-avatar.ics
dist/calendars/computer-vision.ics
dist/calendars/index.json
```

部署 `dist/` 后，可以订阅：

```text
https://<你的静态站点域名>/<可选 base 路径>/calendars/3dgs-avatar.ics
```

在 Google 日历中选择“其他日历 → 通过网址添加”，在 Apple/Outlook 中选择“订阅日历/从 Web 订阅”。是否支持 `webcal://` 取决于客户端；优先使用上述 HTTPS URL。

ICS 带 `REFRESH-INTERVAL: PT12H` 与 `X-PUBLISHED-TTL: PT12H`，这是刷新提示，不是强制保证；实际更新还取决于采集、构建、部署和客户端刷新周期。要让订阅保持新鲜，应把 `npm run update`、构建和静态部署串进发布流程。

事件的 UID 同时包含 venue id 与 deadline id，避免不同 venue 的同名节点互相覆盖。订阅文件里的 `DTSTAMP` 使用本次构建时间，因此即使同一核验日内发生第二次修订，客户端也能看到更新的时间戳；`index.json` 另外保留数据核验日期 `generated_at` 和日历构建时间 `calendar_generated_at`。

`index.json` 列出每个包的文件、事件数和跳过数，方便部署系统检查产物。

## 实现与验证

- `src/lib/ics-core.ts`：CRLF、转义和 RFC 5545 的 **75 UTF-8 octets** 折行；不会在多字节中文中间断行。
- `src/lib/deadline-ics.ts`：从领域包/venue 生成 deadline VEVENT。
- `src/lib/ics.ts`：旧的倒排投稿计划 ICS，复用同一套序列化规则。
- `scripts/export-calendars.mjs`：构建后为所有活跃领域包生成订阅文件。

测试覆盖 UTC 起止时间、稳定 UID、状态、提醒、缺失时刻跳过、中文折行和转义。
