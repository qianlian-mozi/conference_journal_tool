/**
 * Deadline diff → 可审计 changelog。
 *
 * detected_at 是本次真实检测日；id 同时包含日期与前后值哈希，同一天重复写入幂等，
 * 以后再次发生相同变化仍会留下新事件。dry-run 不调用写入层，因此不会制造历史。
 */
import { createHash } from 'node:crypto';
import {
  ChangelogEntrySchema,
  type Changelog,
  type ChangelogEntry,
  type Deadline,
  type DeadlineChangeValue,
} from './schema.ts';

export interface DeadlineDiff {
  added: Deadline[];
  changed: Array<{ old: Deadline; next: Deadline }>;
  removed: Deadline[];
}

export function diffDeadlines(existing: Deadline[], incoming: Deadline[]): DeadlineDiff {
  const before = new Map(existing.map((item) => [item.id, item]));
  const after = new Map(incoming.map((item) => [item.id, item]));
  const added: Deadline[] = [];
  const changed: Array<{ old: Deadline; next: Deadline }> = [];
  const removed: Deadline[] = [];

  for (const [id, next] of after) {
    const old = before.get(id);
    if (!old) added.push(next);
    else if (
      old.due_utc !== next.due_utc ||
      old.raw_text !== next.raw_text ||
      old.kind !== next.kind ||
      old.due !== next.due ||
      old.timezone !== next.timezone ||
      old.due_source !== next.due_source ||
      old.status !== next.status
    ) {
      changed.push({ old, next });
    }
  }
  for (const [id, old] of before) {
    if (!after.has(id)) removed.push(old);
  }
  return { added, changed, removed };
}

function changeValue(deadline: Deadline): DeadlineChangeValue {
  return {
    due: deadline.due,
    timezone: deadline.timezone,
    ...(deadline.due_utc ? { due_utc: deadline.due_utc } : {}),
    raw_text: deadline.raw_text,
    status: deadline.status,
  };
}

function entryId(input: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
  return `change-${hash}`;
}

function makeEntry(
  venueId: string,
  editionId: string,
  detectedAt: string,
  change: ChangelogEntry['change'],
  old: Deadline | null,
  next: Deadline | null,
): ChangelogEntry {
  const subject = next ?? old;
  if (!subject) throw new Error('changelog 至少需要一个 before/after 值');
  const before = old ? changeValue(old) : null;
  const after = next ? changeValue(next) : null;
  return ChangelogEntrySchema.parse({
    id: entryId({ venueId, editionId, detectedAt, change, deadlineId: subject.id, before, after }),
    detected_at: detectedAt,
    venue_id: venueId,
    edition_id: editionId,
    deadline_id: subject.id,
    change,
    deadline_kind: subject.kind,
    ...(subject.label ? { label: subject.label } : {}),
    before,
    after,
    // changed/added 记录新证据；removed 必须保留被移除节点的旧证据。
    evidence: subject.evidence,
  });
}

export function createDeadlineChangeEntries(
  venueId: string,
  editionId: string,
  diff: DeadlineDiff,
  detectedAt: string,
): ChangelogEntry[] {
  return [
    ...diff.added.map((next) => makeEntry(venueId, editionId, detectedAt, 'added', null, next)),
    ...diff.changed.map(({ old, next }) =>
      makeEntry(venueId, editionId, detectedAt, 'changed', old, next),
    ),
    ...diff.removed.map((old) => makeEntry(venueId, editionId, detectedAt, 'removed', old, null)),
  ];
}

export function mergeChangelog(current: Changelog, incoming: ChangelogEntry[]): Changelog {
  const byId = new Map(current.changes.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const previous = byId.get(entry.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) {
      throw new Error(`changelog id 冲突: ${entry.id}`);
    }
    byId.set(entry.id, entry);
  }
  return {
    schema_version: 2,
    changes: [...byId.values()].sort(
      (a, b) => a.detected_at.localeCompare(b.detected_at) || a.id.localeCompare(b.id),
    ),
  };
}
