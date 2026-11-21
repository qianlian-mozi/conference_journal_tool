export type FieldStatus = 'active' | 'planned';

export interface Field {
  schema_version: number;
  id: string;
  slug: string;
  name_zh: string;
  name_en: string;
  status: FieldStatus;
}

export type VenueType = 'conference' | 'journal';

export interface Evidence {
  url: string;
  last_verified_at: string;
}

export interface Venue {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  type: VenueType;
  official_url: string;
  field_ids: string[];
  evidence: Evidence[];
}

export type DeadlineKind =
  | 'abstract'
  | 'paper'
  | 'supplement'
  | 'rebuttal'
  | 'camera_ready'
  | 'notification'
  | 'other';

export type DeadlineStatus = 'tentative' | 'scheduled' | 'extended' | 'cancelled';

export interface VenueEdition {
  id: string;
  venue_id: string;
  year: number;
  label: string;
  official_url: string;
  evidence: Evidence[];
}

export interface Deadline {
  id: string;
  edition_id: string;
  kind: DeadlineKind;
  raw_text: string;
  due_local: string;
  timezone: string;
  status: DeadlineStatus;
  evidence: Evidence[];
}

export interface ScheduleDocument {
  schema_version: number;
  field_id: string;
  editions: VenueEdition[];
  deadlines: Deadline[];
}

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
