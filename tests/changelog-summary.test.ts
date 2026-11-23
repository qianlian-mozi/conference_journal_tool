import { describe, expect, it } from 'vitest';
import { ChangelogEntrySchema, type ChangelogEntry } from '../core/schema.ts';
import {
  formatChangeReport,
  selectRecentChanges,
  summarizeChange,
} from '../core/summary.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const IDS = new Map([
  ['demo', 'DEMO'],
  ['other', 'OTHER'],
]);

function value(
  due: string,
  status = 'confirmed',
  rawText = `official ${due}`,
  dueSource?: 'timestamp' | 'text',
) {
  const timezone = 'AoE';
  const offsetHours = 12;
  const instant = new Date(`${due}Z`);
  instant.setUTCHours(instant.getUTCHours() + offsetHours);
  return {
    due,
    timezone,
    due_utc: instant.toISOString(),
    ...(dueSource ? { due_source: dueSource } : {}),
    raw_text: rawText,
    status,
  };
}

let sequence = 0;
function entry(overrides: Partial<ChangelogEntry> = {}): ChangelogEntry {
  sequence += 1;
  const after = overrides.after ?? value('2026-12-01T23:59:59');
  return ChangelogEntrySchema.parse({
    id: `change-test-${sequence}`,
    detected_at: '2026-11-22',
    venue_id: 'demo',
    edition_id: 'demo-2027',
    deadline_id: 'demo-2027-paper',
    change: 'added',
    deadline_kind: 'paper',
    label: 'Paper deadline',
    before: null,
    after,
    evidence: {
      url: 'https://example.org/dates',
      quote: 'Paper deadline',
      fetched_at: '2026-11-22',
      snapshot_hash: 'a'.repeat(64),
    },
    ...overrides,
  });
}

describe('summarizeChange', () => {
  it('describes an added deadline with its local timezone', () => {
    const summary = summarizeChange(entry(), IDS);
    expect(summary.text).toBe('DEMO 新增「Paper deadline」：2026-12-01 23:59 AoE');
    expect(summary.id).toMatch(/^change-test-/);
    expect(summary.evidence.url).toBe('https://example.org/dates');
  });

  it('preserves text-derived uncertainty instead of presenting a parsed time as exact', () => {
    const summary = summarizeChange(
      entry({ after: value('2026-12-01T23:59:59', 'confirmed', 'December 1, 2026', 'text') }),
      IDS,
    );
    expect(summary.text).toContain('2026-12-01 23:59 AoE（据官网文本）');
  });

  it('describes a moved deadline and a status change without inventing facts', () => {
    const summary = summarizeChange(
      entry({
        change: 'changed',
        before: value('2026-11-16T23:59:59', 'confirmed'),
        after: value('2026-11-23T23:59:59', 'extended'),
      }),
      IDS,
    );
    expect(summary.text).toContain('2026-11-16 23:59 AoE');
    expect(summary.text).toContain('2026-11-23 23:59 AoE');
    expect(summary.text).toContain('状态从已确认改为已延期');
    expect(summary.text).not.toContain('预计');
  });

  it('describes a status-only change', () => {
    const summary = summarizeChange(
      entry({
        change: 'changed',
        before: value('2026-12-01T23:59:59', 'tentative'),
        after: value('2026-12-01T23:59:59', 'confirmed'),
      }),
      IDS,
    );
    expect(summary.text).toBe('DEMO 的「Paper deadline」状态从待确认改为已确认');
  });

  it('describes a raw-text-only revision without claiming the date moved', () => {
    const summary = summarizeChange(
      entry({
        change: 'changed',
        before: value('2026-12-01T23:59:59', 'confirmed', 'old wording'),
        after: value('2026-12-01T23:59:59', 'confirmed', 'new wording'),
      }),
      IDS,
    );
    expect(summary.text).toContain('官网原文已更新，日期与状态未变');
  });

  it('describes removals using the retained before value', () => {
    const summary = summarizeChange(
      entry({ change: 'removed', before: value('2026-11-16T23:59:59'), after: null }),
      IDS,
    );
    expect(summary.text).toBe('DEMO 移除「Paper deadline」：原为 2026-11-16 23:59 AoE');
  });
});

describe('selectRecentChanges', () => {
  it('filters by UTC calendar window, venue set, and future dates', () => {
    const recent = entry();
    const old = entry({ detected_at: '2026-11-15' });
    const future = entry({ detected_at: '2026-11-23' });
    const other = entry({ venue_id: 'other' });

    expect(
      selectRecentChanges([recent, old, future, other], {
        now: NOW,
        days: 7,
        venueIds: ['demo'],
      }).map((item) => item.id),
    ).toEqual([recent.id]);
  });

  it('widens the window when requested', () => {
    const old = entry({ detected_at: '2026-11-15' });
    expect(selectRecentChanges([old], { now: NOW, days: 7 })).toHaveLength(0);
    expect(selectRecentChanges([old], { now: NOW, days: 30 })).toHaveLength(1);
  });

  it('rejects invalid windows', () => {
    expect(() => selectRecentChanges([], { now: NOW, days: 0 })).toThrow('1–3650');
  });
});

describe('formatChangeReport', () => {
  it('includes the changelog id and evidence URL for every summary', () => {
    const summary = summarizeChange(entry(), IDS);
    const report = formatChangeReport([summary], { days: 7 });
    expect(report).toContain(summary.id);
    expect(report).toContain('https://example.org/dates');
  });

  it('explains an empty window without manufacturing history', () => {
    const report = formatChangeReport([], { days: 7 });
    expect(report).toContain('没有已记录变更');
    expect(report).not.toContain('延期');
  });
});
