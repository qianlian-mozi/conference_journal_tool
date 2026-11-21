/**
 * 查询逻辑：CLI 与 MCP server 共用，避免两套排序/取数规则漂移。
 */
import type { Deadline, Edition, Venue } from './schema.ts';

export const DAY_MS = 86_400_000;

export function daysLeft(deadline: Deadline, now = Date.now()): number | null {
  if (!deadline.due_utc) return null;
  const instant = Date.parse(deadline.due_utc);
  if (Number.isNaN(instant)) return null;
  const remaining = instant - now;
  // Math.ceil 会把截止后不足 24 小时算成 -0，而 -0 < 0 为 false。
  if (remaining <= 0) return -Math.max(1, Math.ceil(-remaining / DAY_MS));
  return Math.ceil(remaining / DAY_MS);
}

/** 用真实时间差判断窗口，不能用已向上取整的展示天数。 */
export function isWithinDays(deadline: Deadline, withinDays: number, now = Date.now()): boolean {
  if (!Number.isFinite(withinDays) || withinDays < 0 || !deadline.due_utc) return false;
  const instant = Date.parse(deadline.due_utc);
  if (Number.isNaN(instant)) return false;
  const remaining = instant - now;
  return remaining > 0 && remaining <= withinDays * DAY_MS;
}

export function latestEdition(venue: Venue): Edition | null {
  if (venue.editions.length === 0) return null;
  return [...venue.editions].sort((a, b) => b.year - a.year)[0];
}

function instantOf(deadline: Deadline): number | null {
  if (!deadline.due_utc) return null;
  const instant = Date.parse(deadline.due_utc);
  return Number.isNaN(instant) ? null : instant;
}

/**
 * 投稿截止：优先 paper，其次 abstract，再退到最近的未来节点。
 * 同一类有多个轮次时先选未来最近的一轮；全部已过时选最近过去的一轮。
 */
export function submitDeadline(
  venue: Venue,
  now = Date.now(),
): { edition: Edition; deadline: Deadline } | null {
  if (venue.submission_model === 'rolling') return null;
  const edition = latestEdition(venue);
  if (!edition) return null;

  const active = edition.deadlines.filter((item) => item.status !== 'cancelled');
  const groups = [active.filter((item) => item.kind === 'paper'), active.filter((item) => item.kind === 'abstract')];
  const fallback = active.filter((item) => item.kind !== 'paper' && item.kind !== 'abstract');

  for (const candidates of [...groups, fallback]) {
    if (candidates.length === 0) continue;
    const dated = candidates
      .map((deadline) => ({ deadline, instant: instantOf(deadline) }))
      .filter((item): item is { deadline: Deadline; instant: number } => item.instant !== null);
    const upcoming = dated
      .filter((item) => item.instant > now)
      .sort((a, b) => a.instant - b.instant);
    if (upcoming.length > 0) return { edition, deadline: upcoming[0].deadline };

    const undated = candidates.find((item) => instantOf(item) === null);
    if (undated) return { edition, deadline: undated };

    const past = dated.sort((a, b) => b.instant - a.instant);
    if (past.length > 0) return { edition, deadline: past[0].deadline };
  }
  return null;
}

export function stateOf(venue: Venue, now = Date.now()): 'open' | 'soon' | 'passed' | 'rolling' | 'unknown' {
  if (venue.submission_model === 'rolling') return 'rolling';
  const picked = submitDeadline(venue, now);
  if (!picked) return 'unknown';
  const days = daysLeft(picked.deadline, now);
  if (days === null) return 'unknown';
  if (days < 0) return 'passed';
  return days <= 14 ? 'soon' : 'open';
}

export function sortKey(venue: Venue, now = Date.now()): number {
  if (venue.submission_model === 'rolling') return 3650;
  const picked = submitDeadline(venue, now);
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
      const picked = submitDeadline(venue, now);
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
      if (
        options.withinDays !== null &&
        options.withinDays !== undefined &&
        (!row.deadline || !isWithinDays(row.deadline, options.withinDays, now))
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => sortKey(a.venue, now) - sortKey(b.venue, now));
}

/**
 * 序列化成给 agent 看的结构。
 *
 * 保留 venue 的全部届次、资质与证据；`next` 只是便于排序和问答的视图，
 * 不能用某一届的 deadlines 取代完整 editions，否则 get_venue 会静默丢数据。
 */
export function toAgentJson(rows: VenueRow[]) {
  return rows.map(({ venue, edition, deadline, days, state }) => ({
    ...venue,
    short: venue.names.short,
    full: venue.names.full,
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
          status: deadline.status,
          days_left: days,
          evidence: deadline.evidence,
        }
      : null,
  }));
}
