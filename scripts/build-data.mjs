/**
 * 把 data/ 下的 YAML 聚合成前端可直接 import 的 JSON。
 *
 * 为什么要有这一步：
 * - 数据源是给人改的 YAML（可写注释、diff 干净），而浏览器只认 JSON。
 * - 聚合发生在构建期，运行时零依赖、零请求。
 *
 * 生成物 src/generated/venues.json 需要提交进仓库，否则 clone 后不跑构建就没有数据。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

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
const field = fields.find((item) => item.status === 'active') ?? fields[0];
if (!field) {
  console.error('data/fields 下没有领域包');
  process.exit(1);
}

const venues = readDir(join(DATA, 'venues'))
  .filter((venue) => (venue.field_ids ?? []).includes(field.id))
  .map((venue) => ({
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
  }));

// 用数据里最新的核验日期作为「生成时间」，而不是当前时钟：
// 否则每次构建都会改一行时间戳，git diff 永远不干净。
const fetchedDates = venues
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
};

mkdirSync(join(ROOT, 'src', 'generated'), { recursive: true });
writeFileSync(join(ROOT, 'src', 'generated', 'venues.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
console.log(`generated ${venues.length} venues for field ${field.id}`);
