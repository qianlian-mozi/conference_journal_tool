import { describe, expect, it } from 'vitest';
import {
  createDeadlineChangeEntries,
  diffDeadlines,
  mergeChangelog,
} from '../core/changelog.ts';
import { ChangelogEntrySchema, type Deadline } from '../core/schema.ts';

function deadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: 'demo-2027-paper',
    kind: 'paper',
    label: 'Paper Submission',
    raw_text: 'Paper Submission January 10, 2027 AoE',
    due: '2027-01-10T23:59:59',
    timezone: 'AoE',
    due_utc: '2027-01-11T11:59:59.000Z',
    due_source: 'text',
    status: 'confirmed',
    evidence: {
      url: 'https://example.org/dates',
      quote: 'Paper Submission January 10, 2027 AoE',
      fetched_at: '2026-11-22',
    },
    ...overrides,
  };
}

describe('deadline changelog', () => {
  it('记录新增、修改和移除，并为移除保留旧证据', () => {
    const old = deadline();
    const next = deadline({ due_utc: '2027-01-12T11:59:59.000Z', due: '2027-01-11T23:59:59' });
    const added = deadline({ id: 'demo-2027-rebuttal', kind: 'rebuttal' });
    const removed = deadline({ id: 'demo-2027-abstract', kind: 'abstract' });
    const diff = diffDeadlines([old, removed], [next, added]);
    const entries = createDeadlineChangeEntries('demo', 'demo-2027', diff, '2026-11-22');

    expect(entries.map((entry) => entry.change).sort()).toEqual(['added', 'changed', 'removed']);
    const changed = entries.find((entry) => entry.change === 'changed')!;
    expect(changed.before?.due_utc).toBe(old.due_utc);
    expect(changed.after?.due_utc).toBe(next.due_utc);
    const deletion = entries.find((entry) => entry.change === 'removed')!;
    expect(deletion.after).toBeNull();
    expect(deletion.evidence).toEqual(removed.evidence);
  });

  it('同一天重复追加幂等，以后再次发生仍记录新事件', () => {
    const diff = diffDeadlines([], [deadline()]);
    const first = createDeadlineChangeEntries('demo', 'demo-2027', diff, '2026-11-22');
    const merged = mergeChangelog({ schema_version: 2, changes: [] }, first);
    expect(mergeChangelog(merged, first).changes).toHaveLength(1);
    const later = createDeadlineChangeEntries('demo', 'demo-2027', diff, '2026-12-01');
    expect(mergeChangelog(merged, later).changes).toHaveLength(2);
  });

  it('diff 能识别状态变化', () => {
    const old = deadline();
    const next = deadline({ status: 'extended' });
    expect(diffDeadlines([old], [next]).changed).toHaveLength(1);
  });

  it('schema 拒绝 change 与 before/after 不一致', () => {
    const [entry] = createDeadlineChangeEntries(
      'demo',
      'demo-2027',
      diffDeadlines([], [deadline()]),
      '2026-11-22',
    );
    expect(ChangelogEntrySchema.safeParse({ ...entry, change: 'removed' }).success).toBe(false);
  });
});
