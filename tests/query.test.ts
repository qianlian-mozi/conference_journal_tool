import { describe, expect, it } from 'vitest';
import { loadVenues } from '../core/load.ts';
import { daysLeft, queryVenues, submitDeadline, toAgentJson } from '../core/query.ts';
import { parseQueryArgs } from '../cmd/query-args.ts';
import { handleMessage } from '../mcp/protocol.ts';
import { callTool } from '../mcp/tools.ts';

const venues = loadVenues().map((file) => file.data);

describe('Agent JSON 契约', () => {
  it('保留全部届次及原始证据，而不是只返回最新届次', () => {
    const venue = structuredClone(venues.find((item) => item.id === 'cvpr')!);
    const previous = structuredClone(venue.editions[0]);
    previous.id = 'cvpr-2026';
    previous.title = 'CVPR 2026';
    previous.year = 2026;
    venue.editions.push(previous);

    const [result] = toAgentJson(queryVenues([venue]));
    expect(result.editions).toHaveLength(2);
    expect(result.editions).toEqual(venue.editions);
    expect(result.editions[0].deadlines[0].evidence.quote).toBeTruthy();
    expect(result.next?.deadline_id).toBe('cvpr-2027-submission-deadline');
  });

  it('rolling 期刊没有 next，也不会被编造截止日期', () => {
    const [result] = toAgentJson(queryVenues(venues, { type: 'journal', venueId: 'tpami' }));
    expect(result.id).toBe('tpami');
    expect(result.submission_model).toBe('rolling');
    expect(result.next).toBeNull();
    expect(result.state).toBe('rolling');
  });
});

describe('MCP 工具契约', () => {
  it('get_venue 返回完整 venue 与全部届次', () => {
    const expected = venues.find((item) => item.id === 'cvpr')!;
    const result = callTool('get_venue', { id: 'cvpr' });
    expect(result.editions).toEqual(expected.editions);
    expect(result.qualifications).toEqual(expected.qualifications);
  });

  it('get_deadlines 平铺所有届次并保留 evidence', () => {
    const expectedCount = venues.reduce(
      (count, venue) => count + venue.editions.reduce((sum, edition) => sum + edition.deadlines.length, 0),
      0,
    );
    const result = callTool('get_deadlines', {});
    expect(result).toHaveLength(expectedCount);
    expect(result.every((item) => item.evidence.url && item.evidence.quote && item.evidence.fetched_at)).toBe(true);
  });

  it('get_deadlines 不为 rolling 期刊生成条目', () => {
    expect(callTool('get_deadlines', { venue_id: 'tpami' })).toEqual([]);
  });
});

