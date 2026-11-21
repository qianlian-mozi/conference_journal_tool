/**
 * thecvf 家族适配器：CVPR / ICCV / WACV 等 *.thecvf.com 会议站共用同一套模板。
 *
 * 模板特征（2026-11 实测，两种行结构并存）：
 *   <td title=""><a href='...'>Submission  Deadline</a></td><td><span>Nov 16 '26 (Anywhere on Earth)</span></td>
 *   <td title=""><span>Round 1  Paper  Submission  Deadline</span></td><td><span>Jun 26 '26 (Anywhere on Earth)</span></td>
 * 且每行后面跟一段倒计时脚本，里面藏着精确 UTC：
 *   var submission_deadline_1 = "2026/11/17 11:59:59 UTC";
 *
 * 优先级：倒计时变量的 UTC > 文本解析。文本解析的结果会标记 dueSource='text'，
 * 下游据此知道这条日期是「读出来的」而不是「页面算好的」。
 */
import type { DeadlineKind } from '../../core/schema.ts';
import { localToUtcIso, utcIsoToLocal } from '../../core/time.ts';

export interface ExtractedDeadline {
  label: string;
  rawText: string;
  dueUtc: string;
  timezone: string;
  kind: DeadlineKind;
  key: string;
  dueSource: 'timestamp' | 'text';
}

export interface AdapterResult {
  status: 'ok' | 'no_published_dates' | 'no_dates_table';
  deadlines: ExtractedDeadline[];
  editionDates: { start: string; end: string } | null;
  warnings: string[];
}

const ROW_RE_ANCHOR =
  /<td[^>]*title="[^"]*"><a[^>]*>([\s\S]*?)<\/a><\/td>\s*<td><span[^>]*>([\s\S]*?)<\/span><\/td>/g;
const ROW_RE_SPAN =
  /<td[^>]*title="[^"]*"><span[^>]*>([\s\S]*?)<\/span><\/td>\s*<td><span[^>]*>([\s\S]*?)<\/span><\/td>/g;
const VAR_RE = /var\s+(\w+)\s*=\s*"(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+UTC"/g;
const SESSION_DATES_RE = /Main Conference Sessions<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function classifyDeadline(label: string): DeadlineKind {
  const value = label.toLowerCase();
  if (value.includes('workshop')) return 'other';
  if (value.includes('abstract')) return 'abstract';
  if (value.includes('registration')) return 'registration';
  if (value.includes('supplement')) return 'supplement';
  if (value.includes('rebuttal')) return 'rebuttal';
  if (value.includes('camera')) return 'camera_ready';
  if (value.includes('decision') || value.includes('notification')) return 'notification';
  if (value.includes('submission') || value.includes('paper')) return 'paper';
  return 'other';
}

export function deadlineKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'deadline';
}

/**
 * 只收作者关心的节点。
 * 官网日期表里混着大量内部流程行（"ACs draft meta review due"）、赞助商行
 * （"SponsorApplicationClose"）和运营行（"Careers Site Opens"），它们有日期
 * 但对投稿决策没有意义，全部丢掉。
 */
export function isRelevantLabel(label: string): boolean {
  const normalized = label.replace(/\s+/g, ' ').trim();
  if (/sponsor|careers|registration open|portal|archival|program guide|author metadata|paper submission (site|server|system) (?:opens?|launch)/i.test(normalized)) {
    return false;
  }
  if (/\b(ACs?|SACs?)\b|meta-?review/i.test(normalized)) return false;
  // 主会日期表常混入卫星活动与运营节点；它们不是本会议论文的投稿节点。
  if (/affinity|child care|competition|tutorial|workshop|social|expo|educational resources|location assignment/i.test(normalized)) {
    return false;
  }
  return /abstract (deadline|registration)|paper (deadline|submission)|submission deadline|registration deadline|supplementary|reviews? released|reviews? due|author\s*-\s*reviewer discussion|author (response|rebuttal)|rebuttal period|final decisions?|notification|camera ready/i.test(
    normalized,
  );
}

function inferTimezone(rawText: string): string {
  if (/anywhere on earth/i.test(rawText)) return 'AoE';
  if (/\bUTC\b/.test(rawText)) return 'UTC';
  return 'AoE';
}

