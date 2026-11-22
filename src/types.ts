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

export interface ShelfPack {
  id: string;
  name_zh: string;
  name_en: string;
  tier: 'core' | 'community' | 'local';
  tagline_zh: string | null;
  description_zh: string | null;
  venue_ids: string[];
}

export interface ShelfChangeValue {
  due: string;
  timezone: string;
  due_utc?: string;
  raw_text: string;
  status: string;
}

export interface ShelfChange {
  id: string;
  detected_at: string;
  venue_id: string;
  edition_id: string;
  deadline_id: string;
  change: 'added' | 'changed' | 'removed';
  deadline_kind: string;
  label?: string;
  before: ShelfChangeValue | null;
  after: ShelfChangeValue | null;
  evidence: ShelfEvidence & { snapshot_hash?: string };
}

export interface ShelfBundle {
  generated_at: string | null;
  /** 默认 pack 的兼容视图。 */
  field: { id: string; name_zh: string; name_en: string };
  venues: ShelfVenue[];
  packs: ShelfPack[];
  all_venues: ShelfVenue[];
  changes: ShelfChange[];
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
