import { describe, expect, it } from 'vitest';
import { askVenues, parseAskQuestion } from '../core/ask.ts';
import { loadVenues } from '../core/load.ts';

const venues = loadVenues().map((file) => file.data);
const NOW = Date.parse('2026-10-01T00:00:00Z');

function ask(question: string) {
  return askVenues(venues, question, NOW);
}

describe('自然语言筛选', () => {
  it('识别单个 venue 与届次', () => {
    const result = ask('CVPR 2027 什么时候截止？');
    expect(result.plan.understood).toBe(true);
    expect(result.plan.filters.venueId).toBe('cvpr');
    expect(result.rows.map((row) => row.venue.id)).toEqual(['cvpr']);
    expect(result.rows[0].edition?.year).toBe(2027);
  });

  it('未来三个月 + 还能投 + 会议', () => {
    const result = ask('未来三个月还能投的会议有哪些？');
    expect(result.plan.filters).toMatchObject({ type: 'conference', withinDays: 90, openOnly: true });
    expect(result.rows.map((row) => row.venue.id)).toContain('cvpr');
  });

  it('随时可以投的期刊落到 rolling', () => {
    const result = ask('有没有随时可以投的期刊？');
    expect(result.plan.filters).toMatchObject({ type: 'journal', submissionModel: 'rolling' });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.venue.submission_model === 'rolling')).toBe(true);
  });

  it('CCF-A 被识别，但缺资质数据时会明确说明', () => {
    const result = ask('有哪些 CCF-A 会议？');
    expect(result.plan.filters.qualification).toEqual({ system: 'ccf', level: 'A' });
    expect(result.rows).toEqual([]);
    expect(result.notes.join(' ')).toContain('资质数据');
  });

  it('已截止走 passed，而不是 open', () => {
    const result = ask('已经截止的会议');
    expect(result.plan.filters.states).toEqual(['passed']);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.state === 'passed')).toBe(true);
  });

  it('两周窗口按 14 天计算', () => {
    const result = ask('未来两周内截止的期刊');
    expect(result.plan.filters).toMatchObject({ type: 'journal', withinDays: 14 });
    expect(result.rows).toEqual([]);
  });

  it('英文说法也能识别', () => {
    const result = ask('open conferences within 90 days');
    expect(result.plan.filters).toMatchObject({ type: 'conference', withinDays: 90, openOnly: true });
    expect(result.rows.map((row) => row.venue.id)).toContain('cvpr');
  });

  it('未收录的 venue 明确拒绝，不拿相近名字顶替', () => {
    const result = ask('不存在的会议什么时候截止？');
    expect(result.plan.understood).toBe(false);
    expect(result.plan.unsupported).toContain('未收录');
    expect(result.rows).toEqual([]);
  });

  it('未收录的届次不会回退到其他年份', () => {
    const result = ask('CVPR 2028 什么时候截止？');
    expect(result.plan.understood).toBe(true);
    expect(result.plan.unsupported).toContain('未收录 2028');
    expect(result.rows).toEqual([]);
  });

  it('论文匹配类问题明确说不支持', () => {
    const result = ask('帮我选刊，这篇论文适合投哪里？');
    expect(result.plan.understood).toBe(false);
    expect(result.plan.unsupported).toContain('尚未实现');
  });

  it('空问题与无筛选条件都被拒绝', () => {
    expect(parseAskQuestion('   ', venues).understood).toBe(false);
    const vague = ask('最近怎么样？');
    expect(vague.plan.understood).toBe(false);
    expect(vague.plan.unsupported).toContain('没有识别出');
  });

  it('会议 + 期刊同时出现时不擅自二选一', () => {
    const result = ask('会议和期刊都列出来');
    expect(result.plan.understood).toBe(false);
    expect(result.plan.unsupported).toContain('只能筛选会议或期刊');
  });
});
