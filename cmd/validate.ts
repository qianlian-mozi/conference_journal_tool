#!/usr/bin/env node
/**
 * 数据校验：把「可信」变成可执行的检查。
 *
 * 检查项：
 * 1. schema（由 core/load 的 zod 解析完成）
 * 2. 领域归属、id 唯一性
 * 3. 时区合法，且 due + timezone 换算出的 UTC 与 due_utc 一致（容差 60 秒）
 * 4. edition 与每条截止日期的 quote 必须能在其 snapshot_hash 对应的快照里逐字命中
 * 5. 期刊（rolling）不得有截止日期
 * 6. registry 里的 venue 必须存在
 */
import { loadFieldPacks, loadRegistry, loadVenues } from '../core/load.ts';
import { snapshotEvidenceError } from '../acquire/evidence.ts';
import type { Venue } from '../core/schema.ts';
import { packErrors } from '../core/packs.ts';
import { isValidTimeZone, localToUtcIso, sameInstant } from '../core/time.ts';

const errors: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
  errors.push(message);
}

function warn(message: string): void {
  warnings.push(message);
}

function checkVenue(venue: Venue, fieldIds: Set<string>): void {
  const where = `data/venues/${venue.id}.yaml`;

  for (const fieldId of venue.field_ids) {
    if (!fieldIds.has(fieldId)) {
      fail(`${where}: field_ids 引用了不存在的领域 "${fieldId}"`);
    }
  }

  const editionIds = new Set<string>();
  const deadlineIds = new Set<string>();

  for (const edition of venue.editions) {
    if (editionIds.has(edition.id)) {
      fail(`${where}: edition id 重复 "${edition.id}"`);
    }
    editionIds.add(edition.id);

    if (!edition.id.startsWith(`${venue.id}-`)) {
      warn(`${where}: edition "${edition.id}" 未以 venue id 开头`);
    }

    if (venue.submission_model === 'rolling' && edition.deadlines.length > 0) {
      fail(`${where}: 期刊为滚动投稿，edition "${edition.id}" 不应有截止日期`);
    }

    if (edition.deadlines.length > 0 && edition.evidence.length === 0) {
      fail(`${where}: ${edition.id} 有截止日期但缺少 edition 级 evidence`);
    }
    for (const evidence of edition.evidence) {
      const problem = snapshotEvidenceError(venue.id, evidence);
      if (problem) fail(`${where}: ${edition.id}/evidence ${problem}`);
    }

    for (const deadline of edition.deadlines) {
      const label = `${where}: ${edition.id}/${deadline.id}`;

      if (deadlineIds.has(deadline.id)) {
        fail(`${where}: deadline id 重复 "${deadline.id}"`);
      }
      deadlineIds.add(deadline.id);

      if (!isValidTimeZone(deadline.timezone)) {
        fail(`${label}: 时区不合法 "${deadline.timezone}"`);
        continue;
      }

      const computed = localToUtcIso(deadline.due, deadline.timezone);
      if (!computed) {
        fail(`${label}: due "${deadline.due}" 不是合法的本地时间`);
        continue;
      }

      if (!deadline.due_utc) {
        fail(`${label}: 缺少 due_utc（必须能由官网时间换算得到）`);
      } else if (!sameInstant(computed, deadline.due_utc)) {
        fail(
          `${label}: due+timezone 换算为 ${computed}，与 due_utc ${deadline.due_utc} 不一致`,
        );
      }

      const problem = snapshotEvidenceError(venue.id, deadline.evidence);
      if (problem) fail(`${label}: ${problem}`);
    }
  }
}

function main(): void {
  const fields = loadFieldPacks();
  const venues = loadVenues();
  const registry = loadRegistry();

  if (fields.length === 0) fail('data/fields 为空，至少需要一个领域包');
  if (venues.length === 0) fail('data/venues 为空，至少需要一个 venue');

  for (const problem of packErrors(
    fields.map((file) => file.data),
    venues.map((file) => file.data),
  )) {
    fail(problem);
  }

  const fieldIds = new Set(fields.map((file) => file.data.id));
  const venueIds = new Set<string>();

  for (const file of venues) {
    if (venueIds.has(file.data.id)) {
      fail(`venue id 重复 "${file.data.id}"`);
    }
    venueIds.add(file.data.id);
    checkVenue(file.data, fieldIds);
  }

  for (const source of registry) {
    if (!venueIds.has(source.venue_id)) {
      fail(`sources/registry.yaml: venue "${source.venue_id}" 不存在`);
    }
  }

  const deadlineCount = venues.reduce(
    (sum, file) =>
      sum + file.data.editions.reduce((inner, edition) => inner + edition.deadlines.length, 0),
    0,
  );

  for (const message of warnings) console.warn(`⚠ ${message}`);
  for (const message of errors) console.error(`✗ ${message}`);

  console.log(
    `\n校验完成：${fields.length} 个领域、${venues.length} 个 venue、${deadlineCount} 条截止日期，` +
      `${errors.length} 个错误、${warnings.length} 个警告。`,
  );

  if (errors.length > 0) process.exit(1);
}

main();
