import { describe, expect, it } from 'vitest';
import { getDeadlinesForVenue, isDeadlinePassed } from './data';

describe('getDeadlinesForVenue', () => {
  it('cvpr 返回 5 个 deadline', () => {
    expect(getDeadlinesForVenue('cvpr')).toHaveLength(5);
  });

  it('iccv 返回 1 个 deadline', () => {
    expect(getDeadlinesForVenue('iccv')).toHaveLength(1);
  });

  it('不存在的 venue 返回空数组', () => {
    expect(getDeadlinesForVenue('nonexistent')).toEqual([]);
  });
});

describe('isDeadlinePassed', () => {
  it('过去的时间返回 true', () => {
    expect(isDeadlinePassed('2000-01-01T00:00:00')).toBe(true);
  });

  it('未来的时间返回 false', () => {
    expect(isDeadlinePassed('2099-01-01T00:00:00')).toBe(false);
  });
});
