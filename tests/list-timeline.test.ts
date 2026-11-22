import { describe, expect, it } from 'vitest';
import { extractListTimeline } from '../acquire/adapters/list-timeline.ts';

const page = `
  <p>Eurographics 2027 will be hosted in Lucca, Italy, on May 10th-14th, 2027.</p>
  <h4>Timeline</h4>
  <p>All following deadlines are at 23:59 AoE, unless otherwise specified.</p>
  <ul>
    <li><s>[Fri] Sep. 25, 2026: Abstract and submission form deadline</s></li>
    <li><s>[Thu] Oct. 1, 2026: Full paper deadline (extended to <s>Oct. 2, 2026,</s> 00:59 AoE)</s></li>
    <li>[Mon] Nov. 23, 2026: Reviews released</li>
    <li>[Mon] Nov. 30, 2026: Rebuttal due</li>
    <li>[Fri] Dec. 18, 2026: Notification for conditional acceptance or rejection</li>
    <li>[Tue] Jan. 26, 2027: Revised version due</li>
    <li>[Tue] Feb. 9, 2027: Final notification</li>
    <li>[Tue] Feb. 23, 2027: Camera-ready version due</li>
    <li>[Mon] May 10, 2027: EG2027 conference</li>
  </ul>`;

describe('list-timeline', () => {
  it('读取 EG 风格时间线，跳过划掉的旧节点并采纳明确延期', () => {
    const result = extractListTimeline(page);
    expect(result.status).toBe('ok');
    expect(result.deadlines.map((item) => item.label)).toEqual([
      'Full paper deadline',
      'Reviews released',
      'Rebuttal due',
      'Notification for conditional acceptance or rejection',
      'Revised version due',
      'Final notification',
      'Camera-ready version due',
    ]);
    expect(result.deadlines[0]).toMatchObject({
      dueUtc: '2026-10-02T12:59:00.000Z',
      timezone: 'AoE',
      dueSource: 'text',
      kind: 'paper',
    });
    expect(result.deadlines[1].dueUtc).toBe('2026-11-24T11:59:00.000Z');
    expect(result.deadlines[4].kind).toBe('paper');
    expect(result.deadlines[6].kind).toBe('camera_ready');
    expect(result.editionDates).toEqual({ start: '2027-05-10', end: '2027-05-14' });
  });

  it('没有页面级 AoE 声明时拒绝无时区节点，划掉的节点仍跳过', () => {
    const result = extractListTimeline(`
      <ul>
        <li><s>Sep. 25, 2026: Abstract and submission form deadline</s></li>
        <li>Nov. 23, 2026: Reviews released</li>
      </ul>
    `);
    expect(result.status).toBe('no_published_dates');
    expect(result.deadlines).toEqual([]);
    expect(result.warnings.join(' ')).toContain('统一 AoE 声明');
  });
});
