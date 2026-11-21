/**
 * 通用「表格 + 倒计时」Dates 页适配器。
 *
 * 适用结构：每行一个 <th>/<td> 标签、一个文本日期，以及带 UTC 的
 * data-countdown 属性（3DV 2027 使用这种结构）。
 *
 * 保守原则：只接受页面自带的机器可读时间戳，不从纯文本猜时区。
 * 输出 timezone=UTC，因此 due 与页面 countdown 的原始 UTC 一一对应。
 */
import { load } from 'cheerio';
import {
  classifyDeadline,
  deadlineKey,
  isRelevantLabel,
  type AdapterResult,
  type ExtractedDeadline,
} from './thecvf.ts';

const COUNTDOWN_RE =
  /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s*(UTC|Z|[+-]\d{4})$/i;

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** 把 "2026/08/29 11:59:59 +0000" 转成 UTC ISO，不依赖运行环境时区。 */
export function parseCountdownUtc(value: string): string | null {
  const match = COUNTDOWN_RE.exec(cleanText(value));
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const numbers = [year, month, day, hour, minute, second].map(Number);
  if (
    numbers[1] < 1 || numbers[1] > 12 ||
    numbers[2] < 1 || numbers[2] > 31 ||
    numbers[3] > 23 || numbers[4] > 59 || numbers[5] > 59
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (/^[+-]\d{4}$/.test(zone)) {
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(3, 5));
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

export function extractTableDates(html: string): AdapterResult {
  const $ = load(html);
  const deadlines: ExtractedDeadline[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let dateRows = 0;

  $('tr').each((_index, element) => {
    const row = $(element);
    const cells = row.children('th,td');
    if (cells.length < 2) return;

    const label = cleanText(cells.eq(0).text());
    const rawText = cleanText(cells.eq(1).text());
    if (!label || !rawText) return;
    dateRows += 1;
    if (!isRelevantLabel(label)) return;

    const countdown = row.find('[data-countdown]').first().attr('data-countdown');
    const dueUtc = countdown ? parseCountdownUtc(countdown) : null;
    if (!dueUtc) {
      warnings.push(`行「${label}」没有可解析的 data-countdown UTC，已跳过（不猜日期）`);
      return;
    }

    const key = deadlineKey(label);
    if (seen.has(key)) return;
    seen.add(key);
    deadlines.push({
      label,
      rawText,
      dueUtc,
      timezone: 'UTC',
      kind: classifyDeadline(label),
      key,
      dueSource: 'timestamp',
    });
  });

  return {
    status: deadlines.length > 0 ? 'ok' : dateRows > 0 ? 'no_published_dates' : 'no_dates_table',
    deadlines,
    editionDates: null,
    warnings,
  };
}
