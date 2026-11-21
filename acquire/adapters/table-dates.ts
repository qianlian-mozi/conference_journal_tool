/**
 * 通用「表格 + 倒计时 / 明示时区文本」Dates 页适配器。
 *
 * 适用结构：原生 <tr>/<th>/<td> 或 ARIA role=table/row/cell；每行一个标签、
 * 一个文本日期，可带 UTC data-countdown 属性（3DV、ICIP 使用这些结构）。
 *
 * 保守原则：优先接受页面自带的机器可读时间戳；没有 countdown 时，只接受
 * 页面统一明示为 23:59 AoE 的纯文本日期。timestamp 场景下，页面明示
 * AoE / Pacific Time 且本地时间换算与 countdown 完全一致时，保留官网本地时区。
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

function calendarDateIso(year: number, month: number, day: number): string | null {
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

export function rawDateIso(rawText: string): string | null {
  const text = cleanText(rawText);
  const monthFirst = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?,\s*(\d{4})/.exec(text);
  if (monthFirst) {
    return calendarDateIso(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
  }
  const dayFirst = /(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text);
  if (!dayFirst) return null;
  return calendarDateIso(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
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

export function parseMainConferenceDates(rawText: string): { start: string; end: string } | null {
  const text = cleanText(rawText);
  const sameMonth = /([A-Za-z]{3,9})\.?,?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),\s*(\d{4})/.exec(text);
  if (sameMonth) {
    const year = Number(sameMonth[4]);
    const month = MONTHS[sameMonth[1].toLowerCase()];
    const start = calendarDateIso(year, month, Number(sameMonth[2]));
    const end = calendarDateIso(year, month, Number(sameMonth[3]));
    return start && end && end >= start ? { start, end } : null;
  }

  const dayFirst = /(\d{1,2})\s+([A-Za-z]{3,9})\.?\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})/.exec(text);
  if (!dayFirst) return null;
  const year = Number(dayFirst[5]);
  const start = calendarDateIso(year, MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
  const end = calendarDateIso(year, MONTHS[dayFirst[4].toLowerCase()], Number(dayFirst[3]));
  return start && end && end >= start ? { start, end } : null;
}

function parseExplicitAoeDate(rawText: string, pageText: string): string | null {
  const fullDate = /^(?:[A-Za-z]{3,9}\.?\s+\d{1,2},\s*\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{4})$/;
  if (!fullDate.test(cleanText(rawText))) return null;
  if (!/\ball deadlines\b.{0,80}\b23:59\b.{0,80}\b(?:anywhere on earth|AoE)\b/i.test(pageText)) {
    return null;
  }
  const date = rawDateIso(rawText);
  return date ? localToUtcIso(`${date}T23:59:59`, 'AoE') : null;
}

export function extractTableDates(html: string): AdapterResult {
  const $ = load(html);
  const deadlines: ExtractedDeadline[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const pageText = cleanText($.root().text());
  let editionDates: { start: string; end: string } | null = null;
  let dateRows = 0;

  $('tr, [role="row"]').each((_index, element) => {
    const row = $(element);
    const cells = element.tagName.toLowerCase() === 'tr'
      ? row.children('th,td')
      : row.children('[role="cell"],[role="columnheader"]');
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
    let dueUtc: string | null = null;
    let timezone = 'UTC';
    let dueSource: ExtractedDeadline['dueSource'] = 'timestamp';
    let evidenceText = rawText;

    if (countdown) {
      dueUtc = parseCountdownUtc(countdown);
      if (!dueUtc) {
        warnings.push(`行「${label}」的 data-countdown 无法解析，已跳过（不猜日期）`);
        return;
      }
      timezone = inferDisplayTimezone(rawText, dueUtc, pageText);
      evidenceText = `${rawText} [data-countdown="${cleanText(countdown)}"]`;
    } else {
      dueUtc = parseExplicitAoeDate(rawText, pageText);
      if (!dueUtc) {
        warnings.push(`行「${label}」没有可解析时间戳，也不符合页面明示的 23:59 AoE 文本日期，已跳过（不猜日期）`);
        return;
      }
      timezone = 'AoE';
      dueSource = 'text';
    }

    const key = deadlineKey(label);
    if (seen.has(key)) {
      warnings.push(`行「${label}」与前面节点重复，已跳过后续行`);
      return;
    }
    seen.add(key);
    deadlines.push({
      label,
      rawText: evidenceText,
      dueUtc,
      timezone,
      kind: classifyDeadline(label),
      key,
      dueSource,
    });
  });

  if (!editionDates) {
    const statement = /(?:takes place|conference dates?)\b.{0,180}/i.exec(pageText);
    if (statement) editionDates = parseMainConferenceDates(statement[0]);
  }

  return {
    status: deadlines.length > 0 ? 'ok' : dateRows > 0 ? 'no_published_dates' : 'no_dates_table',
    deadlines,
    editionDates,
    warnings,
  };
}
