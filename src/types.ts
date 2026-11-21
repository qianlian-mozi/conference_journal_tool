export type VenueType = 'conference' | 'journal';
export type SubmissionModel = 'fixed' | 'rolling';

export interface ShelfEvidence {
  url: string;
  quote: string | null;
  fetched_at: string;
}

export interface ShelfDeadline {
  id: string;
  kind: string;
  label: string | null;
  due: string;
  timezone: string;
  due_utc: string | null;
  due_source: 'timestamp' | 'text';
  status: string;
  evidence: ShelfEvidence;
}

export interface ShelfEdition {
  id: string;
  year: number;
  label: string | null;
  location: string | null;
  dates: { start: string; end: string } | null;
  official_url: string;
  deadlines: ShelfDeadline[];
}

export interface ShelfQualification {
  system: string;
  level: string;
  year: number;
}

export interface ShelfVenue {
  id: string;
  type: VenueType;
  short: string;
  full: string;
  official_url: string;
  publisher: string | null;
  submission_model: SubmissionModel;
  qualifications: ShelfQualification[];
  editions: ShelfEdition[];
}

export interface ShelfBundle {
  generated_at: string;
  field: { id: string; name_zh: string; name_en: string };
  venues: ShelfVenue[];
}

// ---- 旧的投稿计划类型：仍被 src/lib/planner.ts 与 ics.ts 使用 ----

export interface PlanMilestone {
  id: string;
  title: string;
  offsetDays: number;
  dueAt: string;
  completed: boolean;
}

export interface SubmissionPlan {
  id: string;
  venueId: string;
  title: string;
  deadlineAt: string;
  timezone: string;
  notes: string;
  milestones: PlanMilestone[];
  createdAt: string;
}

export interface PlanProgress {
  total: number;
  completed: number;
  percentage: number;
}
