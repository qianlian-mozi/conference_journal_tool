import { describe, expect, it } from 'vitest';
import type { ShelfDeadline, ShelfVenue } from '../types';
import { buildDeadlineCalendar } from './deadline-ics';

function deadline(overrides: Partial<ShelfDeadline> = {}): ShelfDeadline {
  return {
    id: 'demo-2027-paper',
    kind: 'paper',
    label: 'Full Paper',
    due: '2027-01-28T23:59:59',
    timezone: 'AoE',
    due_utc: '2027-01-29T11:59:59.000Z',
    due_source: 'text',
    status: 'confirmed',
    evidence: {
      url: 'https://example.org/dates',
      quote: 'Full Paper, Jan 28; 23:59 AoE',
      fetched_at: '2026-11-22',
    },
    ...overrides,
  };
}

function venue(deadlines: ShelfDeadline[]): ShelfVenue {
  return {
    id: 'demo',
    type: 'conference',
    short: 'DEMO',
    full: 'Demo Conference',
    official_url: 'https://example.org/',
    publisher: null,
    submission_model: 'fixed',
    qualifications: [],
    editions: [{
      id: 'demo-2027',
      year: 2027,
      label: null,
      location: 'Shanghai, China',
      dates: null,
      official_url: 'https://example.org/2027',
      deadlines,
    }],
  };
}

describe('buildDeadlineCalendar', () => {
  it('导出精确 UTC 截止、稳定 UID、来源与 24 小时提醒', () => {
    const result = buildDeadlineCalendar([venue([deadline()])], {
      name: '3DGS / Avatar',
      generatedAt: new Date('2026-11-22T04:00:00Z'),
    });
    expect(result.eventCount).toBe(1);
    expect(result.ics).toContain('DTSTART:20270129T115959Z\r\n');
    expect(result.ics).toContain('DTEND:20270129T121459Z\r\n');
    expect(result.ics).toContain('DTSTAMP:20261122T040000Z\r\n');
    expect(result.ics).toContain('UID:demo:demo-2027-paper@cv-venue-radar\r\n');
    expect(result.ics).toContain('URL;VALUE=URI:https://example.org/dates\r\n');
    expect(result.ics).toContain('TRIGGER:-PT24H\r\n');
    expect(result.ics).toContain('STATUS:CONFIRMED\r\n');
    expect(result.ics).toContain('TRANSP:TRANSPARENT\r\n');
  });

  it('不猜测缺失 due_utc 的时刻', () => {
    const result = buildDeadlineCalendar([
      venue([deadline({ due_utc: null }), deadline({ id: 'demo-2027-review', due_utc: 'bad' })]),
    ], { name: 'Demo' });
    expect(result.eventCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(result.ics).not.toContain('BEGIN:VEVENT');
  });

  it('保留 tentative/cancelled 状态并支持多 venue', () => {
    const first = venue([
      deadline({ status: 'tentative' }),
      deadline({ id: 'demo-2027-camera', status: 'cancelled' }),
    ]);
    const second = { ...venue([deadline()]), id: 'other', short: 'OTHER' };
    const result = buildDeadlineCalendar([first, second], { name: 'Demo' });
    expect(result.eventCount).toBe(3);
    expect(result.ics).toContain('UID:demo:demo-2027-paper@cv-venue-radar\r\n');
    expect(result.ics).toContain('UID:other:demo-2027-paper@cv-venue-radar\r\n');
    expect(result.ics).toContain('STATUS:TENTATIVE\r\n');
    expect(result.ics).toContain('STATUS:CANCELLED\r\n');
  });

  it('按 UTF-8 octets 折行且不切断中文', () => {
    const result = buildDeadlineCalendar([venue([deadline()])], {
      name: '三维高斯泼溅与数字人投稿截止日期——这是一个很长很长的日历名称',
    });
    const physicalLines = result.ics.split('\r\n');
    for (const line of physicalLines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = result.ics.replace(/\r\n[ \t]/g, '');
    expect(unfolded).toContain('三维高斯泼溅与数字人投稿截止日期');
    expect(unfolded).toContain('官网原文：Full Paper\\, Jan 28\\; 23:59 AoE');
  });

  it('使用 CRLF 并以 END:VCALENDAR 结束', () => {
    const { ics } = buildDeadlineCalendar([venue([deadline()])], { name: 'Demo' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
