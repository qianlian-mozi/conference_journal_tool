import { describe, expect, it } from 'vitest';
import {
  localToUtcIso,
  parseLocalIso,
  sameInstant,
  utcIsoToLocal,
  isValidTimeZone,
} from '../core/time.ts';

describe('parseLocalIso', () => {
  it('接受合法的本地时间', () => {
    expect(parseLocalIso('2026-11-16T23:59:59')).toEqual({
      year: 2026,
      month: 11,
      day: 16,
      hour: 23,
      minute: 59,
      second: 59,
    });
  });

  it('拒绝日历上不存在的日期', () => {
    expect(parseLocalIso('2026-02-30T10:00:00')).toBeNull();
    expect(parseLocalIso('2099-02-29T10:00:00')).toBeNull();
  });

  it('拒绝非法时间与带偏移的写法', () => {
    expect(parseLocalIso('2026-03-01T24:00:00')).toBeNull();
    expect(parseLocalIso('2026-03-01T23:59:59Z')).toBeNull();
  });
});

describe('AoE 换算', () => {
  it('AoE 23:59:59 等于次日 UTC 11:59:59', () => {
    expect(localToUtcIso('2026-11-16T23:59:59', 'AoE')).toBe('2026-11-17T11:59:59.000Z');
  });

  it('UTC 直接换算', () => {
    expect(localToUtcIso('2026-11-08T04:59:00', 'UTC')).toBe('2026-11-08T04:59:00.000Z');
  });

  it('往返一致', () => {
    const utc = localToUtcIso('2026-11-16T23:59:59', 'AoE');
    expect(utc).not.toBeNull();
    expect(utcIsoToLocal(utc as string, 'AoE')).toBe('2026-11-16T23:59:59');
  });
});

describe('IANA 时区', () => {
  it('能够换算纽约时间（夏令时前后都应是整点偏移）', () => {
    expect(localToUtcIso('2026-07-01T12:00:00', 'America/New_York')).toBe(
      '2026-07-01T16:00:00.000Z',
    );
    expect(localToUtcIso('2026-01-15T12:00:00', 'America/New_York')).toBe(
      '2026-01-15T17:00:00.000Z',
    );
  });

  it('识别非法时区', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
  });
});

describe('sameInstant', () => {
  it('容忍 60 秒内的偏差', () => {
    expect(sameInstant('2026-11-17T11:59:59.000Z', '2026-11-17T12:00:30.000Z')).toBe(true);
    expect(sameInstant('2026-11-17T11:59:59.000Z', '2026-11-17T12:05:00.000Z')).toBe(false);
  });
});
