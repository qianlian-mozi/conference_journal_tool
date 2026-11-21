# TASK-004：实现 CV 投稿辅助中文 Web 界面

- 状态：done
- 里程碑：M3
- 执行角色：日用模型
- 前置任务：TASK-003 独立验收通过

## 目标

将应用基础实现为可用、清晰、响应式的中文投稿辅助工具，覆盖总览、Venue 浏览与详情、投稿计划管理及 ICS 下载。

## 必读

- `orchestration/PROJECT.md`
- `orchestration/tasks/TASK-003.md`
- `src/types.ts`
- `src/data.ts`
- `src/lib/planner.ts`
- `src/lib/ics.ts`
- `src/App.tsx`

## 允许修改

- `src/App.tsx`
- `src/styles.css`
- `src/hooks/useSubmissionPlans.ts`
- `src/components/**`

不得修改 package、配置、正式 fields 数据、现有 orchestration、scripts、tests、examples，也不得修改 planner/ics 契约或安装依赖。如发现核心逻辑问题，停止并报告。

## 功能要求

### 总览

- 清晰说明当前领域为 Computer Vision，展示实际 Venue 数量、本地投稿计划数量、已完成进度。
- 展示按计划截止日期排序的最近计划；无计划时提供创建入口。
- 提供“新建投稿计划”和“浏览会议”动作。

### Venue 浏览与详情

- 展示现有 CVPR、ICCV、ECCV 真实基础数据。
- 支持按名称、简称、官方名称搜索，以及 conference/journal 类型筛选。
- 详情展示名称、类型、领域、官网、来源和最后核验日期。
- 不提供无来源的资质、审稿周期或实时截止日期；明确提示这些信息将在核验后补充。

### 投稿计划

- 表单包含关联 Venue、计划标题、目标截止日期时间、备注。
- 使用 datetime-local，并将用户本地时间正确转换为 ISO 存储；timezone 保存 Intl.DateTimeFormat 的本地时区。
- 使用 createSubmissionPlan 生成六阶段计划。
- 计划列表显示 Venue、目标日期、进度和里程碑；可勾选完成、删除计划、导出 ICS。
- 删除仅在当前浏览器本地执行，并有明确确认。
- 所有用户数据保存在 localStorage 键 `cv-submission-plans:v1`；损坏或不可用时不能导致应用崩溃。
- ICS 使用 buildPlanIcs 生成 Blob 并下载，不进行网络请求。

## 设计与可访问性

- 默认浅色主题，中文界面，风格专业、克制、适合科研工具。
- 使用纯色背景、清晰边框和适度留白，不使用渐变，不依赖外部图片或字体。
- 桌面和移动端均可使用；导航、卡片、表单和计划列表响应式布局。
- 使用语义化按钮和表单 label，键盘焦点清晰，弹层可用 Escape 关闭。
- 图标使用内联 SVG 或文本，不添加图标依赖。
- 不使用虚构实时数据填充界面。

## 验收与验证

- `npm test` 保持全部通过。
- `npm run build` 成功。
- 返回实际文件、命令结果、功能验收和偏差。
