#!/usr/bin/env node
/**
 * 变更摘要 CLI（M5-B）：只把 data/changelog.yaml 的真实 diff 说成人话。
 *
 *   node cmd/changes.ts
 *   node cmd/changes.ts --days 30 --pack 3dgs-avatar
 *   node cmd/changes.ts --venue siggraph --json
 */
import { loadChangelog, loadFieldPacks, loadVenues } from '../core/load.ts';
import { formatChangeReport, selectRecentChanges, summarizeChange } from '../core/summary.ts';
import { CHANGES_USAGE, ChangesArgError, parseChangesArgs } from './changes-args.ts';

let args: ReturnType<typeof parseChangesArgs>;
try {
  args = parseChangesArgs(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  console.error(CHANGES_USAGE);
  process.exit(error instanceof ChangesArgError ? error.code : 2);
}

if (args.help) {
  console.log(CHANGES_USAGE);
  process.exit(0);
}

const venues = loadVenues().map((file) => file.data);
const packs = loadFieldPacks().map((file) => file.data);

if (args.pack && !packs.some((pack) => pack.id === args.pack)) {
  console.error(`未找到领域包：${args.pack}`);
  process.exit(2);
}
if (args.venue && !venues.some((venue) => venue.id === args.venue)) {
  console.error(`未找到 venue：${args.venue}`);
  process.exit(2);
}

const selectedVenues = venues
  .filter((venue) => !args.pack || venue.field_ids.includes(args.pack))
  .filter((venue) => !args.venue || venue.id === args.venue);
const names = new Map(selectedVenues.map((venue) => [venue.id, venue.names.short]));
const entries = selectRecentChanges(loadChangelog().changes, {
  days: args.days,
  venueIds: selectedVenues.map((venue) => venue.id),
});
const summaries = entries.map((entry) => summarizeChange(entry, names));

if (args.json) {
  console.log(
    JSON.stringify(
      {
        window_days: args.days,
        pack: args.pack,
        venue: args.venue,
        count: summaries.length,
        entries: summaries,
      },
      null,
      2,
    ),
  );
} else {
  if (args.pack) console.log(`领域包：${args.pack}`);
  if (args.venue) console.log(`Venue：${args.venue}`);
  console.log(formatChangeReport(summaries, { days: args.days }));
}
