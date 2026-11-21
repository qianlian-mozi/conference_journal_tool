import { describe, expect, it } from 'vitest';
import { buildPlanIcs } from './ics';
import { createSubmissionPlan } from './planner';

describe('buildPlanIcs', () => {
  it('生成合法 VCALENDAR 与 VEVENT', () => {
    const plan = createSubmissionPlan({
      venueId: 'cvpr',
      title: '测试计划',
      deadlineAt: '2027-03-15T23:59',
      timezone: 'Asia/Shanghai',
    });
    const ics = buildPlanIcs(plan, 'CVPR');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('使用 CRLF 换行', () => {
    const plan = createSubmissionPlan({
      venueId: 'cvpr',
      title: '测试',
      deadlineAt: '2027-03-15T23:59',
      timezone: 'Asia/Shanghai',
    });
    const ics = buildPlanIcs(plan, 'CVPR');
    expect(ics).toContain('\r\n');
    expect(ics).not.toContain('\n\n');
  });

  it('每个里程碑生成一个 VEVENT', () => {
    const plan = createSubmissionPlan({
      venueId: 'cvpr',
      title: '测试',
      deadlineAt: '2027-03-15T23:59',
      timezone: 'Asia/Shanghai',
    });
    const ics = buildPlanIcs(plan, 'CVPR');
    const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(events).toBe(6);
  });

  it('正确转义逗号、分号和换行', () => {
    const plan = createSubmissionPlan({
      venueId: 'cvpr',
      title: '标题,含逗号;和分号\n和换行',
      deadlineAt: '2027-03-15T23:59',
      timezone: 'Asia/Shanghai',
    });
    const ics = buildPlanIcs(plan, 'CVPR');
    expect(ics).toContain('标题\\,含逗号\\;和分号\\n和换行');
  });
});
