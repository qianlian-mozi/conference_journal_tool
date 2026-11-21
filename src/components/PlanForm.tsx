import { useState } from 'react';
import type { Venue } from '../types';
import { createSubmissionPlan } from '../lib/planner';

interface PlanFormProps {
  venue: Venue;
  onSubmit: (plan: ReturnType<typeof createSubmissionPlan>) => void;
  onCancel: () => void;
}

export function PlanForm({ venue, onSubmit, onCancel }: PlanFormProps) {
  const [title, setTitle] = useState(`投稿 ${venue.short_name}`);
  const [deadlineAt, setDeadlineAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!deadlineAt) {
      setError('请选择目标截止日期。');
      return;
    }
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const plan = createSubmissionPlan({
        venueId: venue.id,
        title,
        deadlineAt,
        timezone,
        notes,
      });
      onSubmit(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建计划失败，请重试。');
    }
  }

  return (
    <section className="section" role="dialog" aria-modal="true" aria-label="新建投稿计划">
      <h2>新建投稿计划</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          关联会议/期刊
          <input type="text" value={venue.short_name} disabled />
        </label>
        <label>
          计划标题
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label>
          目标截止日期
          <input
            type="datetime-local"
            value={deadlineAt}
            onChange={(event) => setDeadlineAt(event.target.value)}
            required
          />
        </label>
        <label>
          备注（可选）
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="primary">
            生成计划
          </button>
        </div>
      </form>
    </section>
  );
}
