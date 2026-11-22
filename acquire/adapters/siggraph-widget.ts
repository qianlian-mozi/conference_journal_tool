/**
 * SIGGRAPH 当届站的 submission-deadlines widget。
 *
 * 只读取隐藏机器字段 formatted-original-time 与 original-time；可见卡片仍写 TBA 时，
 * 也必须以 Technical Papers 专页的这两个字段为准。字段缺失、偏移非 UTC 或两者不一致
 * 都跳过并告警，绝不从“22:00 GMT”等模糊文本补时间。
 */
import * as cheerio from 'cheerio';
import { htmlToText } from '../snapshot.ts';
import type { AdapterResult, ExtractedDeadline } from './thecvf.ts';
import { classifyDeadline, deadlineKey, isRelevantLabel } from './thecvf.ts';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

interface ParsedWidgetTime {
  dueUtc: string;
  local: string;
  rawText: string;
}

function validDateParts(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** 同时校验带偏移的格式化时间和不带偏移的原始本地钟面。 */
export function parseSiggraphWidgetTime(original: string, formatted: string): ParsedWidgetTime | null {
  const originalMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(original.trim());
  const formattedMatch = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+\+00:00$/.exec(formatted.trim());
  if (!originalMatch || !formattedMatch) return null;

  const originalYear = Number(originalMatch[1]);
  const originalMonth = Number(originalMatch[2]);
  const originalDay = Number(originalMatch[3]);
  const originalHour = Number(originalMatch[4]);
  const originalMinute = Number(originalMatch[5]);
  const originalSecond = Number(originalMatch[6] ?? '0');
  const month = MONTHS[formattedMatch[2].toLowerCase()];
  const year = Number(formattedMatch[3]);
  const day = Number(formattedMatch[1]);
  const hour = Number(formattedMatch[4]);
  const minute = Number(formattedMatch[5]);
  const second = Number(formattedMatch[6] ?? '0');
  if (!month || originalMonth !== month || originalYear !== year || originalDay !== day ||
      originalHour !== hour || originalMinute !== minute || originalSecond !== second ||
      !validDateParts(year, month, day, hour, minute, second)) return null;

  const local = `${originalMatch[1]}-${originalMatch[2]}-${originalMatch[3]}T${originalMatch[4]}:${originalMatch[5]}:${String(originalSecond).padStart(2, '0')}`;
  return {
    dueUtc: new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString(),
    local,
    rawText: `${formatted.trim()} ${original.trim()}`,
  };
}

function conferenceDates(html: string): { start: string; end: string } | null {
  const match = /\bConference\s*[–—-]\s*(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i.exec(htmlToText(html));
  if (!match) return null;
  const month = MONTHS[match[3].toLowerCase()];
  const year = Number(match[4]);
  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  if (!month || !validDateParts(year, month, startDay, 0, 0, 0) || !validDateParts(year, month, endDay, 0, 0, 0)) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    start: `${year}-${pad(month)}-${pad(startDay)}`,
    end: `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

export function extractSiggraphWidget(html: string): AdapterResult {
  const $ = cheerio.load(html);
  const entries = $('.widget-submission-deadlines .widget-entry').toArray();
  const deadlines: ExtractedDeadline[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const row = $(entry);
    const label = row.find('h4').first().text().replace(/\s+/g, ' ').trim();
    if (!label || !isRelevantLabel(label)) continue;
    const original = row.find('.original-time').first().text().replace(/\s+/g, ' ').trim();
    const formatted = row.find('.formatted-original-time').first().text().replace(/\s+/g, ' ').trim();
    const parsed = parseSiggraphWidgetTime(original, formatted);
    if (!parsed) {
      warnings.push(`已跳过（缺少一致的 UTC 机器时间）：${label}`);
      continue;
    }
    const key = deadlineKey(label);
    if (seen.has(key)) {
      warnings.push(`已跳过重复节点：${label}`);
      continue;
    }
    seen.add(key);
    deadlines.push({
      label,
      rawText: parsed.rawText,
      dueUtc: parsed.dueUtc,
      timezone: 'UTC',
      kind: classifyDeadline(label),
      key,
      dueSource: 'timestamp',
    });
  }

  return {
    status: entries.length === 0 ? 'no_dates_table' : deadlines.length > 0 ? 'ok' : 'no_published_dates',
    deadlines,
    editionDates: conferenceDates(html),
    warnings,
  };
}
