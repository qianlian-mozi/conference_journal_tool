import type { SubmissionPlan } from '../types';
import { escapeIcsText, foldIcsLine, formatIcsUtc, ICS_CRLF } from './ics-core';

const CRLF = ICS_CRLF;

export function buildPlanIcs(plan: SubmissionPlan, venueName: string): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Venue Radar//ZH-CN//EN');
  lines.push('CALSCALE:GREGORIAN');

  const planDescription = `投稿计划：${plan.title}`;

  plan.milestones.forEach((milestone, index) => {
    const due = new Date(milestone.dueAt);
    const uid = `${plan.id}-${index}@venue-radar`;
    const summary = `[${venueName}] ${milestone.title}`;
    const description = `${planDescription}\n里程碑：${milestone.title}\n目标截止：${plan.deadlineAt}${plan.notes ? `\n备注：${plan.notes}` : ''}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatIcsUtc(new Date())}`);
    lines.push(`DTSTART:${formatIcsUtc(due)}`);
    lines.push(`DTEND:${formatIcsUtc(new Date(due.getTime() + 15 * 60 * 1000))}`);
    lines.push(foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`));
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`));
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
