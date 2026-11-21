# 新增一个 venue

目标：**不读核心代码，在 10 分钟内生成一份合法的 venue 骨架与抓取登记。**

`add-venue` 只生成结构和信源，**不会生成任何截止日期**。日期必须随后从官网抓取，并通过 `evidence.quote` 快照回验。

---

## 1. 找到官方入口

准备两样东西：

- **官网入口**：固定会议通常是当年的 Dates 页，例如 `https://cvpr.thecvf.com/Conferences/2027/Dates`；滚动期刊是官网首页。
- **身份信息**：`id`（小写 slug）、简称、官方全称。

只接受公开的 `https://` 域名；`localhost`、IP 地址、通配 DNS 服务和带账号密码的 URL 会被拒绝。真正抓取时还会解析全部 A/AAAA 记录，并在每一次重定向后重复检查，解析到内网地址的域名同样会被拒绝。

---

## 2. 先预览

```bash
npm run add-venue -- \
  https://eccv.ecva.net/ \
  --id eccv \
  --short ECCV \
  --full "European Conference on Computer Vision"
```

默认**不写文件**，只打印将生成的 `data/venues/eccv.yaml`、`sources/registry.yaml` 追加项和风险提示。

常用选项：

| 选项 | 说明 |
|---|---|
| `--type conference\|journal` | 默认 `conference` |
| `--model fixed\|rolling` | 默认会议 `fixed`、期刊 `rolling` |
| `--adapter thecvf\|manual` | 默认按域名推断；`*.thecvf.com` 为 `thecvf` |
| `--cadence daily\|weekly\|monthly\|manual` | 默认会议 `weekly`、期刊 `manual`；`manual` 表示 `update` / Actions 永不自抓 |
| `--official-url <url>` | 官网主页；会议默认取入口 URL 的 origin，期刊默认取入口 URL |
| `--publisher <name>` | 出版社 / 学会 |
| `--field <id>` | 领域包；当前只有一个激活领域时自动选择 |
| `--json` | 输出机器可读结果 |
| `--write` | 真正落盘 |

交互终端下，缺少 `--id` / `--short` / `--full` 会逐项询问；CI 或非交互环境必须显式传参。`--id` 可省略，命令会尝试从域名推断（如 `cvpr.thecvf.com` → `cvpr`）。

---

## 3. 写入并校验

```bash
npm run add-venue -- --write \
  https://eccv.ecva.net/ \
  --id eccv \
  --short ECCV \
  --full "European Conference on Computer Vision"

npm run validate
```

命令会拒绝覆盖已有 venue 文件或已有源登记。写入时先创建 venue 文件，再用「临时文件 + fsync + rename」原子替换 `sources/registry.yaml`；第二步失败会回滚已创建的文件。整个读—改—写过程持有 `registry.yaml.lock`，因此并发添加不会互相丢条目；异常退出留下的锁会在 30 秒后被视为过期。

生成的固定会议骨架长这样：

```yaml
schema_version: 2
id: eccv
type: conference
names:
  short: ECCV
  full: European Conference on Computer Vision
field_ids:
  - computer-vision
official_url: https://eccv.ecva.net/
submission_model: fixed
qualifications: []
editions: []
```

`editions: []` 是有意为之：此刻还没有任何可回验的日期，不能为了让页面好看而编造一届。

---

## 4. 抓取日期

只有 `adapter: thecvf` 的信源能直接走现有自动抽取：

```bash
npm run update:dry -- --venue eccv   # 看看会抽出什么，不落盘
npm run update -- --venue eccv       # 写回 YAML 与快照
npm run validate
```

如果命令提示 `manual 信源或手动更新频率`，说明该站点还没有适配器，或你显式设了 `--cadence manual`。前者二选一：

1. 在 `acquire/adapters/` 增加适配器，并让 `cmd/update.ts` 识别；
2. 按 [数据契约](../core/schema.ts) 手工补日期，但每条 `deadline` 仍必须有 `raw_text`、`evidence.quote`、`evidence.url` 和可在快照中逐字命中的内容。

**不要**手工写一个没有出处的日期，也不要为了通过校验去改 `due_source`。

---

## 5. 滚动期刊

滚动投稿期刊没有截止日期：

```bash
npm run add-venue -- --write \
  https://www.computer.org/csdl/journal/tp \
  --id tpami \
  --short TPAMI \
  --full "IEEE Transactions on Pattern Analysis and Machine Intelligence" \
  --type journal \
  --publisher IEEE
```

生成 `submission_model: rolling`、`editions: []`，并在 `sources/registry.yaml` 登记 `role: home`。`validate` 会强制 rolling 期刊不出现 deadline。后续可补 `qualifications`、`scope`、`review`，这些字段同样需要证据。

---

## 6. 提交前检查

```bash
npm run validate
npm run test:all
npm run audit:privacy   # 准备公开仓库时
git diff -- data/venues sources/registry.yaml
```

Reviewer 重点看：

- `official_url` 是否是真正的官网，而不是聚合站；
- `sources/registry.yaml` 的页面是否是可长期抓取的官方页；
- 新日期是否有能在快照中命中的原文；
- 是否误把 rolling 期刊写成了 fixed。
