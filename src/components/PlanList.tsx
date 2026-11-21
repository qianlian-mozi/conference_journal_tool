import type { SubmissionPlan } from '../types';
import { getPlanProgress } from '../lib/planner';
import { buildPlanIcs } from '../lib/ics';
import { getVenueById } from '../data';

interface PlanListProps {
  plans: SubmissionPlan[];
  onToggleMilestone: (planId: string, milestoneId: string) => void;
  onDelete: (planId: string) => void;
}

function downloadIcs(plan: SubmissionPlan, venueName: string) {
  const ics = buildPlanIcs(plan, venueName);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${plan.id}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PlanList({ plans, onToggleMilestone, onDelete }: PlanListProps) {
  if (plans.length === 0) {
    return <p className="empty">还没有投稿计划。选择一个会议开始制定。</p>;
  }

  const sorted = [...plans].sort(
    (a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime(),
  );

  return (
    <ul className="plan-list">
      {sorted.map((plan) => {
        const progress = getPlanProgress(plan);
        const venueName = getVenueById(plan.venueId)?.short_name ?? plan.venueId;
        return (
          <li key={plan.id} className="plan-card">
            <div className="plan-head">
              <div>
                <h3>{plan.title}</h3>
                <p className="plan-meta">
                  {venueName} · 目标 {plan.deadlineAt.replace('T', ' ')}
                </p>
              </div>
              <div className="plan-actions">
                <button className="ghost" onClick={() => downloadIcs(plan, venueName)}>
                  导出 ICS
                </button>
                <button
                  className="ghost danger"
                  onClick={() => {
                    if (window.confirm(`确定删除计划「${plan.title}」吗？`)) {
                      onDelete(plan.id);
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>

            <div className="progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.percentage}%` }} />
              </div>
              <span className="progress-text">
                {progress.completed}/{progress.total} · {progress.percentage}%
              </span>
            </div>

            <ul className="milestone-list">
              {plan.milestones.map((milestone) => (
                <li key={milestone.id} className={milestone.completed ? 'done' : ''}>
                  <label className="milestone-row">
                    <input
                      type="checkbox"
                      checked={milestone.completed}
                      onChange={() => onToggleMilestone(plan.id, milestone.id)}
                    />
                    <span className="milestone-title">{milestone.title}</span>
                    <span className="milestone-date">
                      {milestone.dueAt.replace('T', ' ')}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
