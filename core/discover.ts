/**
 * Venue 发现：从领域候选清单里找「还没收录」的会议/期刊，并生成接入命令。
 *
 * 这里刻意不做网页搜索抓取：
 * - 搜索结果受搜索引擎反爬、地区、登录墙影响，无法稳定复现；
 * - 候选必须由人确认官网，不能自动写进数据。
 *
 * 候选清单是仓库里可 review 的 YAML；`discover` 只负责匹配、去重、给出下一步。
 */
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { slugId } from './schema.ts';
import type { SourceAdapter, SourceCadence, SubmissionModel, VenueType } from './add-venue.ts';

const HttpsUrl = z.string().refine((value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, '必须是合法的 https URL');

export const DiscoveryCandidateSchema = z
  .object({
    id: slugId,
    names: z.object({
      short: z.string().trim().min(1),
      full: z.string().trim().min(1),
    }),
    type: z.enum(['conference', 'journal']),
    official_url: HttpsUrl,
    publisher: z.string().trim().min(1).optional(),
    /** 已确认的当届 Dates / CFP 页；没有就只登记官网，等人工补。 */
    source_url: HttpsUrl.optional(),
    submission_model: z.enum(['fixed', 'rolling']).optional(),
    adapter: z.enum(['thecvf', 'table-dates', 'section-dates', 'siggraph-widget', 'manual']).optional(),
    cadence: z.enum(['daily', 'weekly', 'monthly', 'manual']).optional(),
    aliases: z.array(z.string().trim().min(1)).default([]),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

const CandidatesSchema = z.array(DiscoveryCandidateSchema).superRefine((items, ctx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `候选 id 重复：${item.id}`,
        path: [index, 'id'],
      });
    }
    seen.add(item.id);
  });
});

export const DiscoveryCatalogSchema = z
  .object({
    schema_version: z.literal(2),
    field_id: slugId,
    candidates: CandidatesSchema,
  })
  .strict();

export type DiscoveryCandidate = z.infer<typeof DiscoveryCandidateSchema>;
export type DiscoveryCatalog = z.infer<typeof DiscoveryCatalogSchema>;

export interface DiscoveryMatch {
  candidate: DiscoveryCandidate;
  registered: boolean;
  addCommand: string | null;
}

export interface MatchOptions {
  query?: string;
  type?: VenueType;
  includeRegistered?: boolean;
  limit?: number;
}

export function parseDiscoveryCatalog(raw: string): DiscoveryCatalog {
  const parsed = parseYaml(raw);
  return DiscoveryCatalogSchema.parse(parsed);
}

function searchableText(candidate: DiscoveryCandidate): string {
  return [candidate.id, candidate.names.short, candidate.names.full, ...candidate.aliases]
    .join(' ')
    .toLowerCase();
}

function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function matchCandidates(
  catalog: DiscoveryCatalog,
  registeredIds: ReadonlySet<string>,
  options: MatchOptions = {},
): DiscoveryMatch[] {
  const tokens = tokensOf(options.query ?? '');
  const limit = options.limit ?? 20;

  return catalog.candidates
    .filter((candidate) => (options.type ? candidate.type === options.type : true))
    .filter((candidate) => {
      const haystack = searchableText(candidate);
      return tokens.every((token) => haystack.includes(token));
    })
    .map((candidate) => {
      const registered = registeredIds.has(candidate.id);
      return {
        candidate,
        registered,
        addCommand: registered ? null : buildAddVenueCommand(candidate, catalog.field_id),
      };
    })
    .filter((match) => options.includeRegistered || !match.registered)
    .slice(0, limit);
}

/**
 * 只有确认了当届信源页的会议才能直接生成 add-venue 命令；
 * rolling 期刊没有「当届」概念，官网入口本身就是信源。
 */
export function buildAddVenueCommand(
  candidate: DiscoveryCandidate,
  fieldId = 'computer-vision',
): string | null {
  const sourceUrl =
    candidate.source_url ?? (candidate.type === 'journal' ? candidate.official_url : null);
  if (!sourceUrl) return null;

  const flags = [
    '--write',
    quote(sourceUrl),
    '--id',
    candidate.id,
    '--short',
    quote(candidate.names.short),
    '--full',
    quote(candidate.names.full),
    '--type',
    candidate.type,
    '--field',
    fieldId,
  ];

  if (candidate.publisher) flags.push('--publisher', quote(candidate.publisher));
  if (candidate.official_url !== sourceUrl) {
    flags.push('--official-url', quote(candidate.official_url));
  }
  if (candidate.submission_model) flags.push('--model', candidate.submission_model);
  if (candidate.adapter) flags.push('--adapter', candidate.adapter);
  if (candidate.cadence) flags.push('--cadence', candidate.cadence);

  return `npm run add-venue -- ${flags.join(' ')}`;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function isSourceAdapter(value: string): value is SourceAdapter {
  return value === 'thecvf' || value === 'table-dates' || value === 'section-dates' || value === 'manual';
}

export function isSourceCadence(value: string): value is SourceCadence {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'manual';
}

export function isSubmissionModel(value: string): value is SubmissionModel {
  return value === 'fixed' || value === 'rolling';
}
