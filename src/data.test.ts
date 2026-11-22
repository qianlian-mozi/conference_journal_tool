import { describe, expect, it } from 'vitest';
import { allVenues, daysLeft, defaultPack, kindLabel, latestEdition, packs, resolvePackId, shelfState, sortKey, submitDeadline } from './data';
import type { ShelfDeadline, ShelfVenue } from './types';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 21, 0, 0, 0); // 2026-11-21

function makeDeadline(overrides: Partial<ShelfDeadline> = {}): ShelfDeadline {
  return {
    id: 'x-paper',
    kind: 'paper',
    label: 'Paper Deadline',
    due: '2026-12-01T23:59:59',
    timezone: 'AoE',
    due_utc: new Date(now + 10 * DAY).toISOString(),
    due_source: 'timestamp',
    status: 'confirmed',
    evidence: { url: 'https://example.org', quote: 'Paper Deadline Dec 01 26', fetched_at: '2026-11-21' },
    ...overrides,
  };
}

function makeVenue(overrides: Partial<ShelfVenue> = {}): ShelfVenue {
  return {
    id: 'demo',
    type: 'conference',
    short: 'DEMO',
    full: 'Demo Conference',
    official_url: 'https://example.org',
    publisher: null,
    submission_model: 'fixed',
    qualifications: [],
    editions: [
      {
        id: 'demo-2027',
        year: 2027,
        label: 'DEMO 2027',
        location: null,
        dates: null,
        official_url: 'https://example.org',
        deadlines: [makeDeadline()],
      },
    ],
    ...overrides,
  };
}

describe('daysLeft', () => {
  it('未来日期向上取整', () => {
    expect(daysLeft(makeDeadline(), now)).toBe(10);
  });

  it('过期返回负数', () => {
    const past = makeDeadline({ due_utc: new Date(now - 3 * DAY).toISOString() });
    expect(daysLeft(past, now)).toBe(-3);
  });

  it('缺少 due_utc 时返回 null', () => {
    expect(daysLeft(makeDeadline({ due_utc: null }), now)).toBeNull();
  });
});

describe('submitDeadline', () => {
  it('优先取 paper', () => {
    const venue = makeVenue({
      editions: [
        {
          id: 'demo-2027',
          year: 2027,
          label: null,
          location: null,
          dates: null,
          official_url: 'https://example.org',
          deadlines: [
            makeDeadline({ id: 'a', kind: 'abstract' }),
            makeDeadline({ id: 'b', kind: 'paper' }),
          ],
        },
      ],
    });
    expect(submitDeadline(venue)?.id).toBe('b');
  });

  it('没有 paper 时退回 abstract', () => {
    const venue = makeVenue({
      editions: [
        {
          id: 'demo-2027',
          year: 2027,
          label: null,
          location: null,
          dates: null,
          official_url: 'https://example.org',
          deadlines: [makeDeadline({ id: 'a', kind: 'abstract' })],
        },
      ],
    });
    expect(submitDeadline(venue)?.id).toBe('a');
  });

  it('没有任何日期时返回 null', () => {
    const venue = makeVenue({ editions: [] });
    expect(submitDeadline(venue)).toBeNull();
  });
});

describe('shelfState / sortKey', () => {
  it('滚动投稿期刊视为 open', () => {
    const journal = makeVenue({ type: 'journal', submission_model: 'rolling', editions: [] });
    expect(shelfState(journal, now)).toBe('open');
    expect(sortKey(journal, now)).toBe(3650);
  });

  it('14 天内标记为 soon', () => {
    const venue = makeVenue({
      editions: [
        {
          id: 'demo-2027',
          year: 2027,
          label: null,
          location: null,
          dates: null,
          official_url: 'https://example.org',
          deadlines: [makeDeadline({ due_utc: new Date(now + 5 * DAY).toISOString() })],
        },
      ],
    });
    expect(shelfState(venue, now)).toBe('soon');
  });

  it('已截止排在可投之后', () => {
    const open = makeVenue({ id: 'open' });
    const closed = makeVenue({
      id: 'closed',
      editions: [
        {
          id: 'demo-2027',
          year: 2027,
          label: null,
          location: null,
          dates: null,
          official_url: 'https://example.org',
          deadlines: [makeDeadline({ due_utc: new Date(now - DAY).toISOString() })],
        },
      ],
    });
    expect(sortKey(open, now)).toBeLessThan(sortKey(closed, now));
  });

  it('没有日期时状态为 unknown', () => {
    expect(shelfState(makeVenue({ editions: [] }), now)).toBe('unknown');
  });
});

describe('packs', () => {
  it('默认展示 3DGS / Avatar，可通过分享参数切换', () => {
    expect(defaultPack.id).toBe('3dgs-avatar');
    expect(defaultPack.venue_ids).toHaveLength(8);
    expect(packs.map((pack) => pack.id)).toEqual(['3dgs-avatar', 'computer-vision']);
    expect(allVenues).toHaveLength(14);
    expect(resolvePackId('computer-vision')).toBe('computer-vision');
    expect(resolvePackId('missing')).toBe('3dgs-avatar');
    expect(resolvePackId(null)).toBe('3dgs-avatar');
  });
});

describe('latestEdition / kindLabel', () => {
  it('取年份最大的一届', () => {
    const venue = makeVenue({
      editions: [
        { id: 'a', year: 2026, label: null, location: null, dates: null, official_url: 'https://example.org', deadlines: [] },
        { id: 'b', year: 2028, label: null, location: null, dates: null, official_url: 'https://example.org', deadlines: [] },
      ],
    });
    expect(latestEdition(venue)?.id).toBe('b');
  });

  it('节点类型有中文标签', () => {
    expect(kindLabel('paper')).toBe('论文投稿');
    expect(kindLabel('supplement')).toBe('补充材料');
    expect(kindLabel('unknown-kind')).toBe('unknown-kind');
  });
});
