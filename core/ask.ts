/**
 * 自然语言 → 结构化筛选（M5-A 的确定性基线）。
 *
 * 这里不调用模型：只把一小组合法问法编译成 QueryOptions，再由 queryVenues
 * 执行并返回原始数据。无法识别的问法必须明确说“不支持”，不能猜日期或编造
 * venue。将来接 LLM 时，模型也只负责产出同一种 AskPlan，执行层保持不变。
 */
import type { Venue } from './schema.ts';
import type { QueryOptions, VenueRow } from './query.ts';
import { latestEdition, queryVenues } from './query.ts';

export type VenueState = 'open' | 'soon' | 'passed' | 'rolling' | 'unknown';

export interface AskFilters extends QueryOptions {
  qualification?: { system: string; level: string };
  states?: VenueState[];
}

export interface AskPlan {
  query: string;
  understood: boolean;
  filters: AskFilters;
  explanation: string[];
  unsupported?: string;
  unrecognizedVenue?: string;
  venueYear?: number;
}

export interface AskResult {
  plan: AskPlan;
  rows: VenueRow[];
  notes: string[];
}

const CN_NUMBERS: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const UNIT_DAYS: Record<string, number> = {
  天: 1,
  日: 1,
  周: 7,
  星期: 7,
  月: 30,
  年: 365,
};

function cnNumber(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '半') return 0.5;
  if (raw.length === 1) return CN_NUMBERS[raw] ?? null;
  if (raw === '十一') return 11;
  if (raw === '十二') return 12;
  if (/^十[一二三四五六七八九]$/.test(raw)) return 10 + (CN_NUMBERS[raw.at(-1)!] ?? 0);
  return null;
}

function tokenPattern(token: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
}

function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findVenue(text: string, venues: Venue[]): Venue | null {
  // 先比 id / 简称，再比全称，避免全称里的普通词误伤简称。
  for (const venue of venues) {
    if (tokenPattern(venue.id).test(text) || tokenPattern(venue.names.short).test(text)) return venue;
  }
  for (const venue of venues) {
    if (text.includes(venue.names.full.toLowerCase())) return venue;
  }
  return null;
}

function extractWithinDays(text: string): number | null {
  if (/半年/.test(text)) return 182;
  if (/\bhalf a year\b/.test(text)) return 182;

  const english = text.match(/\b(?:within|in|next)\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b/);
  if (english) {
    const amount = Number(english[1]);
    const unit = english[2].startsWith('day')
      ? 1
      : english[2].startsWith('week')
        ? 7
        : english[2].startsWith('month')
          ? 30
          : 365;
    return amount * unit;
  }

  const chinese = text.match(/(?:未来|接下来|今后)?\s*([一二两三四五六七八九十\d]+)\s*个?\s*(天|日|周|星期|月|年)\s*(?:内|以内|之内)?/);
  if (chinese) {
    const amount = cnNumber(chinese[1]);
    if (amount === null) return null;
    return Math.round(amount * UNIT_DAYS[chinese[2]]);
  }
  if (/本周|这周|this week/.test(text)) return 7;
  return null;
}

function extractQualification(text: string): { system: string; level: string } | null {
  const ccf = text.match(/\bccf[\s-]*([abc])(?![a-z])/i);
  if (ccf) return { system: 'ccf', level: ccf[1].toUpperCase() };
  const core = text.match(/\bcore[\s-]*(a\*?|b|c)(?![a-z])/i);
  if (core) return { system: 'core', level: core[1].toUpperCase() };
  return null;
}

function extractYear(text: string): number | null {
  const match = text.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 2000 && year <= 2100 ? year : null;
}

const UNSUPPORTED =
  /帮我(?:选|挑)|论文匹配|哪(?:本|个)(?:期刊|会议)好|投稿建议|match my paper|recommend (?:a )?(?:venue|journal)/i;

