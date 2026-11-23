/**
 * 把 changelog 里的真实 diff 翻译成可审计的中文句子。
 *
 * 这里不调用模型，也不补充 changelog 之外的事实：每条摘要都保留记录 id 与
 * evidence，只陈述 before/after 中实际存在的日期、时区和状态。
 */
export const DAY_MS = 86_400_000;

export type ChangeKind = 'added' | 'changed' | 'removed';

export interface SummaryChangeValue {
  due: string;
  timezone: string;
  due_utc?: string;
  raw_text: string;
  status: string;
}

export interface SummaryChange {
  id: string;
  detected_at: string;
  venue_id: string;
  edition_id: string;
  deadline_id: string;
  change: ChangeKind;
  deadline_kind: string;
  label?: string;
  before: SummaryChangeValue | null;
  after: SummaryChangeValue | null;
  evidence: {
    url: string;
    quote?: string | null;
    fetched_at: string;
    snapshot_hash?: string;
  };
}

export interface ChangeSummary {
  id: string;
  venue_id: string;
  edition_id: string;
  deadline_id: string;
  change: ChangeKind;
  detected_at: string;
  text: string;
  evidence: SummaryChange['evidence'];
}

export interface SummaryWindowOptions {
  now?: number;
  days?: number;
  venueIds?: Iterable<string> | null;
}

const KIND_LABELS: Record<string, string> = {
  abstract: '摘要截止',
  registration: '注册截止',
  paper: '论文截止',
  supplement: '补充材料截止',
  rebuttal: '反驳截止',
  camera_ready: '终稿截止',
  notification: '结果通知',
  other: '其他节点',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: '已确认',
  tentative: '待确认',
  extended: '已延期',
  cancelled: '已取消',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** 展示官网本地时间；due_utc 只放在结构化字段里，不在这里重新换算。 */
function formatValue(value: SummaryChangeValue): string {
  return `${value.due.replace('T', ' ').slice(0, 16)} ${value.timezone}`;
}

function labelOf(entry: SummaryChange): string {
  return entry.label ?? KIND_LABELS[entry.deadline_kind] ?? entry.deadline_id;
}

function dateChanged(before: SummaryChangeValue, after: SummaryChangeValue): boolean {
  return (
    before.due !== after.due ||
    before.timezone !== after.timezone ||
    before.due_utc !== after.due_utc
  );
}

/**
 * 单条 diff → 一句事实描述。
 *
 * venueNames 由调用方从数据加载，避免为了一个名称把整个 schema 拉进前端 bundle。
 */
export function summarizeChange(
  entry: SummaryChange,
  venueNames: ReadonlyMap<string, string>,
): ChangeSummary {
  const venue = venueNames.get(entry.venue_id) ?? entry.venue_id;
  const label = labelOf(entry);
  let text: string;

  if (entry.change === 'added') {
    if (!entry.after) throw new Error(`changelog ${entry.id}: added 缺少 after`);
    text = `${venue} 新增「${label}」：${formatValue(entry.after)}`;
  } else if (entry.change === 'removed') {
    if (!entry.before) throw new Error(`changelog ${entry.id}: removed 缺少 before`);
    text = `${venue} 移除「${label}」：原为 ${formatValue(entry.before)}`;
  } else {
    if (!entry.before || !entry.after) throw new Error(`changelog ${entry.id}: changed 缺少 before/after`);
    if (dateChanged(entry.before, entry.after)) {
      text = `${venue} 的「${label}」从 ${formatValue(entry.before)} 改为 ${formatValue(entry.after)}`;
      if (entry.before.status !== entry.after.status) {
        text += `，状态从${statusLabel(entry.before.status)}改为${statusLabel(entry.after.status)}`;
      }
    } else if (entry.before.status !== entry.after.status) {
      text = `${venue} 的「${label}」状态从${statusLabel(entry.before.status)}改为${statusLabel(entry.after.status)}`;
    } else {
      text = `${venue} 的「${label}」官网原文已更新，日期与状态未变`;
    }
  }

  return {
    id: entry.id,
    venue_id: entry.venue_id,
    edition_id: entry.edition_id,
    deadline_id: entry.deadline_id,
    change: entry.change,
    detected_at: entry.detected_at,
    text,
    evidence: entry.evidence,
  };
}

/**
 * 只选择窗口内、指定 venue 集合中的真实记录。
 * 窗口按 UTC 日历日计算，与 Web 的“近 7 天”保持一致。
 */
export function selectRecentChanges<T extends SummaryChange>(
  changes: readonly T[],
  options: SummaryWindowOptions = {},
): T[] {
  const now = options.now ?? Date.now();
  const days = options.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error('变更窗口必须是 1–3650 个整数天');
  }
  const today = new Date(now).toISOString().slice(0, 10);
  const start = new Date(now - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const allowed = options.venueIds ? new Set(options.venueIds) : null;
  const dueOf = (entry: T): string => entry.after?.due_utc ?? entry.before?.due_utc ?? '';

  return changes
    .filter(
      (entry) =>
        (!allowed || allowed.has(entry.venue_id)) &&
        entry.detected_at >= start &&
        entry.detected_at <= today,
    )
    .sort(
      (a, b) =>
        b.detected_at.localeCompare(a.detected_at) ||
        a.venue_id.localeCompare(b.venue_id) ||
        dueOf(a).localeCompare(dueOf(b)) ||
        a.id.localeCompare(b.id),
    );
}

/** 文本报告：每条都带 changelog id 与证据 URL，不把模型总结混进事实。 */
export function formatChangeReport(
  summaries: readonly ChangeSummary[],
  options: { days?: number } = {},
): string {
  const days = options.days ?? 7;
  const lines = [`近 ${days} 天变更：${summaries.length} 条真实 diff`];
  for (const summary of summaries) {
    lines.push(`- ${summary.text}  [${summary.id}]`);
    lines.push(`  证据：${summary.evidence.url}`);
  }
  if (summaries.length === 0) {
    lines.push('窗口内没有已记录变更；dry-run、未公布和重复抓取都不会制造历史。');
  }
  return lines.join('\n');
}
