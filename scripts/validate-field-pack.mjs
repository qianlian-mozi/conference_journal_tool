import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLUG_PATTERN = /^[a-z]+(?:-[a-z]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function requireSchemaVersion(record, path, errors) {
  if (record.schema_version !== 1) {
    errors.push(`${path}.schema_version must be 1`);
  }
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateFieldPack(field, venueDocument) {
  const errors = [];

  if (!isObject(field)) {
    errors.push('field must be an object');
  } else {
    requireSchemaVersion(field, 'field', errors);
    const fieldId = requireString(field, 'id', 'field', errors);
    const fieldSlug = requireString(field, 'slug', 'field', errors);
    requireString(field, 'name_zh', 'field', errors);
    requireString(field, 'name_en', 'field', errors);
    const status = requireString(field, 'status', 'field', errors);

    if (fieldId !== null && !SLUG_PATTERN.test(fieldId)) {
      errors.push('field.id must contain only lowercase English letters and hyphens');
    }
    if (fieldSlug !== null && !SLUG_PATTERN.test(fieldSlug)) {
      errors.push('field.slug must contain only lowercase English letters and hyphens');
    }
    if (status !== null && !['active', 'planned'].includes(status)) {
      errors.push('field.status must be active or planned');
    }
  }

  if (!isObject(venueDocument)) {
    errors.push('venueDocument must be an object');
    return errors;
  }

  requireSchemaVersion(venueDocument, 'venueDocument', errors);
  const documentFieldId = requireString(venueDocument, 'field_id', 'venueDocument', errors);
  if (
    documentFieldId !== null &&
    isObject(field) &&
    typeof field.id === 'string' &&
    documentFieldId !== field.id
  ) {
    errors.push('venueDocument.field_id must equal field.id');
  }

  if (!Array.isArray(venueDocument.venues)) {
    errors.push('venueDocument.venues must be an array');
    return errors;
  }

  const ids = new Set();
  const slugs = new Set();

  venueDocument.venues.forEach((venue, index) => {
    const path = `venueDocument.venues[${index}]`;
    if (!isObject(venue)) {
      errors.push(`${path} must be an object`);
      return;
    }

    const id = requireString(venue, 'id', path, errors);
    const slug = requireString(venue, 'slug', path, errors);
    requireString(venue, 'name', path, errors);
    requireString(venue, 'short_name', path, errors);
    const type = requireString(venue, 'type', path, errors);
    const officialUrl = requireString(venue, 'official_url', path, errors);

    if (id !== null) {
      if (!SLUG_PATTERN.test(id)) {
        errors.push(`${path}.id must contain only lowercase English letters and hyphens`);
      }
      if (ids.has(id)) {
        errors.push(`${path}.id must be unique; duplicate id: ${id}`);
      }
      ids.add(id);
    }

    if (slug !== null) {
      if (!SLUG_PATTERN.test(slug)) {
        errors.push(`${path}.slug must contain only lowercase English letters and hyphens`);
      }
      if (slugs.has(slug)) {
        errors.push(`${path}.slug must be unique; duplicate slug: ${slug}`);
      }
      slugs.add(slug);
    }

    if (type !== null && !['conference', 'journal'].includes(type)) {
      errors.push(`${path}.type must be conference or journal`);
    }
    if (officialUrl !== null && !isHttpsUrl(officialUrl)) {
      errors.push(`${path}.official_url must be a valid HTTPS URL`);
    }

    if (!Array.isArray(venue.field_ids) || venue.field_ids.length === 0) {
      errors.push(`${path}.field_ids must be a non-empty array of strings`);
    } else {
      if (venue.field_ids.some((id) => typeof id !== 'string' || id.trim() === '')) {
        errors.push(`${path}.field_ids must contain only non-empty strings`);
      }
      if (isObject(field) && typeof field.id === 'string' && !venue.field_ids.includes(field.id)) {
        errors.push(`${path}.field_ids must include field.id`);
      }
    }

    if (!Array.isArray(venue.evidence) || venue.evidence.length === 0) {
      errors.push(`${path}.evidence must be a non-empty array`);
      return;
    }

    venue.evidence.forEach((evidence, evidenceIndex) => {
      const evidencePath = `${path}.evidence[${evidenceIndex}]`;
      if (!isObject(evidence)) {
        errors.push(`${evidencePath} must be an object`);
        return;
      }

      const evidenceUrl = requireString(evidence, 'url', evidencePath, errors);
      const verifiedAt = requireString(evidence, 'last_verified_at', evidencePath, errors);
      if (evidenceUrl !== null && !isHttpsUrl(evidenceUrl)) {
        errors.push(`${evidencePath}.url must be a valid HTTPS URL`);
      }
      if (verifiedAt !== null && !DATE_PATTERN.test(verifiedAt)) {
        errors.push(`${evidencePath}.last_verified_at must use YYYY-MM-DD format`);
      }
    });
  });

  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const packDirectory = process.argv[2];
  if (!packDirectory) {
    console.error('Usage: node scripts/validate-field-pack.mjs <field-pack-directory>');
    process.exitCode = 1;
  } else {
    try {
      const field = JSON.parse(readFileSync(resolve(packDirectory, 'field.json'), 'utf8'));
      const venueDocument = JSON.parse(readFileSync(resolve(packDirectory, 'venues.json'), 'utf8'));
      const errors = validateFieldPack(field, venueDocument);

      if (errors.length > 0) {
        errors.forEach((error) => console.error(error));
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`Unable to validate field pack: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
