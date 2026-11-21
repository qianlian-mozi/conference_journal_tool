import type { Field, ScheduleDocument, Venue } from './types';
import fieldData from '../fields/computer-vision/field.json';
import venueData from '../fields/computer-vision/venues.json';
import scheduleData from '../fields/computer-vision/schedule.json';

export const field: Field = fieldData as Field;
export const venues: Venue[] = venueData.venues as Venue[];
export const schedule: ScheduleDocument = scheduleData as ScheduleDocument;

export function getVenueById(id: string): Venue | undefined {
  return venues.find((venue) => venue.id === id);
}

export function getDeadlinesForVenue(venueId: string) {
  const editionIds = new Set(
    schedule.editions.filter((edition) => edition.venue_id === venueId).map((edition) => edition.id),
  );
  return schedule.deadlines.filter((deadline) => editionIds.has(deadline.edition_id));
}

export function isDeadlinePassed(dueLocal: string): boolean {
  const due = new Date(dueLocal);
  return due.getTime() < Date.now();
}
