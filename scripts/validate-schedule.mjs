import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIELD_ID_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DUE_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const DEADLINE_KINDS = ['abstract', 'paper', 'supplement', 'rebuttal', 'camera_ready', 'notification', 'other'];
const DEADLINE_STATUSES = ['tentative', 'scheduled', 'extended', 'cancelled'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(record, key, path, errors) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path}.${key} must be a non-empty string`);
    return null;
  }
  return value;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isValidDate(value) {
  const match = DATE_PATTERN.exec(value);
  return match !== null && isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isValidDueLocal(value) {
  const match = DUE_LOCAL_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  return (
    isValidCalendarDate(year, month, day) &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    second >= 0 && second <= 59
  );
}

function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validateEvidence(record, path, errors) {
  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    errors.push(`${path}.evidence must be a non-empty array`);
    return;
  }

  record.evidence.forEach((evidence, index) => {
    const evidencePath = `${path}.evidence[${index}]`;
    if (!isObject(evidence)) {
      errors.push(`${evidencePath} must be an object`);
      return;
    }

    const url = requireString(evidence, 'url', evidencePath, errors);
    const verifiedAt = requireString(evidence, 'last_verified_at', evidencePath, errors);
    if (url !== null && !isHttpsUrl(url)) {
      errors.push(`${evidencePath}.url must be a valid HTTPS URL`);
    }
    if (verifiedAt !== null && !isValidDate(verifiedAt)) {
      errors.push(`${evidencePath}.last_verified_at must be a valid date in YYYY-MM-DD format`);
    }
  });
}

export function validateSchedule(schedule) {
  const errors = [];

  if (!isObject(schedule)) {
    return ['schedule must be an object'];
  }

  if (schedule.schema_version !== 1) {
    errors.push('schedule.schema_version must be 1');
  }

  const fieldId = requireString(schedule, 'field_id', 'schedule', errors);
  if (fieldId !== null && !FIELD_ID_PATTERN.test(fieldId)) {
    errors.push('schedule.field_id must contain only lowercase English letters and hyphens');
  }

  if (!Array.isArray(schedule.editions)) {
    errors.push('schedule.editions must be an array');
  }
  if (!Array.isArray(schedule.deadlines)) {
    errors.push('schedule.deadlines must be an array');
  }

  const editionIds = new Set();
  const deadlineIds = new Set();

  if (Array.isArray(schedule.editions)) {
    schedule.editions.forEach((edition, index) => {
      const path = `schedule.editions[${index}]`;
      if (!isObject(edition)) {
        errors.push(`${path} must be an object`);
        return;
      }

      const id = requireString(edition, 'id', path, errors);
      const venueId = requireString(edition, 'venue_id', path, errors);
      requireString(edition, 'label', path, errors);
      const officialUrl = requireString(edition, 'official_url', path, errors);

      if (id !== null) {
        if (!ID_PATTERN.test(id)) {
          errors.push(`${path}.id must contain only lowercase letters, numbers, and hyphens`);
        }
        if (editionIds.has(id)) {
          errors.push(`${path}.id must be unique; duplicate id: ${id}`);
        }
        editionIds.add(id);
      }

      if (venueId !== null && !ID_PATTERN.test(venueId)) {
        errors.push(`${path}.venue_id must contain only lowercase letters, numbers, and hyphens`);
      }
      if (!Number.isInteger(edition.year) || edition.year < 2000 || edition.year > 2200) {
        errors.push(`${path}.year must be an integer between 2000 and 2200`);
      }
      if (officialUrl !== null && !isHttpsUrl(officialUrl)) {
        errors.push(`${path}.official_url must be a valid HTTPS URL`);
      }

      validateEvidence(edition, path, errors);
    });
  }

  if (Array.isArray(schedule.deadlines)) {
    schedule.deadlines.forEach((deadline, index) => {
      const path = `schedule.deadlines[${index}]`;
      if (!isObject(deadline)) {
        errors.push(`${path} must be an object`);
        return;
      }

      const id = requireString(deadline, 'id', path, errors);
      const editionId = requireString(deadline, 'edition_id', path, errors);
      const kind = requireString(deadline, 'kind', path, errors);
      requireString(deadline, 'raw_text', path, errors);
      const dueLocal = requireString(deadline, 'due_local', path, errors);
      const timezone = requireString(deadline, 'timezone', path, errors);
      const status = requireString(deadline, 'status', path, errors);

      if (id !== null) {
        if (!ID_PATTERN.test(id)) {
          errors.push(`${path}.id must contain only lowercase letters, numbers, and hyphens`);
        }
        if (deadlineIds.has(id)) {
          errors.push(`${path}.id must be unique; duplicate id: ${id}`);
        }
        deadlineIds.add(id);
      }

      if (editionId !== null) {
        if (!ID_PATTERN.test(editionId)) {
          errors.push(`${path}.edition_id must contain only lowercase letters, numbers, and hyphens`);
        }
        if (!editionIds.has(editionId)) {
          errors.push(`${path}.edition_id must reference an existing Edition; missing id: ${editionId}`);
        }
      }
      if (kind !== null && !DEADLINE_KINDS.includes(kind)) {
        errors.push(`${path}.kind must be one of: ${DEADLINE_KINDS.join(', ')}`);
      }
      if (dueLocal !== null && !isValidDueLocal(dueLocal)) {
        errors.push(`${path}.due_local must use YYYY-MM-DDTHH:mm:ss and be a valid calendar date and time`);
      }
      if (timezone !== null && !isValidTimeZone(timezone)) {
        errors.push(`${path}.timezone must be accepted by Intl.DateTimeFormat`);
      }
      if (status !== null && !DEADLINE_STATUSES.includes(status)) {
        errors.push(`${path}.status must be one of: ${DEADLINE_STATUSES.join(', ')}`);
      }

      validateEvidence(deadline, path, errors);
    });
  }

  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const schedulePath = process.argv[2];
  if (!schedulePath) {
    console.error('Usage: node scripts/validate-schedule.mjs <schedule-json-file>');
    process.exitCode = 1;
  } else {
    try {
      const schedule = JSON.parse(readFileSync(resolve(schedulePath), 'utf8'));
      const errors = validateSchedule(schedule);

      if (errors.length > 0) {
        errors.forEach((error) => console.error(error));
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`Unable to validate schedule: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
