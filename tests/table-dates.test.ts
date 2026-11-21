import { describe, expect, it } from 'vitest';
import { extractTableDates, parseCountdownUtc } from '../acquire/adapters/table-dates.ts';

const page = `
<h3>Important Dates</h3>
<table>
  <tr><th>Abstract Registration</th><td>Aug 28, 2026</td><td><span data-countdown="2026/08/29 11:59:59 +0000"></span></td></tr>
  <tr><th>Paper Submission</th><td>Aug 28, 2026</td><td><span data-countdown="2026/08/29 11:59:59 +0000"></span></td></tr>
  <tr><th>Supplementary Material</th><td>Sep 02, 2026</td><td><span data-countdown="2026/09/03 11:59:59 +0000"></span></td></tr>
  <tr><th>Preliminary Notification</th><td>Oct 27, 2026</td><td><span data-countdown="2026/10/27 18:00:00 +0000"></span></td></tr>
  <tr><th>Final Notification</th><td>Dec 02, 2026</td><td><span data-countdown="2026/12/02 19:00:00 +0000"></span></td></tr>
  <tr><th>Main conference</th><td>Apr 06-09, 2027</td><td><span data-countdown="2027/04/06 07:00:00 +0000"></span></td></tr>
  <tr><th>Workshop Submission Deadline</th><td>Jan 10, 2027</td><td><span data-countdown="2027/01/10 23:59:00 +0000"></span></td></tr>
</table>`;

describe('table-dates countdown', () => {
  it('按显式 offset 转换，不依赖进程时区', () => {
    expect(parseCountdownUtc('2026/08/29 11:59:59 +0000')).toBe('2026-08-29T11:59:59.000Z');
    expect(parseCountdownUtc('2026/08/29 13:59:59 +0200')).toBe('2026-08-29T11:59:59.000Z');
    expect(parseCountdownUtc('2026/08/29 06:29:59 -0530')).toBe('2026-08-29T11:59:59.000Z');
    expect(parseCountdownUtc('2026/08/29 11:59:59 UTC')).toBe('2026-08-29T11:59:59.000Z');
  });

  it('拒绝缺失或非法时间戳', () => {
    expect(parseCountdownUtc('Aug 28, 2026')).toBeNull();
    expect(parseCountdownUtc('2026/13/29 11:59:59 +0000')).toBeNull();
    expect(parseCountdownUtc('2026/02/30 11:59:59 +0000')).toBeNull();
    expect(parseCountdownUtc('2026/08/29 25:59:59 +0000')).toBeNull();
    expect(parseCountdownUtc('2026/08/29 11:59:59 +2460')).toBeNull();
  });
});

describe('table-dates 页面抽取', () => {
  it('读取 3DV 风格 th/td 行并过滤会议与卫星活动', () => {
    const result = extractTableDates(page);
    expect(result.status).toBe('ok');
    expect(result.deadlines.map((item) => item.label)).toEqual([
      'Abstract Registration',
      'Paper Submission',
      'Supplementary Material',
      'Preliminary Notification',
      'Final Notification',
    ]);
    expect(result.deadlines[0]).toMatchObject({
      rawText: 'Aug 28, 2026',
      dueUtc: '2026-08-29T11:59:59.000Z',
      timezone: 'UTC',
      dueSource: 'timestamp',
      key: 'abstract-registration',
    });
    expect(result.deadlines[1].kind).toBe('paper');
    expect(result.deadlines.at(-1)?.dueUtc).toBe('2026-12-02T19:00:00.000Z');
    expect(result.warnings).toEqual([]);
  });

  it('相关行没有 countdown 时跳过并警告，不猜文本时区', () => {
    const result = extractTableDates(`
      <table><tr><th>Paper Submission</th><td>Aug 28, 2026</td><td>23:59 AoE</td></tr></table>
    `);
    expect(result.status).toBe('no_published_dates');
    expect(result.deadlines).toEqual([]);
    expect(result.warnings[0]).toContain('不猜日期');
  });

  it('没有日期表时返回 no_dates_table', () => {
    expect(extractTableDates('<html><body>No dates yet</body></html>').status).toBe('no_dates_table');
  });
});
