/**
 * 新 venue 接入：从官网入口生成最小、可校验的 data/venues YAML 与源登记。
 *
 * 这个模块刻意不抓页面、不生成日期。接入只负责「骨架 + 信源」，
 * 真实 deadline 仍必须由 cmd/update.ts 抓取，并通过 quote 闸门。
 */
import { parse as parseYaml, stringify } from 'yaml';
import { normalizeHttpsUrl } from './net-safety.ts';
import {
  SourceEntrySchema,
  SourceRegistrySchema,
  VenueSchema,
  slugId,
  type SourceEntry,
  type Venue,
} from './schema.ts';

export { normalizeHttpsUrl };

export type VenueType = 'conference' | 'journal';
export type SubmissionModel = 'fixed' | 'rolling';
export type SourceAdapter = 'thecvf' | 'table-dates' | 'section-dates' | 'siggraph-widget' | 'manual';
export type SourceCadence = 'daily' | 'weekly' | 'monthly' | 'manual';

export interface AddVenueInput {
  id: string;
  short: string;
  full: string;
  type: VenueType;
  fieldId: string;
  /** 用于登记到 sources/registry.yaml 的页面；固定会议通常是 dates 页。 */
  sourceUrl: string;
  officialUrl?: string;
  publisher?: string;
  submissionModel?: SubmissionModel;
  adapter?: SourceAdapter;
  cadence?: SourceCadence;
}

export interface AddVenuePlan {
  venue: Venue;
  source: SourceEntry;
  venueYaml: string;
  registryYaml: string;
  warnings: string[];
}

const IGNORED_HOST_LABELS = new Set([
  'www',
  'www2',
  'w3',
  'web',
  'home',
  'portal',
  'conference',
  'conferences',
]);

