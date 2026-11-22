import { describe, expect, it } from 'vitest';
import { extractSiggraphWidget, parseSiggraphWidgetTime } from '../acquire/adapters/siggraph-widget.ts';
import { htmlToText, snapshotContainsQuote } from '../acquire/snapshot.ts';
import { editionUrlFromDatesUrl, yearFromDatesUrl } from '../acquire/edition.ts';
import { inferAdapter } from '../core/add-venue.ts';

function entry(label: string, original: string, formatted: string): string {
  return `<div class="widget-entry"><h4 class="h6">${label}</h4>
    <span class="formatted-original-time hidden">${formatted}</span>
    <span class="original-time hidden">${original}</span></div>`;
}

const page = `<div class="widget widget-submission-deadlines">
  ${entry('Submissions Form & Conflicts', '2027-01-21 22:00', 'Thu, 21 Jan 2027 22:00 +00:00')}
  ${entry('Paper Deadline', '2027-01-28 22:00', 'Thu, 28 Jan 2027 22:00 +00:00')}
  ${entry('Upload Deadline', '2027-01-29 22:00', 'Fri, 29 Jan 2027 22:00 +00:00')}
  ${entry('Workshop Deadline', '2027-02-01 22:00', 'Mon, 01 Feb 2027 22:00 +00:00')}
</div><p>Conference – 8–12 AUG 2027</p>`;

describe('SIGGRAPH submission-deadlines widget', () => {
  it('抽取机器时间并排除卫星活动', () => {
    const result = extractSiggraphWidget(page);
    expect(result.status).toBe('ok');
    expect(result.editionDates).toEqual({ start: '2027-08-08', end: '2027-08-12' });
    expect(result.deadlines.map((deadline) => [deadline.kind, deadline.dueUtc, deadline.timezone])).toEqual([
      ['abstract', '2027-01-21T22:00:00.000Z', 'UTC'],
      ['paper', '2027-01-28T22:00:00.000Z', 'UTC'],
      ['paper', '2027-01-29T22:00:00.000Z', 'UTC'],
    ]);
    expect(result.deadlines.every((deadline) => deadline.dueSource === 'timestamp')).toBe(true);
    const snapshot = htmlToText(page);
    for (const deadline of result.deadlines) expect(snapshotContainsQuote(snapshot, deadline.rawText)).toBe(true);
  });

  it('机器字段不一致或非 UTC 时不猜时间', () => {
    expect(parseSiggraphWidgetTime('2027-01-28 23:00', 'Thu, 28 Jan 2027 22:00 +00:00')).toBeNull();
    expect(parseSiggraphWidgetTime('2027-01-28 22:00', 'Thu, 28 Jan 2027 22:00 -08:00')).toBeNull();
    const result = extractSiggraphWidget(`<div class="widget-submission-deadlines">
      ${entry('Paper Deadline', '2027-01-28 23:00', 'Thu, 28 Jan 2027 22:00 +00:00')}</div>`);
    expect(result).toMatchObject({ status: 'no_published_dates', deadlines: [] });
    expect(result.warnings[0]).toContain('缺少一致的 UTC 机器时间');
  });

  it('没有 widget 时明确报告无适配结构', () => {
    expect(extractSiggraphWidget('<p>To be announced</p>').status).toBe('no_dates_table');
  });

  it('识别当届域名、年份和 edition URL', () => {
    const url = 'https://s2027.siggraph.org/program/technical-papers/';
    expect(inferAdapter(url)).toBe('siggraph-widget');
    expect(yearFromDatesUrl(url)).toBe(2027);
    expect(editionUrlFromDatesUrl(url)).toBe('https://s2027.siggraph.org');
  });
});
