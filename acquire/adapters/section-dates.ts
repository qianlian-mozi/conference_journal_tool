/**
 * 分区文本日期适配器：只接收明确写在主会区块内、且行内显式标注 AoE 的日期。
 * 没有时区的日期一律跳过并告警；不根据会议惯例猜 23:59 或时区。
 */
import { htmlToText } from '../snapshot.ts';
import { localToUtcIso } from '../../core/time.ts';
import {
  classifyDeadline,
  deadlineKey,
  isRelevantLabel,
  type AdapterResult,
  type ExtractedDeadline,
} from './thecvf.ts';
import { parseMainConferenceDates, rawDateIso } from './table-dates.ts';

const SECTION_END = /^(?:competition proposal|doctorial consortium|doctoral consortium|tutorial proposal|workshop proposal|last modified)\b/i;
const EXPLICIT_AOE = /\b(?:AoE|anywhere on earth)\b/i;

export function extractSectionDates(html: string): AdapterResult {
  const pageText = htmlToText(html);
  const lines = pageText.split('\n').map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => /^main conference$/i.test(line));
  const editionDates = parseMainConferenceDates(pageText);
  if (start < 0) {
    return { status: 'no_dates_table', deadlines: [], editionDates, warnings: ['未找到 Main conference 日期区块'] };
  }

  const section: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (SECTION_END.test(lines[index])) break;
    section.push(lines[index]);
  }

  const deadlines: ExtractedDeadline[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const line of section) {
    const match = /^(.+?)\s*:\s*(.+)$/.exec(line);
    if (!match) continue;
    const label = match[1].trim();
    const rawValue = match[2].trim();
    if (!isRelevantLabel(label)) continue;
    if (!EXPLICIT_AOE.test(rawValue)) {
      warnings.push(`主会节点「${label}」没有行内显式 AoE，已跳过（不猜时区）`);
      continue;
    }
    const date = rawDateIso(rawValue);
    const dueUtc = date ? localToUtcIso(`${date}T23:59:59`, 'AoE') : null;
    if (!dueUtc) {
      warnings.push(`主会节点「${label}」的日期无法解析，已跳过（不猜日期）`);
      continue;
    }
    const key = deadlineKey(label);
    if (seen.has(key)) {
      warnings.push(`主会节点「${label}」与前面节点重复，已跳过后续行`);
      continue;
    }
    seen.add(key);
    deadlines.push({
      label,
      rawText: line,
      dueUtc,
      timezone: 'AoE',
      kind: classifyDeadline(label),
      key,
      dueSource: 'text',
    });
  }

  return {
    status: deadlines.length > 0 ? 'ok' : 'no_published_dates',
    deadlines,
    editionDates,
    warnings,
  };
}
