#!/usr/bin/env node
/**
 * 自然语言筛选 CLI。规则解析、结构化筛选、原始数据回答；不调用模型。
 *
 *   node cmd/ask.ts "未来三个月还能投的会议"
 *   node cmd/ask.ts --json "随时可以投的期刊"
 */
import { askJson, askVenues } from '../core/ask.ts';
import { loadVenues } from '../core/load.ts';
import { formatLocal, toAgentJson } from '../core/query.ts';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`用法：
  node cmd/ask.ts [--json] "<问题>"

示例：
  node cmd/ask.ts "未来三个月还能投的会议"
  node cmd/ask.ts "随时可以投的期刊"
  node cmd/ask.ts "CVPR 2027 什么时候截止"

说明：只识别有限的说法；无法识别时会明确说“不支持”，不会猜日期。`);
  process.exit(0);
}

const unknown = argv.find((arg) => arg.startsWith('--') && arg !== '--json');
if (unknown) {
  console.error(`未知参数：${unknown}`);
  process.exit(2);
}

const json = argv.includes('--json');
const question = argv.filter((arg) => arg !== '--json').join(' ').trim();
if (!question) {
  console.error('用法：node cmd/ask.ts [--json] "<问题>"');
  process.exit(2);
}

const venues = loadVenues().map((file) => file.data);
const result = askVenues(venues, question);

if (json) {
  console.log(
    JSON.stringify(
      {
        ...askJson(result),
        venues: toAgentJson(result.rows),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`问题：${result.plan.query}`);
if (result.plan.explanation.length > 0) {
  console.log('筛选条件：');
  for (const line of result.plan.explanation) console.log(`  - ${line}`);
}
if (result.plan.unsupported) console.log(`\n${result.plan.unsupported}`);
for (const note of result.notes) console.log(`\n${note}`);

if (result.rows.length > 0) {
  console.log(`\n匹配（${result.rows.length}）：`);
  for (const { venue, deadline, days, state } of result.rows) {
    const when = deadline ? formatLocal(deadline) : '—';
    const dayText =
      days === null
        ? ''
        : state === 'passed'
          ? `（已截止 ${Math.abs(days)} 天）`
          : state === 'open' || state === 'soon'
            ? `（还有 ${days} 天）`
            : '';
    console.log(`  ${venue.names.short}  ${venue.type}  ${when}${dayText}  [${state}]`);
    if (deadline) console.log(`    ${deadline.evidence.url}  fetched ${deadline.evidence.fetched_at}`);
  }
}
