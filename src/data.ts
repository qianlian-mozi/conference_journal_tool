import bundle from './generated/venues.json';
import type { ShelfBundle, ShelfDeadline, ShelfEdition, ShelfVenue } from './types';

export const data = bundle as ShelfBundle;
export const field = data.field;
export const venues = data.venues;
export const packs = data.packs;
export const allVenues = data.all_venues;
export const defaultPack = packs.find((pack) => pack.id === field.id) ?? packs[0];

/** 分享链接中的 pack 参数无效时回退到默认包，不展示空页面。 */
export function resolvePackId(requested: string | null | undefined): string {
  if (requested && packs.some((pack) => pack.id === requested)) return requested;
  return defaultPack.id;
}

export const DAY_MS = 86_400_000;

/** 距截止还有多少天（向上取整）。已过期返回负数。 */
export function daysLeft(deadline: ShelfDeadline, now = Date.now()): number | null {
  if (!deadline.due_utc) return null;
  const instant = Date.parse(deadline.due_utc);
  if (Number.isNaN(instant)) return null;
  return Math.ceil((instant - now) / DAY_MS);
}

/** 最新一届（年份最大）。没有 edition 时返回 null。 */
export function latestEdition(venue: ShelfVenue): ShelfEdition | null {
  if (venue.editions.length === 0) return null;
  return [...venue.editions].sort((a, b) => b.year - a.year)[0];
}

export const SUBMIT_KINDS = ['paper', 'abstract'] as const;

/**
 * 「投稿截止」优先取 paper，其次 abstract。
 * 找不到就退回最近一个未来的节点，再找不到返回 null。
 */
export function submitDeadline(venue: ShelfVenue): ShelfDeadline | null {
  const edition = latestEdition(venue);
  if (!edition || edition.deadlines.length === 0) return null;

  const paper = edition.deadlines.find((item) => item.kind === 'paper');
  if (paper) return paper;

  const abstract = edition.deadlines.find((item) => item.kind === 'abstract');
  if (abstract) return abstract;

  const upcoming = edition.deadlines
    .filter((item) => item.due_utc)
    .sort((a, b) => Date.parse(a.due_utc as string) - Date.parse(b.due_utc as string));
  return upcoming[0] ?? null;
}

export type ShelfState = 'open' | 'soon' | 'passed' | 'unknown';

export function shelfState(venue: ShelfVenue, now = Date.now()): ShelfState {
  if (venue.submission_model === 'rolling') return 'open';
  const deadline = submitDeadline(venue);
  if (!deadline) return 'unknown';
  const days = daysLeft(deadline, now);
  if (days === null) return 'unknown';
  if (days < 0) return 'passed';
  if (days <= 14) return 'soon';
  return 'open';
}

export function sortKey(venue: ShelfVenue, now = Date.now()): number {
  if (venue.submission_model === 'rolling') return 3650;
  const deadline = submitDeadline(venue);
  if (!deadline) return 9999;
  const days = daysLeft(deadline, now);
  if (days === null) return 9999;
  // 已截止的排在最后，越近的越靠后（最近的已截止在前）。
  return days < 0 ? 5000 + Math.abs(days) : days;
}

const KIND_LABELS: Record<string, string> = {
  abstract: '摘要',
  registration: '注册',
  paper: '论文投稿',
  supplement: '补充材料',
  rebuttal: '反驳',
  camera_ready: '终稿',
  notification: '结果通知',
  other: '其他',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export function formatDateTime(deadline: ShelfDeadline): string {
  const local = deadline.due.replace('T', ' ').slice(0, 16);
  return `${local} ${deadline.timezone === 'AoE' ? 'AoE' : deadline.timezone}`;
}
