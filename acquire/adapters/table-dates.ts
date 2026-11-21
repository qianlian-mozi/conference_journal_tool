/**
 * 通用「表格 + 倒计时」Dates 页适配器。
 *
 * 适用结构：每行一个 <th>/<td> 标签、一个文本日期，以及带 UTC 的
 * data-countdown 属性（3DV 2027 使用这种结构）。
 *
 * 保守原则：只接受页面自带的机器可读时间戳，不从纯文本猜时区。
 * 页面明示 AoE / Pacific Time 且本地时间换算与 countdown 完全一致时，
 * 保留官网本地时区；否则才使用 countdown 本身的 UTC 钟面。
 */
import { load } from 'cheerio';
import { localToUtcIso } from '../../core/time.ts';
import {
  classifyDeadline,
  deadlineKey,
  isRelevantLabel,
  type AdapterResult,
  type ExtractedDeadline,
} from './thecvf.ts';

const COUNTDOWN_RE =
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{1,2}))?\s*(UTC|Z|[+-]\d{2}:?\d{2})$/i;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** 把 "2026/08/29 11:59:59 +0000" 转成 UTC ISO，不依赖运行环境时区。 */
export function parseCountdownUtc(value: string): string | null {
  const match = COUNTDOWN_RE.exec(cleanText(value));
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', zone] = match;
  const numbers = [year, month, day, hour, minute, second].map(Number);
  if (
    numbers[1] < 1 || numbers[1] > 12 ||
    numbers[2] < 1 || numbers[2] > 31 ||
    numbers[3] > 23 || numbers[4] > 59 || numbers[5] > 59
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (/^[+-]\d{2}:?\d{2}$/.test(zone)) {
    const compactZone = zone.replace(':', '');
    const hours = Number(compactZone.slice(1, 3));
    const minutes = Number(compactZone.slice(3, 5));
    if (hours > 23 || minutes > 59) return null;
    offsetMinutes = (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1);
  }

  const localTimestamp =
    Date.UTC(numbers[0], numbers[1] - 1, numbers[2], numbers[3], numbers[4], numbers[5]);
  const calendar = new Date(localTimestamp);
  if (
    calendar.getUTCFullYear() !== numbers[0] ||
    calendar.getUTCMonth() !== numbers[1] - 1 ||
    calendar.getUTCDate() !== numbers[2]
  ) {
    return null;
  }
  const timestamp = localTimestamp - offsetMinutes * 60_000;
  return new Date(timestamp).toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function rawDateIso(rawText: string): string | null {
  const match = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?,\s*(\d{4})/.exec(rawText);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 只有页面明确写出时区、且换算结果与 countdown 完全相同时才还原本地钟面。 */
function inferDisplayTimezone(rawText: string, dueUtc: string, pageText: string): string {
  const date = rawDateIso(rawText);
  if (!date) return 'UTC';
  const candidates = [
    { timezone: 'AoE', local: `${date}T23:59:59`, statement: /anywhere on earth/i },
    {
      timezone: 'America/Los_Angeles',
      local: `${date}T11:00:00`,
      statement: /\bPacific Time\b/i,
    },
  ];
  for (const candidate of candidates) {
    if (
      candidate.statement.test(pageText) &&
      localToUtcIso(candidate.local, candidate.timezone) === dueUtc
    ) {
      return candidate.timezone;
    }
  }
  return 'UTC';
}

function parseMainConferenceDates(rawText: string): { start: string; end: string } | null {
  const match = /([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),\s*(\d{4})/.exec(rawText);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  const year = Number(match[4]);
  const startDay = Number(match[2]);
  const endDay = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, startDay));
  const end = new Date(Date.UTC(year, month - 1, endDay));
  if (
    start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== startDay ||
    end.getUTCFullYear() !== year || end.getUTCMonth() !== month - 1 || end.getUTCDate() !== endDay ||
    end < start
  ) {
    return null;
  }
  return {
    start: `${year}-${pad(month)}-${pad(startDay)}`,
    end: `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

export function extractTableDates(html: string): AdapterResult {
  const $ = load(html);
  const deadlines: ExtractedDeadline[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const pageText = cleanText($.root().text());
  let editionDates: { start: string; end: string } | null = null;
  let dateRows = 0;

  $('tr').each((_index, element) => {
    const row = $(element);
    const cells = row.children('th,td');
    if (cells.length < 2) return;

    const label = cleanText(cells.eq(0).text());
    const rawText = cleanText(cells.eq(1).text());
    if (!label || !rawText) return;
    dateRows += 1;
    if (/^main conference$/i.test(label)) {
      editionDates = parseMainConferenceDates(rawText) ?? editionDates;
    }
    if (!isRelevantLabel(label)) return;

    const countdown = row.find('[data-countdown]').first().attr('data-countdown');
    const dueUtc = countdown ? parseCountdownUtc(countdown) : null;
    if (!dueUtc || !countdown) {
      warnings.push(`行「${label}」没有可解析的 data-countdown UTC，已跳过（不猜日期）`);
      return;
    }

    const key = deadlineKey(label);
    if (seen.has(key)) {
      warnings.push(`行「${label}」与前面节点重复，已跳过后续行`);
      return;
    }
    seen.add(key);
    const machineText = `[data-countdown="${cleanText(countdown)}"]`;
    deadlines.push({
      label,
      rawText: `${rawText} ${machineText}`,
      dueUtc,
      timezone: inferDisplayTimezone(rawText, dueUtc, pageText),
      kind: classifyDeadline(label),
      key,
      dueSource: 'timestamp',
    });
  });

  return {
    status: deadlines.length > 0 ? 'ok' : dateRows > 0 ? 'no_published_dates' : 'no_dates_table',
    deadlines,
    editionDates,
    warnings,
  };
}
