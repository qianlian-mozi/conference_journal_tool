import type { SubmissionPlan } from '../types';

const CRLF = '\r\n';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) {
    return line;
  }
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > maxLen) {
    chunks.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks.join(CRLF + ' ');
}

export function buildPlanIcs(plan: SubmissionPlan, venueName: string): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//CV Submission Assistant//ZH-CN//EN');
  lines.push('CALSCALE:GREGORIAN');

  const planDescription = `投稿计划：${plan.title}`;

  plan.milestones.forEach((milestone, index) => {
    const due = new Date(milestone.dueAt);
    const uid = `${plan.id}-${index}@cv-submission-assistant`;
    const summary = `[${venueName}] ${milestone.title}`;
    const description = `${planDescription}\n里程碑：${milestone.title}\n目标截止：${plan.deadlineAt}${plan.notes ? `\n备注：${plan.notes}` : ''}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatUtc(new Date())}`);
    lines.push(`DTSTART:${formatUtc(due)}`);
    lines.push(`DTEND:${formatUtc(due)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(description)}`));
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcsText(summary)}`);
    lines.push('TRIGGER:-PT1H');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}
