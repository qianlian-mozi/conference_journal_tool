import { describe, expect, it } from 'vitest';
import { extractSectionDates } from '../acquire/adapters/section-dates.ts';

const icprFixture = `
<html><body>
  <h1>Lyon, France August, 17-22, 2026</h1>
  <h2>Main conference</h2>
  <p>Paper submission : January 10, 2026 AoE (UTC-12)</p>
  <p>Author notification : March 31, 2026</p>
  <p>Camera-ready uploading to Springer : May 4, 2026 – no extension</p>
  <h2>Workshop proposal</h2>
  <p>Paper submission : June 1, 2026 AoE</p>
</body></html>`;

describe('section-dates 主会区块', () => {
  it('只接收行内显式 AoE，并保留其余无时区节点为警告', () => {
    const result = extractSectionDates(icprFixture);
    expect(result.status).toBe('ok');
    expect(result.editionDates).toEqual({ start: '2026-08-17', end: '2026-08-22' });
    expect(result.deadlines).toHaveLength(1);
    expect(result.deadlines[0]).toMatchObject({
      label: 'Paper submission',
      rawText: 'Paper submission : January 10, 2026 AoE (UTC-12)',
      dueUtc: '2026-01-11T11:59:59.000Z',
      timezone: 'AoE',
      dueSource: 'text',
      kind: 'paper',
      key: 'paper-submission',
    });
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join('\n')).toContain('Author notification');
    expect(result.warnings.join('\n')).toContain('Camera-ready');
  });

  it('没有显式 AoE 时不猜 23:59，也不读取卫星区块', () => {
    const result = extractSectionDates(`
      <h2>Main conference</h2><p>Paper submission : January 10, 2026</p>
      <h2>Workshop proposal</h2><p>Paper submission : June 1, 2026 AoE</p>`);
    expect(result.status).toBe('no_published_dates');
    expect(result.deadlines).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('没有主会区块或日期非法时拒绝生成日期', () => {
    expect(extractSectionDates('<h1>Important Dates</h1>').status).toBe('no_dates_table');
    const invalid = extractSectionDates(
      '<h2>Main conference</h2><p>Paper submission : February 30, 2026 AoE</p>',
    );
    expect(invalid.status).toBe('no_published_dates');
    expect(invalid.deadlines).toEqual([]);
  });
});
