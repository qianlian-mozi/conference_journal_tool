import { useCallback, useEffect, useState } from 'react';
import type { SubmissionPlan } from '../types';

const STORAGE_KEY = 'cv-submission-plans:v1';

function loadPlans(): SubmissionPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is SubmissionPlan =>
        item && typeof item === 'object' && Array.isArray(item.milestones),
    );
  } catch {
    return [];
  }
}

export function useSubmissionPlans() {
  const [plans, setPlans] = useState<SubmissionPlan[]>(() => loadPlans());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
    } catch {
      // 存储不可用时静默降级，不阻断使用
    }
  }, [plans]);

  const addPlan = useCallback((plan: SubmissionPlan) => {
    setPlans((prev) => [plan, ...prev]);
  }, []);

  const removePlan = useCallback((id: string) => {
    setPlans((prev) => prev.filter((plan) => plan.id !== id));
  }, []);

  const toggleMilestone = useCallback((planId: string, milestoneId: string) => {
    setPlans((prev) =>
      prev.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              milestones: plan.milestones.map((milestone) =>
                milestone.id === milestoneId
                  ? { ...milestone, completed: !milestone.completed }
                  : milestone,
              ),
            }
          : plan,
      ),
    );
  }, []);

  return { plans, addPlan, removePlan, toggleMilestone };
}
