#!/usr/bin/env node
/**
 * 查询 CLI：给人和 agent 用的结构化出口。
 *
 * 用法：
 *   node cmd/query.ts                        # 表格
 *   node cmd/query.ts --within 90            # 未来 90 天内还能投的
 *   node cmd/query.ts --type journal         # 只看期刊
 *   node cmd/query.ts --json                 # 结构化输出，给 agent / 脚本
 *   node cmd/query.ts --venue cvpr           # 单个 venue 的全部日期
 */
import { loadVenues } from '../core/load.ts';
import { formatLocal, queryVenues, toAgentJson } from '../core/query.ts';
import { parseQueryArgs, QUERY_USAGE } from './query-args.ts';

let args: ReturnType<typeof parseQueryArgs>;
try {
  args = parseQueryArgs(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  console.error(QUERY_USAGE);
  process.exit(2);
}

if (args.help) {
  console.log(QUERY_USAGE);
  process.exit(0);
}

const venues = loadVenues().map((file) => file.data);
const rows = queryVenues(venues, {
  field: args.field,
  type: args.type,
  withinDays: args.within,
  openOnly: args.open,
  venueId: args.venue,
});

if (args.json) {
  console.log(JSON.stringify(toAgentJson(rows), null, 2));
} else if (rows.length === 0) {
  console.log('没有匹配的会议或期刊。');
} else {
  const header = ['VENUE', 'TYPE', 'DEADLINE', 'DAYS', 'STATE'];
  const table = rows.map(({ venue, deadline, days, state }) => [
    venue.names.short,
    venue.type,
    deadline ? formatLocal(deadline) : '—',
    days === null ? '—' : String(days),
    state === 'passed'
      ? `passed ${Math.abs(days ?? 0)}d ago`
      : state === 'open' || state === 'soon'
        ? `in ${days}d`
        : state,
  ]);
  const widths = header.map((title, index) =>
    Math.max(title.length, ...table.map((row) => row[index].length)),
  );
  const render = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  console.log(render(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of table) console.log(render(row));
}
