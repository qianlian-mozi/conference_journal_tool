/**
 * 把 data/ 下的 YAML 聚合成前端可直接 import 的 JSON。
 *
 * - 数据源是给人改的 YAML；浏览器只读构建期生成的 JSON。
 * - 一个 venue 可属于多个 pack；pack 只保存 venue id，不复制日期与证据。
 * - venues / field 保留默认包视图，兼容已有调用；all_venues / packs 支持切换。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { activeFieldPacks, defaultFieldPack, packErrors, venuesForPack } from '../core/packs.ts';

const ROOT = process.cwd();
const DATA = join(ROOT, 'data');

function readYaml(path) {
  return parse(readFileSync(path, 'utf8'));
}

function readDir(dir, suffix = '.yaml') {
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => readYaml(join(dir, name)));
}

const fields = readDir(join(DATA, 'fields'));
const sourceVenues = readDir(join(DATA, 'venues'));
const layoutErrors = packErrors(fields, sourceVenues);
if (layoutErrors.length > 0) {
  for (const error of layoutErrors) console.error(error);
  process.exit(1);
}
const field = defaultFieldPack(fields);
const active = activeFieldPacks(fields);

function toShelfVenue(venue) {
  return {
    id: venue.id,
    type: venue.type,
    short: venue.names.short,
    full: venue.names.full,
    official_url: venue.official_url,
    publisher: venue.publisher ?? null,
    submission_model: venue.submission_model,
    qualifications: (venue.qualifications ?? []).map((q) => ({
      system: q.system,
      level: q.level,
      year: q.year,
    })),
    editions: (venue.editions ?? []).map((edition) => ({
      id: edition.id,
      year: edition.year,
      label: edition.label ?? null,
      location: edition.location ?? null,
      dates: edition.dates ?? null,
      official_url: edition.official_url,
      deadlines: (edition.deadlines ?? []).map((deadline) => ({
        id: deadline.id,
        kind: deadline.kind,
        label: deadline.label ?? null,
        due: deadline.due,
        timezone: deadline.timezone,
        due_utc: deadline.due_utc ?? null,
        due_source: deadline.due_source,
        status: deadline.status,
        evidence: {
          url: deadline.evidence.url,
          quote: deadline.evidence.quote ?? null,
          fetched_at: deadline.evidence.fetched_at,
        },
      })),
    })),
  };
}

const allVenues = sourceVenues.map(toShelfVenue);
const packs = active.map((pack) => ({
  id: pack.id,
  name_zh: pack.names.zh,
  name_en: pack.names.en,
  tier: pack.tier ?? 'community',
  tagline_zh: pack.tagline_zh ?? null,
  description_zh: pack.description_zh ?? null,
  venue_ids: venuesForPack(sourceVenues, pack.id).map((venue) => venue.id),
}));
const defaultVenueIds = new Set(packs.find((pack) => pack.id === field.id)?.venue_ids ?? []);
const venues = allVenues.filter((venue) => defaultVenueIds.has(venue.id));

// 用数据里最新的核验日期作为「生成时间」，而不是当前时钟，保持构建可复现。
const fetchedDates = allVenues
  .flatMap((venue) => venue.editions.flatMap((edition) => edition.deadlines.map((deadline) => deadline.evidence.fetched_at)))
  .sort();
const generated_at = fetchedDates.at(-1) ?? null;

const bundle = {
  generated_at,
  field: {
    id: field.id,
    name_zh: field.names.zh,
    name_en: field.names.en,
  },
  venues,
  packs,
  all_venues: allVenues,
};

mkdirSync(join(ROOT, 'src', 'generated'), { recursive: true });
writeFileSync(join(ROOT, 'src', 'generated', 'venues.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
console.log(`generated ${allVenues.length} venues across ${packs.length} packs; default ${field.id} (${venues.length})`);
