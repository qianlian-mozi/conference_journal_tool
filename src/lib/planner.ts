import type { PlanMilestone, PlanProgress, SubmissionPlan } from '../types';

const MILESTONE_OFFSETS = [56, 42, 28, 14, 3, 0];

const MILESTONE_TITLES = [
  '确定选题与目标会议',
  '完成初稿与研究设计',
  '完成主体内容与实验',
  '完成投稿草稿',
  '内部校对与定稿',
  '投稿截止',
];

function makeId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function toLocalIso(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export interface CreatePlanInput {
  venueId: string;
  title: string;
  deadlineAt: string;
  timezone: string;
  notes?: string;
}

export function createSubmissionPlan(input: CreatePlanInput): SubmissionPlan {
  const deadline = new Date(input.deadlineAt);
  if (Number.isNaN(deadline.getTime())) {
    throw new Error('目标截止日期无效，请提供合法的日期时间。');
  }

  const milestones: PlanMilestone[] = MILESTONE_OFFSETS.map((offsetDays, index) => {
    const due = new Date(deadline.getTime() - offsetDays * 24 * 60 * 60 * 1000);
    return {
      id: makeId('ms'),
      title: MILESTONE_TITLES[index],
      offsetDays,
      dueAt: toLocalIso(due),
      completed: false,
    };
  });

  return {
    id: makeId('plan'),
    venueId: input.venueId,
    title: input.title.trim() || '未命名投稿计划',
    deadlineAt: toLocalIso(deadline),
    timezone: input.timezone,
    notes: input.notes ?? '',
    milestones,
    createdAt: new Date().toISOString(),
  };
}

export function getPlanProgress(plan: SubmissionPlan): PlanProgress {
  const total = plan.milestones.length;
  const completed = plan.milestones.filter((milestone) => milestone.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percentage };
}
