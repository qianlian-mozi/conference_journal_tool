import { describe, expect, it } from 'vitest';
import { snapshotEvidenceError } from '../acquire/evidence.ts';
import { editionUrlFromDatesUrl, yearFromDatesUrl } from '../acquire/edition.ts';

describe('edition URL 推导', () => {
  it('支持 CVF 与独立年份路径', () => {
    expect(yearFromDatesUrl('https://cvpr.thecvf.com/Conferences/2027/Dates')).toBe(2027);
    expect(yearFromDatesUrl('https://3dvconf.github.io/2027/dates/')).toBe(2027);
    expect(editionUrlFromDatesUrl('https://3dvconf.github.io/2027/dates/')).toBe(
      'https://3dvconf.github.io/2027',
    );
  });

  it('支持年份子域，并拒绝子域与路径冲突', () => {
    expect(yearFromDatesUrl('https://2027.ieeeicip.org/important-dates/')).toBe(2027);
    expect(editionUrlFromDatesUrl('https://2027.ieeeicip.org/important-dates/')).toBe(
      'https://2027.ieeeicip.org',
    );
    expect(yearFromDatesUrl('https://2027.ieeeicip.org/2026/important-dates/')).toBeNull();
  });

  it('支持年份内嵌在会议域名和 dates.html 路径', () => {
    expect(yearFromDatesUrl('https://icpr2026.org/dates.html')).toBe(2026);
    expect(editionUrlFromDatesUrl('https://icpr2026.org/dates.html')).toBe('https://icpr2026.org');
    expect(yearFromDatesUrl('https://icpr2026.org/2027/dates.html')).toBeNull();
  });

  it('多个不同年份时拒绝猜测', () => {
    expect(yearFromDatesUrl('https://example.org/2026/2027/dates/')).toBeNull();
    expect(yearFromDatesUrl('https://example.org/2027/2027/dates/')).toBe(2027);
    expect(yearFromDatesUrl('https://example.org/dates/')).toBeNull();
  });
});

describe('快照证据回验', () => {
  const hash = 'a'.repeat(64);

  it('edition 与 deadline 共用同一个 quote 闸门', () => {
    const snapshot = 'Important Dates\nPaper Submission Aug 28, 2026';
    expect(snapshotEvidenceError('3dv', { quote: 'Important Dates', snapshot_hash: hash }, snapshot)).toBeNull();
    expect(
      snapshotEvidenceError('3dv', { quote: 'Dates and Deadlines', snapshot_hash: hash }, snapshot),
    ).toContain('quote 未能在快照中命中');
  });

  it('缺 hash 或缺快照都会失败', () => {
    expect(snapshotEvidenceError('3dv', { quote: 'Important Dates' }, 'Important Dates')).toContain(
      '缺少 snapshot_hash',
    );
    expect(
      snapshotEvidenceError('3dv', { quote: 'Important Dates', snapshot_hash: '0'.repeat(64) }),
    ).toContain('缺少快照文件');
  });
});