function parseSessionDates(html: string): { start: string; end: string } | null {
  const match = SESSION_DATES_RE.exec(html);
  if (!match) return null;
  const text = textOf(match[1]);
  const range = /([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),\s*(\d{4})/.exec(text);
  if (range) {
    const month = MONTHS[range[1].toLowerCase()];
    if (!month) return null;
    const year = Number(range[4]);
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      start: `${year}-${pad(month)}-${pad(Number(range[2]))}`,
      end: `${year}-${pad(month)}-${pad(Number(range[3]))}`,
    };
  }
  const single = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (single) {
    const month = MONTHS[single[1].toLowerCase()];
    if (!month) return null;
    const pad = (value: number) => String(value).padStart(2, '0');
    const iso = `${single[3]}-${pad(month)}-${pad(Number(single[2]))}`;
    return { start: iso, end: iso };
  }
  return null;
}

function toUtcIso(match: RegExpMatchArray): string {
  const [, , year, month, day, hour, minute, second] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  ).toISOString();
}

/**
 * 文本兜底：页面没给倒计时变量时，从 "Nov 16 '26 (Anywhere on Earth)" 解析。
 * 没有具体时刻的，按该时区当日 23:59:59 处理（AoE 的惯例）。
 */
export function parseRawTextDate(rawText: string, timezone: string): string | null {
  const match =
    /([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+'?(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?/i.exec(
      rawText,
    );
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;

  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  let hour = 23;
  let minute = 59;
  let second = 59;
  if (match[4]) {
    hour = Number(match[4]);
    minute = Number(match[5]);
    second = 0;
    const meridiem = match[6]?.toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  const local = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  return localToUtcIso(local, timezone);
}

function collectRows(html: string): Array<{ label: string; rawText: string }> {
  const rows: Array<{ label: string; rawText: string }> = [];
  for (const match of html.matchAll(ROW_RE_ANCHOR)) {
    rows.push({ label: textOf(match[1]), rawText: textOf(match[2]) });
  }
  for (const match of html.matchAll(ROW_RE_SPAN)) {
    rows.push({ label: textOf(match[1]), rawText: textOf(match[2]) });
  }
  return rows;
}

export function extractTheCvf(html: string): AdapterResult {
  const warnings: string[] = [];

  const utcByKey = new Map<string, string>();
  for (const match of html.matchAll(VAR_RE)) {
    utcByKey.set(match[1], toUtcIso(match));
  }

  const deadlines: ExtractedDeadline[] = [];
  const seen = new Set<string>();

  for (const { label, rawText } of collectRows(html)) {
    if (!label || !rawText) continue;
    if (!isRelevantLabel(label)) continue;
    const key = deadlineKey(label);
    if (seen.has(key)) continue;

    const timezone = inferTimezone(rawText);
    const wanted = compact(label);
    const candidates = [...utcByKey.entries()]
      .filter(([name]) => compact(name).includes(wanted) || wanted.includes(compact(name)))
      .sort((a, b) => a[0].length - b[0].length);

    let dueUtc: string | null = null;
    let dueSource: 'timestamp' | 'text' = 'timestamp';

    if (candidates.length > 0) {
      dueUtc = candidates[0][1];
      if (candidates.length > 1) {
        warnings.push(`行「${label}」匹配到多个倒计时变量，取最短的 ${candidates[0][0]}`);
      }
    } else {
      dueUtc = parseRawTextDate(rawText, timezone);
      dueSource = 'text';
      if (!dueUtc) {
        warnings.push(`行「${label}」既没有倒计时变量也无法解析文本，已跳过（不猜日期）`);
        continue;
      }
      warnings.push(`行「${label}」没有倒计时变量，已从文本解析（dueSource=text）`);
    }

    const due = utcIsoToLocal(dueUtc, timezone);
    if (!due) {
      warnings.push(`行「${label}」的时间无法换算到 ${timezone}，已跳过`);
      continue;
    }

    seen.add(key);
    deadlines.push({
      label,
      rawText,
      dueUtc,
      timezone,
      kind: classifyDeadline(label),
      key,
      dueSource,
    });
  }

  const editionDates = parseSessionDates(html);

  if (deadlines.length === 0) {
    return {
      status:
        utcByKey.size === 0 && !/Dates and Deadlines/i.test(html)
          ? 'no_dates_table'
          : 'no_published_dates',
      deadlines: [],
      editionDates,
      warnings,
    };
  }

  return { status: 'ok', deadlines, editionDates, warnings };
}
