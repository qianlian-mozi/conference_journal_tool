import type { ShelfDeadline, ShelfVenue } from '../types';
import { escapeIcsText, formatIcsUtc, serializeIcsLines } from './ics-core.ts';

export interface DeadlineCalendarOptions {
  name: string;
  description?: string;
  generatedAt?: Date;
}

export interface DeadlineCalendarResult {
  ics: string;
  eventCount: number;
  skippedCount: number;
}

interface CalendarEvent {
  venue: ShelfVenue;
  deadline: ShelfDeadline;
  editionYear: number;
  location: string | null;
}

function eventStatus(status: string): string {
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'tentative') return 'TENTATIVE';
  return 'CONFIRMED';
}

export function buildDeadlineCalendar(
  venues: ShelfVenue[],
  options: DeadlineCalendarOptions,
): DeadlineCalendarResult {
  const events: CalendarEvent[] = [];
  let skippedCount = 0;

  for (const venue of venues) {
    for (const edition of venue.editions) {
      for (const deadline of edition.deadlines) {
        if (!deadline.due_utc || Number.isNaN(new Date(deadline.due_utc).getTime())) {
          skippedCount += 1;
          continue;
        }
        events.push({ venue, deadline, editionYear: edition.year, location: edition.location });
      }
    }
  }

  events.sort((a, b) => (a.deadline.due_utc ?? '').localeCompare(b.deadline.due_utc ?? ''));
  const generatedAt = options.generatedAt ?? new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Venue Radar//Deadline Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(options.name)}`,
    `X-WR-CALDESC:${escapeIcsText(options.description ?? '带官网证据的会议与期刊投稿截止日期')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  for (const { venue, deadline, editionYear, location } of events) {
    const start = new Date(deadline.due_utc as string);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const label = deadline.label ?? deadline.kind;
    const summary = `[${venue.short} ${editionYear}] ${label}`;
    const description = [
      `${venue.full} (${editionYear})`,
      `节点：${label}`,
      `官网本地时间：${deadline.due} ${deadline.timezone}`,
      `时间依据：${deadline.due_source === 'timestamp' ? '页面机器时间戳' : '官网文本'}`,
      `核验日期：${deadline.evidence.fetched_at}`,
      deadline.evidence.quote ? `官网原文：${deadline.evidence.quote}` : null,
      `来源：${deadline.evidence.url}`,
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${venue.id}:${deadline.id}@venue-radar`,
      `DTSTAMP:${formatIcsUtc(generatedAt)}`,
      `DTSTART:${formatIcsUtc(start)}`,
      `DTEND:${formatIcsUtc(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL;VALUE=URI:${deadline.evidence.url}`,
      `STATUS:${eventStatus(deadline.status)}`,
      'TRANSP:TRANSPARENT',
      ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(summary)}`,
      'TRIGGER:-PT24H',
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return { ics: serializeIcsLines(lines), eventCount: events.length, skippedCount };
}