/** 从官网域名猜一个 slug；失败时由调用方要求显式 --id。 */
export function inferVenueId(rawUrl: string): string | null {
  let host: string;
  try {
    host = new URL(normalizeHttpsUrl(rawUrl)).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = host.split('.').filter(Boolean);
  const candidate = labels.find((label) => !IGNORED_HOST_LABELS.has(label));
  if (!candidate) return null;
  const slug = candidate
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slugId.safeParse(slug).success ? slug : null;
}

export function inferAdapter(rawUrl: string): SourceAdapter {
  const host = new URL(normalizeHttpsUrl(rawUrl)).hostname.toLowerCase();
  if (host === 'thecvf.com' || host.endsWith('.thecvf.com')) return 'thecvf';
  if (host === 'icpr2026.org' || host.endsWith('.icpr2026.org')) return 'section-dates';
  if (/^s\d{4}\.siggraph\.org$/.test(host)) return 'siggraph-widget';
  if (host === '3dvconf.github.io' || host === 'ieeeicip.org' || host.endsWith('.ieeeicip.org')) {
    return 'table-dates';
  }
  return 'manual';
}

function buildSource(
  input: AddVenueInput,
  sourceUrl: string,
  model: SubmissionModel,
  adapter: SourceAdapter,
  cadence: SourceCadence,
): SourceEntry {
  return SourceEntrySchema.parse({
    venue_id: input.id,
    adapter,
    cadence,
    pages: [{ role: model === 'rolling' ? 'home' : 'dates', url: sourceUrl }],
    cross_check: [],
  });
}

export function buildVenuePlan(input: AddVenueInput, existingRegistryYaml: string): AddVenuePlan {
  const id = input.id.trim();
  if (!slugId.safeParse(id).success) {
    throw new Error('venue id 只允许小写字母、数字和连字符');
  }
  if (!input.fieldId.trim() || !slugId.safeParse(input.fieldId.trim()).success) {
    throw new Error('field id 不合法');
  }
  const short = input.short.trim();
  const full = input.full.trim();
  if (!short) throw new Error('names.short 不能为空');
  if (!full) throw new Error('names.full 不能为空');

  const sourceUrl = normalizeHttpsUrl(input.sourceUrl);
  const model = input.submissionModel ?? (input.type === 'journal' ? 'rolling' : 'fixed');
  const officialUrl = input.officialUrl
    ? normalizeHttpsUrl(input.officialUrl)
    : input.type === 'journal'
      ? sourceUrl
      : `${new URL(sourceUrl).origin}/`;
  const adapter = input.adapter ?? inferAdapter(sourceUrl);
  const cadence = input.cadence ?? (input.type === 'journal' ? 'manual' : 'weekly');

  const venue = VenueSchema.parse({
    schema_version: 2,
    id,
    type: input.type,
    names: { short, full },
    field_ids: [input.fieldId.trim()],
    official_url: officialUrl,
    ...(input.publisher?.trim() ? { publisher: input.publisher.trim() } : {}),
    submission_model: model,
    qualifications: [],
    editions: [],
  });
  const source = buildSource(input, sourceUrl, model, adapter, cadence);

  const warnings: string[] = [];
  if (input.type === 'conference' && model === 'rolling') {
    warnings.push('会议被设为 rolling：请确认它不是固定投稿周期。');
  }
  if (model === 'fixed' && adapter === 'manual') {
    warnings.push('固定投稿的 venue 使用 manual adapter，update 不会自动抽取；请补适配器或手工数据。');
  }
  if (adapter === 'thecvf' && !new URL(sourceUrl).pathname.includes('/Conferences/')) {
    warnings.push('thecvf 适配器通常需要 /Conferences/<year>/Dates 形式的页面。');
  }

  return {
    venue,
    source,
    venueYaml: stringify(venue, { lineWidth: 0 }),
    registryYaml: appendSourceRegistry(existingRegistryYaml, source),
    warnings,
  };
}

function formatSourceBlock(source: SourceEntry, indent: number, eol: string): string {
  const pad = ' '.repeat(indent);
  const fieldPad = ' '.repeat(indent + 2);
  return stringify(source, { lineWidth: 0 })
    .trimEnd()
    .split('\n')
    .map((line, index) => (index === 0 ? `${pad}- ${line}` : `${fieldPad}${line}`))
    .join(eol);
}

/** 保留已有注释和格式，在 sources 列表末尾追加一条登记。 */
export function appendSourceRegistry(existingYaml: string, source: SourceEntry): string {
  const parsedExisting = SourceRegistrySchema.parse(parseYaml(existingYaml));
  if (parsedExisting.sources.some((entry) => entry.venue_id === source.venue_id)) {
    throw new Error(`sources/registry.yaml 已有 ${source.venue_id} 的登记`);
  }

  const eol = existingYaml.includes('\r\n') ? '\r\n' : '\n';
  let base: string;
  let indent = 2;
  if (parsedExisting.sources.length === 0) {
    const emptySources = /^sources:[ \t]*\[\s*\][ \t]*\r?(#.*?)\r?$/m;
    const match = emptySources.exec(existingYaml);
    if (!match) {
      throw new Error('sources/registry.yaml 的 sources 字段不是空列表，无法安全追加');
    }
    const comment = match[1] ? `  ${match[1]}` : '';
    base = existingYaml.replace(emptySources, `sources:${comment}`).trimEnd();
  } else {
    const firstItem = /^sources:[^\n]*\n(?:[ \t]*(?:#.*)?\n)*([ \t]*)-[ \t]/m.exec(
      existingYaml,
    );
    if (!firstItem) {
      throw new Error('sources/registry.yaml 使用了不支持的流式写法，请改为块状列表');
    }
    indent = firstItem[1].length;
    base = existingYaml.trimEnd();
  }

  const block = formatSourceBlock(source, indent, eol);
  const separator = parsedExisting.sources.length === 0 ? eol : `${eol}${eol}`;
  const next = `${base}${separator}${block}${eol}`;
  const parsedNext = SourceRegistrySchema.parse(parseYaml(next));
  if (parsedNext.sources.length !== parsedExisting.sources.length + 1) {
    throw new Error('追加源登记后条目数不正确');
  }
  return next;
}
