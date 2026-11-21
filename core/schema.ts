/**
 * 数据契约 v2。
 *
 * 一条硬规则贯穿全文：任何会被展示给用户的日期，都必须带 evidence.quote，
 * 且该 quote 必须能在对应快照里逐字命中（由 cmd/validate.ts 强制）。
 * 模型与人都可以改数据，但改不出「没有出处」的日期。
 */
import { z } from 'zod';

const HTTPS_URL_RE = /^https:\/\/[^\s"'<>]+$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export const httpsUrl = z
  .string()
  .regex(HTTPS_URL_RE, '必须是以 https:// 开头的 URL');
export const isoDate = z.string().regex(ISO_DATE_RE, '日期必须是 YYYY-MM-DD');
export const localIso = z
  .string()
  .regex(LOCAL_ISO_RE, '本地时间必须是 YYYY-MM-DDTHH:mm[:ss]');
export const sha256 = z.string().regex(SHA256_RE, '必须是 64 位小写十六进制 sha256');
export const slugId = z.string().regex(ID_RE, 'id 只允许小写字母、数字和连字符');

export const EvidenceSchema = z.object({
  url: httpsUrl,
  quote: z.string().min(1, 'quote 不能为空').optional(),
  fetched_at: isoDate,
  snapshot_hash: sha256.optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** 截止日期必须带 quote —— 这是「无出处不入库」的落点。 */
export const DeadlineEvidenceSchema = EvidenceSchema.extend({
  quote: z.string().min(1, '截止日期必须带官网原文 quote'),
});

export const DeadlineKindSchema = z.enum([
  'abstract',
  'registration',
  'paper',
  'supplement',
  'rebuttal',
  'camera_ready',
  'notification',
  'other',
]);
export type DeadlineKind = z.infer<typeof DeadlineKindSchema>;

export const DeadlineStatusSchema = z.enum([
  'confirmed',
  'tentative',
  'extended',
  'cancelled',
]);
export type DeadlineStatus = z.infer<typeof DeadlineStatusSchema>;

export const DeadlineSchema = z
  .object({
    id: slugId,
    kind: DeadlineKindSchema,
    label: z.string().min(1).optional(),
    raw_text: z.string().min(3, 'raw_text 必须是官网原文片段'),
    due: localIso,
    timezone: z.string().min(1),
    due_utc: z.string().datetime({ offset: true }).optional(),
    /** timestamp = 页面内嵌倒计时时间戳；text = 从页面文本解析 */
    due_source: z.enum(['timestamp', 'text']).default('timestamp'),
    status: DeadlineStatusSchema,
    tentative_reason: z.string().min(1).optional(),
    evidence: DeadlineEvidenceSchema,
  })
  .refine((value) => value.status !== 'tentative' || Boolean(value.tentative_reason), {
    message: 'status 为 tentative 时必须说明 tentative_reason',
    path: ['tentative_reason'],
  });
export type Deadline = z.infer<typeof DeadlineSchema>;

export const EditionSchema = z.object({
  id: slugId,
  year: z.number().int().min(2000).max(2100),
  label: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  dates: z
    .object({ start: isoDate, end: isoDate })
    .refine((value) => value.start <= value.end, {
      message: 'dates.start 不能晚于 dates.end',
      path: ['end'],
    })
    .optional(),
  official_url: httpsUrl,
  evidence: z.array(EvidenceSchema).default([]),
  deadlines: z.array(DeadlineSchema).default([]),
});
export type Edition = z.infer<typeof EditionSchema>;

export const QualificationSchema = z.object({
  system: z.string().min(1),
  level: z.string().min(1),
  year: z.number().int().min(1990).max(2100),
  evidence: EvidenceSchema,
});
export type Qualification = z.infer<typeof QualificationSchema>;

export const ReviewInfoSchema = z.object({
  model: z.string().min(1),
  evidence: EvidenceSchema,
});

export const ScopeSchema = z.object({
  summary_zh: z.string().min(1),
  keywords: z.array(z.string().min(1)).default([]),
  evidence: EvidenceSchema,
});

export const VenueSchema = z.object({
  schema_version: z.literal(2),
  id: slugId,
  type: z.enum(['conference', 'journal']),
  names: z.object({
    short: z.string().min(1),
    full: z.string().min(1),
  }),
  field_ids: z.array(slugId).min(1, '至少归属一个领域'),
  official_url: httpsUrl,
  publisher: z.string().min(1).optional(),
  submission_model: z.enum(['fixed', 'rolling']),
  scope: ScopeSchema.optional(),
  qualifications: z.array(QualificationSchema).default([]),
  review: ReviewInfoSchema.optional(),
  editions: z.array(EditionSchema).default([]),
});
export type Venue = z.infer<typeof VenueSchema>;

export const FieldPackSchema = z.object({
  schema_version: z.literal(2),
  id: slugId,
  slug: slugId,
  names: z.object({ zh: z.string().min(1), en: z.string().min(1) }),
  status: z.enum(['active', 'planned']),
  description_zh: z.string().min(1).optional(),
  qualification_systems: z.array(z.string().min(1)).default([]),
});
export type FieldPack = z.infer<typeof FieldPackSchema>;

export const SourcePageSchema = z.object({
  role: z.enum(['dates', 'cfp', 'home']),
  url: httpsUrl,
});

export const SourceEntrySchema = z.object({
  venue_id: slugId,
  adapter: z.enum(['thecvf', 'manual']),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'manual']),
  pages: z.array(SourcePageSchema).min(1),
  cross_check: z.array(httpsUrl).default([]),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export const SourceRegistrySchema = z.object({
  schema_version: z.literal(2),
  sources: z.array(SourceEntrySchema),
});