describe('截止状态与筛选边界', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const cvpr = venues.find((item) => item.id === 'cvpr')!;
  const deadline = cvpr.editions[0].deadlines.find((item) => item.kind === 'paper')!;

  it('截止后不足 24 小时也是 passed，而不是负零造成的 soon', () => {
    const expired = { ...deadline, due_utc: '2026-11-21T11:00:00.000Z' };
    expect(daysLeft(expired, now)).toBe(-1);
    const venue = { ...cvpr, editions: [{ ...cvpr.editions[0], deadlines: [expired] }] };
    expect(queryVenues([venue], { openOnly: true }, now)).toHaveLength(0);
    expect(queryVenues([venue], { withinDays: 1 }, now)).toHaveLength(0);
  });

  it('多轮 paper 选择最近的未来轮次，并忽略 cancelled', () => {
    const past = { ...deadline, id: 'round-1', due_utc: '2026-11-20T11:00:00.000Z' };
    const future = { ...deadline, id: 'round-2', due_utc: '2026-11-25T11:00:00.000Z' };
    const venue = { ...cvpr, editions: [{ ...cvpr.editions[0], deadlines: [past, future] }] };
    expect(submitDeadline(venue, now)?.deadline.id).toBe('round-2');
    expect(queryVenues([venue], { openOnly: true }, now)).toHaveLength(1);

    const cancelled = { ...future, status: 'cancelled' as const };
    const cancelledOnly = { ...cvpr, editions: [{ ...cvpr.editions[0], deadlines: [cancelled] }] };
    expect(submitDeadline(cancelledOnly, now)).toBeNull();
  });

  it('无投稿节点时回退到最近的未来节点，而不是最早的过去节点', () => {
    const past = { ...deadline, id: 'past', kind: 'other' as const, due_utc: '2026-11-20T11:00:00.000Z' };
    const future = { ...deadline, id: 'future', kind: 'notification' as const, due_utc: '2026-11-25T11:00:00.000Z' };
    const venue = { ...cvpr, editions: [{ ...cvpr.editions[0], deadlines: [past, future] }] };
    expect(submitDeadline(venue, now)?.deadline.id).toBe('future');
  });

  it('小数时间窗按真实时间差过滤', () => {
    const soon = { ...deadline, due_utc: '2026-11-21T18:00:00.000Z' };
    const venue = { ...cvpr, editions: [{ ...cvpr.editions[0], deadlines: [soon] }] };
    expect(daysLeft(soon, now)).toBe(1);
    expect(queryVenues([venue], { withinDays: 0.5 }, now)).toHaveLength(1);
    expect(queryVenues([venue], { withinDays: 0.1 }, now)).toHaveLength(0);
  });

  it('rolling 期刊即使收到异常数据也不产生 next 或天数', () => {
    const future = { ...deadline, due_utc: '2026-11-30T11:00:00.000Z' };
    const journal = {
      ...venues.find((item) => item.id === 'tpami')!,
      editions: [{ ...cvpr.editions[0], deadlines: [future] }],
    };
    const rows = queryVenues([journal], { withinDays: 30 }, now);
    expect(rows).toHaveLength(0);
    expect(toAgentJson(queryVenues([journal], {}, now))[0].next).toBeNull();
  });
});

describe('CLI 参数', () => {
  it.each([['--within'], ['--within='], ['--type'], ['--field='], ['--venue'], ['--wat']])(
    '拒绝缺失值或未知参数：%s',
    (arg) => expect(() => parseQueryArgs([arg])).toThrow(),
  );

  it('拒绝负数、非数字和非法类型', () => {
    expect(() => parseQueryArgs(['--within', '-1'])).toThrow('非负数字');
    expect(() => parseQueryArgs(['--within=NaN'])).toThrow('非负数字');
    expect(() => parseQueryArgs(['--within', '   '])).toThrow('非空值');
    expect(() => parseQueryArgs(['--field', '   '])).toThrow('非空值');
    expect(() => parseQueryArgs(['--type', 'magazine'])).toThrow('conference');
  });

  it('支持小数窗口与等号参数', () => {
    expect(parseQueryArgs(['--within=0.5', '--type=journal', '--json'])).toMatchObject({
      within: 0.5,
      type: 'journal',
      json: true,
    });
  });
});

describe('MCP JSON-RPC 边界', () => {
  it.each([[null], [{ jsonrpc: '2.0', id: 7 }], [[]]])('非法消息返回 -32600：%o', (message) => {
    expect(handleMessage(message)).toMatchObject({ id: null, error: { code: -32600 } });
  });

  it('notification 不产生响应', () => {
    expect(handleMessage({ jsonrpc: '2.0', method: 'tools/list' })).toBeNull();
    expect(handleMessage({ jsonrpc: '2.0', method: 'unknown' })).toBeNull();
  });

  it('未知工具是 -32602，未知方法是 -32601', () => {
    expect(
      handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'not_a_tool' } }),
    ).toMatchObject({ error: { code: -32602 } });
    expect(handleMessage({ jsonrpc: '2.0', id: 2, method: 'not_a_method' })).toMatchObject({
      error: { code: -32601 },
    });
  });
});
