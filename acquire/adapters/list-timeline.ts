/**
 * 通用「日期列表」时间线适配器。
 *
 * 适用结构：<ul>/<li>，每项以 `[Fri] Sep. 25, 2026: Label` 或
 * `Sep. 25, 2026, 00:59 AoE: Label` 开头；页面统一声明 23:59 AoE。
 * 划掉的旧节点默认跳过；若同一项写明 `extended to ...`，只采纳延期后的时间。
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

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

const LINE_RE =
  /^(?:\[[A-Za-z]{3,9}\]\s*)?([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AoE|UTC))?\s*:\s*(.+)$/i;
const EXTENSION_RE =
  /extended to\s+([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AoE|UTC))?/i;

interface ParsedDate {
  date: string;
  hour: number;
  minute: number;
  timezone: 'AoE' | 'UTC';
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parsedDate(
  monthName: string,
  dayText: string,
  yearText: string,
  hourText?: string,
  minuteText?: string,
  zoneText?: string,
): ParsedDate | null {
  const month = MONTHS[monthName.toLowerCase()];
  const year = Number(yearText);
  const day = Number(dayText);
  const hour = hourText ? Number(hourText) : 23;
  const minute = minuteText ? Number(minuteText) : 59;
  if (!month || year < 2000 || year > 2100 || hour > 23 || minute > 59) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    hour,
    minute,
    timezone: zoneText?.toUpperCase() === 'UTC' ? 'UTC' : 'AoE',
  };
}

function conferenceDates(pageText: string): { start: string; end: string } | null {
  const match = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/i.exec(pageText);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  const year = Number(match[4]);
  const startDay = Number(match[2]);
  const endDay = Number(match[3]);
  if (!month) return null;
  const startDate = new Date(Date.UTC(year, month - 1, startDay));
  const endDate = new Date(Date.UTC(year, month - 1, endDay));
  if (
    startDate.getUTCFullYear() !== year ||
    startDate.getUTCMonth() !== month - 1 ||
    startDate.getUTCDate() !== startDay ||
    endDate.getUTCFullYear() !== year ||
    endDate.getUTCMonth() !== month - 1 ||
    endDate.getUTCDate() !== endDay
  ) {
    return null;
  }
  return {
    start: `${year}-${pad(month)}-${pad(startDay)}`,
    end: `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

export function extractListTimeline(html: string): AdapterResult {
  const $ = load(html);
  const pageText = cleanText($.root().text());
  const declaredAoe = /all following deadlines are at 23:59 AoE/i.test(pageText);
  const deadlines: ExtractedDeadline[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let dateRows = 0;

  $('li').each((_index, element) => {
    const item = $(element);
    const rawText = cleanText(item.text());
    const line = LINE_RE.exec(rawText);
    if (!line) return;
    dateRows += 1;

    const struck = item.find('s,del').length > 0;
    const extension = EXTENSION_RE.exec(rawText);
    if (struck && !extension) {
      warnings.push(`已跳过划掉的旧节点：${rawText}`);
      return;
    }

    let parsed: ParsedDate | null;
    let label: string;
    if (extension) {
      parsed = parsedDate(extension[1], extension[2], extension[3], extension[4], extension[5], extension[6]);
      label = cleanText(line[7].replace(/\s*\(extended to[\s\S]*$/i, ''));
    } else {
      if (!declaredAoe && !line[6]) {
        warnings.push(`页面没有统一 AoE 声明，已跳过无时区节点：${rawText}`);
        return;
      }
      parsed = parsedDate(line[1], line[2], line[3], line[4], line[5], line[6]);
      label = cleanText(line[7]);
    }
    if (!parsed) {
      warnings.push(`无法解析日期，已跳过：${rawText}`);
      return;
    }
    if (!isRelevantLabel(label)) return;

    const time = `${parsed.date}T${pad(parsed.hour)}:${pad(parsed.minute)}:00`;
    const dueUtc = localToUtcIso(time, parsed.timezone);
    if (!dueUtc) {
      warnings.push(`时区换算失败，已跳过：${rawText}`);
      return;
    }
    const key = deadlineKey(label);
    if (seen.has(key)) {
      warnings.push(`与前面节点重复，已跳过后续行：${label}`);
      return;
    }
    seen.add(key);
    deadlines.push({
      label,
      rawText,
      dueUtc,
      timezone: parsed.timezone,
      kind: classifyDeadline(label),
      key,
      dueSource: 'text',
    });
  });

  return {
    status: deadlines.length > 0 ? 'ok' : dateRows > 0 ? 'no_published_dates' : 'no_dates_table',
    deadlines,
    editionDates: conferenceDates(pageText),
    warnings,
  };
}
