import { describe, expect, it } from 'vitest';
import { createSubmissionPlan, getPlanProgress } from './planner';

function makeInput(overrides: Partial<Parameters<typeof createSubmissionPlan>[0]> = {}) {
  return {
    venueId: 'cvpr',
    title: '测试投稿计划',
    deadlineAt: '2027-03-15T23:59',
    timezone: 'Asia/Shanghai',
    notes: '',
    ...overrides,
  };
}

describe('createSubmissionPlan', () => {
  it('生成六个里程碑', () => {
    const plan = createSubmissionPlan(makeInput());
    expect(plan.milestones).toHaveLength(6);
  });

  it('偏移天数依次为 56/42/28/14/3/0', () => {
    const plan = createSubmissionPlan(makeInput());
    expect(plan.milestones.map((m) => m.offsetDays)).toEqual([56, 42, 28, 14, 3, 0]);
  });

  it('里程碑日期按偏移正确前推', () => {
    const plan = createSubmissionPlan(makeInput({ deadlineAt: '2027-03-15T23:59' }));
    const deadline = new Date('2027-03-15T23:59');
    plan.milestones.forEach((m) => {
      const expected = new Date(deadline.getTime() - m.offsetDays * 24 * 60 * 60 * 1000);
      const actual = new Date(m.dueAt);
      expect(actual.getTime()).toBe(expected.getTime());
    });
  });

  it('无效日期抛出可读错误', () => {
    expect(() => createSubmissionPlan(makeInput({ deadlineAt: 'not-a-date' }))).toThrow(/无效/);
  });
});

describe('getPlanProgress', () => {
  it('计算总进度', () => {
    const plan = createSubmissionPlan(makeInput());
    plan.milestones[0].completed = true;
    plan.milestones[1].completed = true;
    const progress = getPlanProgress(plan);
    expect(progress.total).toBe(6);
    expect(progress.completed).toBe(2);
    expect(progress.percentage).toBe(33);
  });

  it('空里程碑时百分比为 0', () => {
    const plan = createSubmissionPlan(makeInput());
    plan.milestones = [];
    expect(getPlanProgress(plan).percentage).toBe(0);
  });

  it('全部完成时百分比为 100', () => {
    const plan = createSubmissionPlan(makeInput());
    plan.milestones.forEach((m) => (m.completed = true));
    expect(getPlanProgress(plan).percentage).toBe(100);
  });
});
