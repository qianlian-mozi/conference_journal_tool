# TASK-003：建立 Web 应用基础与投稿计划核心

- 状态：done
- 里程碑：M3
- 执行角色：日用模型

> 注意：package.json、依赖和 node_modules 已由规划模型准备好。本任务只写代码与测试，不执行 npm install。

## 目标

建立 React + TypeScript + Vite 应用，直接读取现有 CV 领域包，并实现可测试的投稿倒排计划与 ICS 生成工具。本任务只做最小占位界面，完整 UI 由后续任务实现。

## 必读

- `orchestration/PROJECT.md`
- `orchestration/DATA_CONTRACT.md`
- `orchestration/SUPERVISION.md`
- `fields/computer-vision/field.json`
- `fields/computer-vision/venues.json`

## 允许修改

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/types.ts`
- `src/data.ts`
- `src/lib/planner.ts`
- `src/lib/ics.ts`
- `src/lib/planner.test.ts`
- `src/lib/ics.test.ts`

不得修改现有 fields、scripts、tests、examples 和 orchestration 文件。不得执行 npm install，不得访问网络，不得添加 UI 组件或 CSS 文件，不得引入后端和数据库。依赖已就位，直接编写代码即可。

## 技术要求

- 使用 React、React DOM、Vite、TypeScript、Vitest 和 @vitejs/plugin-react；不添加其他运行库。
- 脚本至少包含 dev、build、test、preview；dev 和 preview 默认绑定 127.0.0.1。
- TypeScript 开启严格模式并支持 JSON 模块导入。
- `src/data.ts` 直接导入并导出 `fields/computer-vision` 中现有 JSON，不复制种子数据。
- App 占位页只需能渲染 Computer Vision 和实际 Venue 数量，证明数据链路可用。

## 投稿计划契约

SubmissionPlan 至少包含 id、venueId、title、deadlineAt、timezone、milestones、notes、createdAt。Milestone 至少包含 id、title、offsetDays、dueAt、completed。

实现 `createSubmissionPlan`：接收不含 milestones 的必要输入，根据 deadlineAt 生成六个里程碑，offsetDays 依次为 56、42、28、14、3、0，标题使用清晰中文建议。无效日期必须抛出可读错误。

实现 `getPlanProgress`：返回 total、completed、percentage；空里程碑时 percentage 为 0。

实现 `buildPlanIcs(plan, venueName)`：生成合法 VCALENDAR/VEVENT 文本，包含每个里程碑的 UTC 时间、UID、SUMMARY、DESCRIPTION，正确转义特殊字符并使用 CRLF。不得依赖真实会议截止日期。

## 验收与验证

- Vitest 覆盖六里程碑生成、56/42/28/14/3/0 天偏移、无效日期、进度计算、ICS 转义及 CRLF。
- `npm test` 全部通过。
- `npm run build` 成功。
- 返回变更文件、命令结果、验收状态和偏差。不要执行 npm install。
