/**
 * 查询逻辑：CLI 与 MCP server 共用，避免两套排序/取数规则漂移。
 */
import type { Deadline, Edition, Venue } from './schema.ts';

export const DAY_MS = 86_400_000;

export function daysLeft(deadline: Deadline, now = Date.now()): number | null {
  if (!deadline.due_utc) return null;
  const instant = Date.parse(deadline.due_utc);
  if (Number.isNaN(instant)) return null;
  return Math.ceil((instant - now) / DAY_MS);
}

export function latestEdition(venue: Venue): Edition | null {
  if (venue.editions.length === 0) return null;
  return [...venue.editions].sort((a, b) => b.year - a.year)[0];
}

/** 投稿截止：优先 paper，其次 abstract，再退到最近的未来节点。 */
export function submitDeadline(venue: Venue): { edition: Edition; deadline: Deadline } | null {
  const edition = latestEdition(venue);
  if (!edition) return null;

  const paper = edition.deadlines.find((item) => item.kind === 'paper');
  if (paper) return { edition, deadline: paper };

  const abstract = edition.deadlines.find((item) => item.kind === 'abstract');
  if (abstract) return { edition, deadline: abstract };

  const upcoming = edition.deadlines
    .filter((item) => item.due_utc)
    .sort((a, b) => Date.parse(a.due_utc as string) - Date.parse(b.due_utc as string));
  return upcoming.length > 0 ? { edition, deadline: upcoming[0] } : null;
}

export function stateOf(venue: Venue, now = Date.now()): 'open' | 'soon' | 'passed' | 'rolling' | 'unknown' {
  if (venue.submission_model === 'rolling') return 'rolling';
  const picked = submitDeadline(venue);
  if (!picked) return 'unknown';
  const days = daysLeft(picked.deadline, now);
  if (days === null) return 'unknown';
  if (days < 0) return 'passed';
  return days <= 14 ? 'soon' : 'open';
}

export function sortKey(venue: Venue, now = Date.now()): number {
  if (venue.submission_model === 'rolling') return 3650;
  const picked = submitDeadline(venue);
  if (!picked) return 9999;
  const days = daysLeft(picked.deadline, now);
  if (days === null) return 9999;
  return days < 0 ? 5000 + Math.abs(days) : days;
}

export function formatLocal(deadline: Deadline): string {
  return `${deadline.due.replace('T', ' ').slice(0, 16)} ${deadline.timezone}`;
}

export interface QueryOptions {
  field?: string | null;
  type?: string | null;
  withinDays?: number | null;
  openOnly?: boolean;
  venueId?: string | null;
}

export interface VenueRow {
  venue: Venue;
  edition: Edition | null;
  deadline: Deadline | null;
  days: number | null;
  state: ReturnType<typeof stateOf>;
}

export function queryVenues(venues: Venue[], options: QueryOptions = {}, now = Date.now()): VenueRow[] {
  return venues
    .filter((venue) => (options.field ? venue.field_ids.includes(options.field) : true))
    .filter((venue) => (options.type ? venue.type === options.type : true))
    .filter((venue) => (options.venueId ? venue.id === options.venueId : true))
    .map((venue) => {
      const picked = submitDeadline(venue);
      return {
        venue,
        edition: picked?.edition ?? null,
        deadline: picked?.deadline ?? null,
        days: picked ? daysLeft(picked.deadline, now) : null,
        state: stateOf(venue, now),
      };
    })
    .filter((row) => {
      if (options.openOnly && row.state !== 'open' && row.state !== 'soon' && row.state !== 'rolling') {
        return false;
      }
      if (options.withinDays !== null && options.withinDays !== undefined) {
        if (row.days === null || row.days < 0 || row.days > options.withinDays) return false;
      }
      return true;
    })
    .sort((a, b) => sortKey(a.venue, now) - sortKey(b.venue, now));
}

/** 序列化成给 agent 看的精简结构（保留证据，去掉内部字段）。 */
export function toAgentJson(rows: VenueRow[]) {
  return rows.map(({ venue, edition, deadline, days, state }) => ({
    id: venue.id,
    short: venue.names.short,
    full: venue.names.full,
    type: venue.type,
    submission_model: venue.submission_model,
    official_url: venue.official_url,
    state,
    next: deadline
      ? {
          edition_id: edition?.id ?? null,
          deadline_id: deadline.id,
          kind: deadline.kind,
          label: deadline.label ?? null,
          due: deadline.due,
          timezone: deadline.timezone,
          due_utc: deadline.due_utc ?? null,
          due_source: deadline.due_source,
          days_left: days,
          evidence: deadline.evidence,
        }
      : null,
    deadlines: (edition?.deadlines ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label ?? null,
      due: item.due,
      timezone: item.timezone,
      due_utc: item.due_utc ?? null,
      due_source: item.due_source,
      status: item.status,
      evidence: item.evidence,
    })),
  }));
}
