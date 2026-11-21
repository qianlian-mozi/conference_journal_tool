import { loadVenues } from '../core/load.ts';
import { daysLeft, isWithinDays, queryVenues, toAgentJson } from '../core/query.ts';
import type { Venue } from '../core/schema.ts';

const venues: Venue[] = loadVenues().map((file) => file.data);

/** MCP 工具实现，与 stdio 传输分开以便直接回归测试。 */
export function callTool(name: string, args: Record<string, unknown>) {
  if (name === 'search_venues') {
    const rows = queryVenues(venues, {
      field: typeof args.field === 'string' ? args.field : null,
      type: typeof args.type === 'string' ? args.type : null,
      withinDays: typeof args.within_days === 'number' ? args.within_days : null,
      openOnly: args.open_only === true,
    });
    return toAgentJson(rows);
  }

  if (name === 'get_venue') {
    const id = typeof args.id === 'string' ? args.id : '';
    const venue = venues.find((item) => item.id === id);
    if (!venue) throw new Error(`unknown venue: ${id}`);
    return toAgentJson(queryVenues([venue], {}))[0];
  }

  if (name === 'get_deadlines') {
    const venueId = typeof args.venue_id === 'string' ? args.venue_id : null;
    const withinDays = typeof args.within_days === 'number' ? args.within_days : null;
    const rows = queryVenues(venues, { venueId });
    const flattened = rows.filter(({ venue }) => venue.submission_model !== 'rolling').flatMap(({ venue }) =>
      venue.editions.flatMap((edition) =>
        edition.deadlines.map((deadline) => ({
          venue_id: venue.id,
          venue: venue.names.short,
          edition_id: edition.id,
          ...deadline,
          days_left: daysLeft(deadline),
        })),
      ),
    );
    if (withinDays === null) return flattened;
    const now = Date.now();
    return flattened.filter((item) => isWithinDays(item, withinDays, now));
  }

  throw new Error(`unknown tool: ${name}`);
}
