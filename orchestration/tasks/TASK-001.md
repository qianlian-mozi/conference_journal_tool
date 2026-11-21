# TASK-001：建立 Computer Vision 领域包与校验器

- 状态：done
- 执行角色：日用模型
- 目标：建立首个可机器校验的领域配置包，验证受约束执行链路。

## 必读上下文

- `orchestration/PROJECT.md`
- `orchestration/ARCHITECTURE.md`
- `orchestration/DATA_CONTRACT.md`
- 本任务文件

## 允许修改

- `fields/computer-vision/field.json`
- `fields/computer-vision/venues.json`
- `scripts/validate-field-pack.mjs`
- `tests/validate-field-pack.test.mjs`

不得修改其他文件，不得安装依赖，不得访问网络，不得增加前端、数据库、截止日期或资质数据。

## 指定种子数据

建立 Computer Vision 领域配置，并录入且仅录入以下三个 conference：

1. CVPR：IEEE/CVF Conference on Computer Vision and Pattern Recognition，官网 `https://cvpr.thecvf.com/`。
2. ICCV：IEEE/CVF International Conference on Computer Vision，官网 `https://iccv.thecvf.com/`。
3. ECCV：European Conference on Computer Vision，官网 `https://eccv.ecva.net/`。

每条记录使用对应小写简称作为 id 和 slug，field_ids 为 `["computer-vision"]`，以官网作为 evidence.url，last_verified_at 为 `2026-11-20`。

## 校验器接口

`validate-field-pack.mjs` 必须导出 `validateFieldPack(field, venueDocument)`，返回字符串数组；空数组表示有效，否则每项为可读错误。

命令行用法：

```bash
node scripts/validate-field-pack.mjs fields/computer-vision
```

有效时退出码为 0；无效或文件无法读取时退出码非零。

## 验收条件

- 两个 JSON 文件符合 DATA_CONTRACT，且只包含指定三个 Venue。
- 校验器检查必填字段、类型、领域匹配、id/slug 唯一性、HTTPS 和证据日期格式。
- 使用 Node.js 内置测试模块，覆盖有效数据、重复 id、非 HTTPS、领域不匹配四类情况。
- 不安装依赖，不修改允许范围外的文件。

## 必须运行的验证

```bash
node --test tests/validate-field-pack.test.mjs
node scripts/validate-field-pack.mjs fields/computer-vision
```

## 返回报告

返回实际变更文件、两条命令的执行结果、验收项状态和任何偏差。若需要修改契约或增加文件，停止并报告，不自行扩张范围。
