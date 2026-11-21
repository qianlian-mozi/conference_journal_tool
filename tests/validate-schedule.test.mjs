import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateSchedule } from '../scripts/validate-schedule.mjs';

const exampleUrl = new URL('../examples/computer-vision/schedule.example.json', import.meta.url);
const scriptPath = fileURLToPath(new URL('../scripts/validate-schedule.mjs', import.meta.url));
const examplePath = fileURLToPath(exampleUrl);

function makeValidSchedule() {
  return JSON.parse(readFileSync(exampleUrl, 'utf8'));
}

function assertHasError(schedule, fragment) {
  const errors = validateSchedule(schedule);
  assert.ok(
    errors.some((error) => error.includes(fragment)),
    `Expected an error containing "${fragment}"; received: ${errors.join(' | ')}`,
  );
}

test('accepts the explicitly fictional valid example', () => {
  const schedule = makeValidSchedule();
  assert.equal(schedule.editions[0].venue_id, 'example-cv-conference');
  assert.equal(schedule.editions[0].id, 'example-cv-conference-2099');
  assert.equal(schedule.editions[0].year, 2099);
  assert.match(schedule.editions[0].label, /Fictional/);
  assert.deepEqual(validateSchedule(schedule), []);
});

test('validates schema_version, field_id, and top-level arrays', () => {
  const schedule = makeValidSchedule();
  schedule.schema_version = 2;
  schedule.field_id = 'Invalid_Field';
  schedule.editions = {};
  schedule.deadlines = null;
  assertHasError(schedule, 'schedule.schema_version');
  assertHasError(schedule, 'schedule.field_id');
  assertHasError(schedule, 'schedule.editions');
  assertHasError(schedule, 'schedule.deadlines');
});

test('rejects invalid Edition and Deadline IDs and out-of-range years', () => {
  const schedule = makeValidSchedule();
  schedule.editions[0].id = 'Invalid Edition';
  schedule.editions[0].year = 1999;
  schedule.deadlines[0].id = 'Invalid Deadline';
  schedule.deadlines[0].edition_id = 'Invalid Edition';
  assertHasError(schedule, 'schedule.editions[0].id');
  assertHasError(schedule, 'schedule.editions[0].year');
  assertHasError(schedule, 'schedule.deadlines[0].id');
});

test('rejects non-HTTPS URLs and impossible evidence dates', () => {
  const schedule = makeValidSchedule();
  schedule.editions[0].official_url = 'http://example.com/edition';
  schedule.editions[0].evidence[0].url = 'http://example.com/evidence';
  schedule.deadlines[0].evidence[0].last_verified_at = '2026-02-30';
  assertHasError(schedule, 'schedule.editions[0].official_url');
  assertHasError(schedule, 'schedule.editions[0].evidence[0].url');
  assertHasError(schedule, 'schedule.deadlines[0].evidence[0].last_verified_at');
});

test('rejects an invalid timezone', () => {
  const schedule = makeValidSchedule();
  schedule.deadlines[0].timezone = 'Mars/Olympus_Mons';
  assertHasError(schedule, 'schedule.deadlines[0].timezone');
});

test('rejects a nonexistent calendar date', () => {
  const schedule = makeValidSchedule();
  schedule.deadlines[0].due_local = '2099-02-29T23:59:59';
  assertHasError(schedule, 'schedule.deadlines[0].due_local');
});

test('rejects an invalid local time and timezone offsets', () => {
  const schedule = makeValidSchedule();
  schedule.deadlines[0].due_local = '2099-03-01T24:00:00';
  assertHasError(schedule, 'schedule.deadlines[0].due_local');
  schedule.deadlines[0].due_local = '2099-03-01T23:59:59Z';
  assertHasError(schedule, 'schedule.deadlines[0].due_local');
});

test('rejects a duplicate Edition ID', () => {
  const schedule = makeValidSchedule();
  schedule.editions.push({ ...schedule.editions[0] });
  assertHasError(schedule, 'duplicate id: example-cv-conference-2099');
});

test('rejects a duplicate Deadline ID', () => {
  const schedule = makeValidSchedule();
  schedule.deadlines.push({ ...schedule.deadlines[0], evidence: [...schedule.deadlines[0].evidence] });
  assertHasError(schedule, 'duplicate id: example-cv-conference-2099-paper');
});

test('rejects a dangling Deadline Edition reference', () => {
  const schedule = makeValidSchedule();
  schedule.deadlines[0].edition_id = 'missing-edition';
  assertHasError(schedule, 'must reference an existing Edition');
});

test('rejects unsupported Deadline kind and status values', () => {
  const schedule = makeValidSchedule();
  schedule.deadlines[0].kind = 'final';
  schedule.deadlines[0].status = 'unknown';
  assertHasError(schedule, 'schedule.deadlines[0].kind');
  assertHasError(schedule, 'schedule.deadlines[0].status');
});

test('CLI exits with zero for the valid example', () => {
  const result = spawnSync(process.execPath, [scriptPath, examplePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('CLI exits nonzero when the schedule cannot be read', () => {
  const result = spawnSync(process.execPath, [scriptPath, `${examplePath}.missing`], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unable to validate schedule/);
});
