import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDeadlineCalendar } from '../src/lib/deadline-ics.ts';

const root = resolve(import.meta.dirname, '..');
const bundle = JSON.parse(readFileSync(join(root, 'src/generated/venues.json'), 'utf8'));
const outputDir = join(root, 'dist/calendars');
mkdirSync(outputDir, { recursive: true });

// DTSTAMP 是本次日历修订时间；即使同一核验日内数据变化，订阅客户端也能识别新版本。
const generatedAt = new Date();
const manifest = [];

for (const pack of bundle.packs) {
  const ids = new Set(pack.venue_ids);
  const venues = bundle.all_venues.filter((venue) => ids.has(venue.id));
  const result = buildDeadlineCalendar(venues, {
    name: `${pack.name_zh} · Venue Radar`,
    description: pack.description_zh ?? `${pack.name_en} 投稿截止日期`,
    generatedAt,
  });
  const filename = `${pack.id}.ics`;
  writeFileSync(join(outputDir, filename), result.ics, 'utf8');
  manifest.push({
    id: pack.id,
    name_zh: pack.name_zh,
    name_en: pack.name_en,
    url: `calendars/${filename}`,
    event_count: result.eventCount,
    skipped_count: result.skippedCount,
  });
  console.log(`calendar ${pack.id}: ${result.eventCount} events, ${result.skippedCount} skipped`);
}

writeFileSync(
  join(outputDir, 'index.json'),
  `${JSON.stringify({
    generated_at: bundle.generated_at,
    calendar_generated_at: generatedAt.toISOString(),
    calendars: manifest,
  }, null, 2)}\n`,
  'utf8',
);