export function parseAskQuestion(question: string, venues: Venue[]): AskPlan {
  const query = question.trim();
  const text = normalize(query);
  const filters: AskFilters = {};
  const explanation: string[] = [];

  if (!text) {
    return { query, understood: false, filters, explanation, unsupported: '问题为空。' };
  }

  if (UNSUPPORTED.test(text)) {
    return {
      query,
      understood: false,
      filters,
      explanation,
      unsupported:
        '当前只支持按截止时间、类型、滚动投稿与资质筛选；论文与 venue 的匹配/推荐尚未实现，不能据此编造建议。',
    };
  }

  const venue = findVenue(text, venues);
  const year = extractYear(text);
  if (venue) {
    filters.venueId = venue.id;
    explanation.push(`venue：${venue.names.short}（${venue.id}）`);
    if (year !== null) {
      const latest = latestEdition(venue);
      if (!latest || latest.year !== year) {
        return {
          query,
          understood: true,
          filters,
          explanation,
          venueYear: year,
          unsupported: `${venue.names.short} 未收录 ${year} 届；当前只有 ${latest ? `${latest.year} 届` : '刊物资讯，没有届次'}。`,
        };
      }
      explanation.push(`届次：${year}`);
    }
  } else if (/什么时候|何时|deadline/.test(text)) {
    const match = text.match(/^(.{1,40}?)(?:\s*)(?:什么时候|何时|deadline|截止)/);
    const candidate = match?.[1]?.trim();
    if (candidate && !/^(?:会议|期刊|这个|那个|它们?|the|a|an)$/i.test(candidate)) {
      return {
        query,
        understood: false,
        filters,
        explanation,
        unrecognizedVenue: candidate,
        unsupported: `未收录「${candidate}」，无法给出它的截止日期。`,
      };
    }
  }

  const wantsJournal = /期刊|journal/.test(text);
  const wantsConference = /会议|conference/.test(text);
  if (wantsJournal && wantsConference) {
    return {
      query,
      understood: false,
      filters,
      explanation,
      unsupported: '一次只能筛选会议或期刊，不能同时指定两种类型。',
    };
  }
  if (wantsJournal) {
    filters.type = 'journal';
    explanation.push('类型：期刊');
  } else if (wantsConference) {
    filters.type = 'conference';
    explanation.push('类型：会议');
  }

  if (/随时投|随时可以投|滚动|rolling|no deadline|ongoing/.test(text)) {
    filters.submissionModel = 'rolling';
    explanation.push('投稿模式：rolling（无固定截止）');
  }

  const withinDays = extractWithinDays(text);
  if (withinDays !== null) {
    if (!Number.isFinite(withinDays) || withinDays <= 0 || withinDays > 3650) {
      return { query, understood: false, filters, explanation, unsupported: '时间窗必须在 1–3650 天之间。' };
    }
    filters.withinDays = withinDays;
    explanation.push(`时间窗：未来 ${withinDays} 天内`);
  }

  if (/已经截止|已截止|截止了|过期|passed|closed/.test(text)) {
    filters.states = ['passed'];
    explanation.push('状态：已截止');
  } else if (/即将截止|快截止|临期|soon/.test(text)) {
    filters.states = ['soon'];
    explanation.push('状态：14 天内截止');
  } else if (/还能投|可投|未截止|仍可|open|accepting|still.{0,12}submit/.test(text)) {
    filters.openOnly = true;
    explanation.push('状态：仍可投');
  }

  const qualification = extractQualification(text);
  if (qualification) {
    filters.qualification = qualification;
    explanation.push(`资质：${qualification.system.toUpperCase()} ${qualification.level}`);
  }

  const hasFilter =
    Boolean(filters.venueId) ||
    Boolean(filters.type) ||
    Boolean(filters.submissionModel) ||
    filters.withinDays !== undefined ||
    Boolean(filters.states?.length) ||
    Boolean(filters.openOnly) ||
    Boolean(filters.qualification);

  if (!hasFilter) {
    return {
      query,
      understood: false,
      filters,
      explanation,
      unsupported:
        '没有识别出可执行的筛选条件。可以说“未来三个月还能投的会议”“随时可以投的期刊”或“CVPR 什么时候截止”。',
    };
  }

  return { query, understood: true, filters, explanation };
}

export function askVenues(venues: Venue[], question: string, now = Date.now()): AskResult {
  const plan = parseAskQuestion(question, venues);
  const notes: string[] = [];

  if (!plan.understood) {
    return { plan, rows: [], notes };
  }

  let rows = queryVenues(venues, plan.filters, now);

  if (plan.filters.qualification) {
    const qualified = venues.filter((venue) =>
      venue.qualifications.some(
        (item) =>
          item.system.toLowerCase() === plan.filters.qualification!.system.toLowerCase() &&
          item.level.toUpperCase() === plan.filters.qualification!.level.toUpperCase(),
      ),
    );
    if (qualified.length === 0) {
      notes.push('当前收录的 venue 都没有对应的 CCF/CORE 资质数据，因此无法用资质筛选；这不代表没有符合条件的会议。');
    }
  }

  if (plan.venueYear !== undefined) {
    rows = rows.filter((row) => row.edition?.year === plan.venueYear);
  }

  if (rows.length === 0 && notes.length === 0 && !plan.unsupported) {
    notes.push('没有符合筛选条件的记录。');
  }

  return { plan, rows, notes };
}

export function askJson(result: AskResult) {
  return {
    query: result.plan.query,
    understood: result.plan.understood,
    filters: result.plan.filters,
    explanation: result.plan.explanation,
    unsupported: result.plan.unsupported ?? null,
    notes: result.notes,
    count: result.rows.length,
  };
}
