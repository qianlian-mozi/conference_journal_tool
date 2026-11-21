#!/usr/bin/env node
/**
 * 查询 CLI：给人和 agent 用的结构化出口。
 *
 * 用法：
 *   node cmd/query.ts                        # 表格：全部 venue 的投稿截止
 *   node cmd/query.ts --within 90            # 未来 90 天内还能投的
 *   node cmd/query.ts --type journal         # 只看期刊
 *   node cmd/query.ts --json                 # 结构化输出，给 agent / 脚本
 *   node cmd/query.ts --venue cvpr           # 单个 venue 的全部日期
 *
 * 原则：只读仓库里的 YAML，不联网、不猜日期。没有 dated 的 venue 会以
 * "unknown" 出现在 JSON 里，而不是被静默丢弃。
 */
import { loadVenues } from '../core/load.ts';
import type { Deadline, Edition, Venue } from '../core/schema.ts';

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

function daysLeft(deadline: Deadline): number | null {
  if (!deadline.due_utc) return null;
  const instant = Date.parse(deadline.due_utc);
  if (Number.isNaN(instant)) return null;
  return Math.ceil((instant - Date.now()) / 86_400_000);
}

function latestEdition(venue: Venue): Edition | null {
  if (venue.editions.length === 0) return null;
  return [...venue.editions].sort((a, b) => b.year - a.year)[0];
}

/** 投稿截止：优先 paper，其次 abstract，再退到最近的未来节点。 */
function submitDeadline(venue: Venue): { edition: Edition; deadline: Deadline } | null {
  const edition = latestEdition(venue);
  if (!edition) return null;

  const paper = edition.deadlines.find((item) => item.kind === 'paper');
  if (paper) return { edition, deadline: paper };

  const abstract = edition.deadlines.find((item) => item.kind === 'abstract');
  if (abstract) return { edition, deadline: abstract };

  const upcoming = edition.deadlines
    .filter((item) => item.due_utc)
    .sort((a, b) => Date.parse(a.due_utc as string) - Date.parse(b.due_utc as string));
  return upcoming.length > 0 ? { edition, deadline: upcoming[0] } : null;
}

function formatLocal(deadline: Deadline): string {
  return `${deadline.due.replace('T', ' ').slice(0, 16)} ${deadline.timezone}`;
}

const args = parseArgs(process.argv.slice(2));
const files = loadVenues();

const rows = files
  .map((file) => file.data)
  .filter((venue) => (args.field ? venue.field_ids.includes(args.field) : true))
  .filter((venue) => (args.type ? venue.type === args.type : true))
  .filter((venue) => (args.venue ? venue.id === args.venue : true))
  .map((venue) => {
    const picked = submitDeadline(venue);
    const days = picked ? daysLeft(picked.deadline) : null;
    return { venue, picked, days };
  })
  .filter((row) => {
    if (args.open && (row.days === null || row.days < 0)) return false;
    if (args.within !== null && (row.days === null || row.days < 0 || row.days > args.within)) {
      return false;
    }
    return true;
  })
  .sort((a, b) => {
    const left = a.days === null ? 9999 : a.days < 0 ? 5000 + Math.abs(a.days) : a.days;
    const right = b.days === null ? 9999 : b.days < 0 ? 5000 + Math.abs(b.days) : b.days;
    return left - right;
  });

if (args.json) {
  const payload = rows.map(({ venue, picked, days }) => ({
    id: venue.id,
    short: venue.names.short,
    full: venue.names.full,
    type: venue.type,
    submission_model: venue.submission_model,
    official_url: venue.official_url,
    editions: venue.editions.map((edition) => ({
      id: edition.id,
      year: edition.year,
      location: edition.location ?? null,
      official_url: edition.official_url,
      deadlines: edition.deadlines.map((deadline) => ({
        id: deadline.id,
        kind: deadline.kind,
        label: deadline.label ?? null,
        due: deadline.due,
        timezone: deadline.timezone,
        due_utc: deadline.due_utc ?? null,
        due_source: deadline.due_source,
        status: deadline.status,
        evidence: deadline.evidence,
      })),
    })),
    next: picked
      ? {
          edition_id: picked.edition.id,
          deadline_id: picked.deadline.id,
          kind: picked.deadline.kind,
          label: picked.deadline.label ?? null,
          due: picked.deadline.due,
          timezone: picked.deadline.timezone,
          due_utc: picked.deadline.due_utc ?? null,
          days_left: days,
        }
      : null,
  }));
  console.log(JSON.stringify(payload, null, 2));
} else {
  if (rows.length === 0) {
    console.log('没有匹配的会议或期刊。');
  } else {
    const header = ['VENUE', 'TYPE', 'DEADLINE', 'DAYS', 'STATE'];
    const table = rows.map(({ venue, picked, days }) => {
      const state = !picked
        ? venue.submission_model === 'rolling'
          ? 'rolling'
          : 'unknown'
        : days === null
          ? 'unknown'
          : days < 0
            ? `passed ${Math.abs(days)}d ago`
            : `in ${days}d`;
      return [
        venue.names.short,
        venue.type,
        picked ? formatLocal(picked.deadline) : '—',
        days === null ? '—' : String(days),
        state,
      ];
    });
    const widths = header.map((title, index) =>
      Math.max(title.length, ...table.map((row) => row[index].length)),
    );
    const render = (row: string[]) =>
      row.map((cell, index) => cell.padEnd(widths[index])).join('  ');
    console.log(render(header));
    console.log(widths.map((width) => '-'.repeat(width)).join('  '));
    for (const row of table) console.log(render(row));
  }
}

if (args.within !== null && !Number.isFinite(args.within)) {
  console.error('--within 需要一个数字（天）');
  process.exit(2);
}
