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

interface Args {
  field: string | null;
  type: string | null;
  within: number | null;
  venue: string | null;
  json: boolean;
  open: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { field: null, type: null, within: null, venue: null, json: false, open: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      return argv[index] ?? null;
    };
    if (arg === '--json') args.json = true;
    else if (arg === '--open') args.open = true;
    else if (arg === '--field') args.field = next();
    else if (arg.startsWith('--field=')) args.field = arg.slice(8);
    else if (arg === '--type') args.type = next();
    else if (arg.startsWith('--type=')) args.type = arg.slice(7);
    else if (arg === '--within') args.within = Number(next());
    else if (arg.startsWith('--within=')) args.within = Number(arg.slice(9));
    else if (arg === '--venue') args.venue = next();
    else if (arg.startsWith('--venue=')) args.venue = arg.slice(8);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.within !== null && !Number.isFinite(args.within)) {
  console.error('--within 需要一个数字（天）');
  process.exit(2);
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
