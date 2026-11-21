#!/usr/bin/env node
/**
 * 采集入口：抓官方页 → 规范化快照 → 抽取 → 与现有 YAML 比对 → 可选写回。
 *
 * 用法：
 *   node cmd/update.ts --dry-run             # 只报告会改什么
 *   node cmd/update.ts --venue cvpr --write  # 落盘（快照 + YAML）
 *   node cmd/update.ts --all --write
 *
 * 硬规则：抽取出的每条日期，其 quote 必须能在本次快照里逐字命中，否则跳过。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { fetchPage } from '../acquire/fetch.ts';
import { htmlToText, sha256Hex, snapshotContainsQuote } from '../acquire/snapshot.ts';
import { editionUrlFromDatesUrl, yearFromDatesUrl } from '../acquire/edition.ts';
import { extractTheCvf, type AdapterResult, type ExtractedDeadline } from '../acquire/adapters/thecvf.ts';
import { extractTableDates } from '../acquire/adapters/table-dates.ts';
import { loadRegistry, loadVenues, repoPath } from '../core/load.ts';
import type { Deadline, Edition, Venue } from '../core/schema.ts';
import { utcIsoToLocal } from '../core/time.ts';

interface Args {
  venue: string | null;
  write: boolean;
}

function parseArgs(argv: string[]): Args {
  let venue: string | null = null;
  let write = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') write = true;
    else if (arg === '--dry-run') write = false;
    else if (arg === '--venue') {
      venue = argv[index + 1] ?? null;
      index += 1;
    } else if (arg.startsWith('--venue=')) {
      venue = arg.slice('--venue='.length);
    } else if (arg === '--all') {
      venue = null;
    }
  }
  return { venue, write };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface BuiltDeadlines {
  deadlines: Deadline[];
  skipped: Array<{ label: string; reason: string }>;
}

function buildDeadlines(
  editionId: string,
  extracted: ExtractedDeadline[],
  snapshotText: string,
  snapshotHash: string,
  sourceUrl: string,
  existing: Deadline[] = [],
): BuiltDeadlines {
  const deadlines: Deadline[] = [];
  const skipped: Array<{ label: string; reason: string }> = [];
  const usedIds = new Set<string>();
  const previous = new Map(existing.map((item) => [item.id, item]));

  for (const item of extracted) {
    // quote 优先取「标签 + 日期」的连续文本；页面上若被其它内容隔开，退回只取日期文本。
    const candidates = [`${item.label} ${item.rawText}`, item.rawText];
    const quote = candidates.find((candidate) => snapshotContainsQuote(snapshotText, candidate));
    if (!quote) {
      skipped.push({ label: item.label, reason: '原文片段未能在快照中命中（拒绝入库）' });
      continue;
    }

    const due = utcIsoToLocal(item.dueUtc, item.timezone);
    if (!due) {
      skipped.push({ label: item.label, reason: `无法把 UTC 换算到 ${item.timezone}` });
      continue;
    }

    let id = `${editionId}-${item.key}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${editionId}-${item.key}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    // 值没变就沿用原来的证据（含 fetched_at 与旧快照哈希）：
    // 否则每次抓取都会改 fetched_at，导致「没有任何真实变更」也开一个 PR。
    const prev = previous.get(id);
    const evidence =
      prev && prev.due_utc === item.dueUtc && prev.raw_text === quote
        ? prev.evidence
        : {
            url: sourceUrl,
            quote,
            fetched_at: todayIso(),
            snapshot_hash: snapshotHash,
          };

    deadlines.push({
      id,
      kind: item.kind,
      label: item.label,
      raw_text: quote,
      due,
      timezone: item.timezone,
      due_utc: item.dueUtc,
      due_source: item.dueSource,
      status: 'confirmed',
      evidence,
    });
  }

  return { deadlines, skipped };
}

function mergeEdition(venue: Venue, edition: Edition): Venue {
  const editions = venue.editions.filter((entry) => entry.id !== edition.id);
  editions.push(edition);
  editions.sort((a, b) => a.year - b.year);
  return { ...venue, editions };
}

function diffDeadlines(existing: Deadline[], incoming: Deadline[]) {
  const before = new Map(existing.map((item) => [item.id, item]));
  const after = new Map(incoming.map((item) => [item.id, item]));
  const added: Deadline[] = [];
  const changed: Array<{ old: Deadline; next: Deadline }> = [];
  const removed: Deadline[] = [];

  for (const [id, next] of after) {
    const old = before.get(id);
    if (!old) added.push(next);
    else if (
      old.due_utc !== next.due_utc ||
      old.raw_text !== next.raw_text ||
      old.kind !== next.kind ||
      old.due !== next.due ||
      old.timezone !== next.timezone ||
      old.due_source !== next.due_source
    ) {
      changed.push({ old, next });
    }
  }
  for (const [id, old] of before) {
    if (!after.has(id)) removed.push(old);
  }
  return { added, changed, removed };
}

function formatDeadline(deadline: Deadline): string {
  return `${deadline.due} ${deadline.timezone}${deadline.due_utc ? ` (UTC ${deadline.due_utc})` : ''}`;
}

function findEditionEvidenceQuote(snapshotText: string): string | null {
  const lines = snapshotText.split('\n').map((line) => line.trim());
  return (
    lines.find((line) => /^(?:Dates and Deadlines|Important Dates)$/i.test(line)) ??
    lines.find((line) => line.length <= 120 && /\bImportant Dates\b/i.test(line)) ??
    null
  );
}

function extractPage(adapter: 'thecvf' | 'table-dates' | 'manual', html: string): AdapterResult {
  switch (adapter) {
    case 'thecvf':
      return extractTheCvf(html);
    case 'table-dates':
      return extractTableDates(html);
    case 'manual':
      throw new Error('manual 信源不应进入自动抽取');
    default:
      throw new Error(`未实现的适配器: ${String(adapter)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const registry = loadRegistry();
  const targets = args.venue
    ? registry.filter((entry) => entry.venue_id === args.venue)
    : registry;

  if (targets.length === 0) {
    console.error(`没有找到 venue: ${args.venue ?? '(all)'}`);
    process.exit(1);
  }

  const venues = new Map(loadVenues().map((file) => [file.data.id, file]));
  let failures = 0;
  let writes = 0;

  for (const source of targets) {
    const loaded = venues.get(source.venue_id);
    if (!loaded) {
      console.error(`✗ ${source.venue_id}: data/venues/${source.venue_id}.yaml 不存在`);
      failures += 1;
      continue;
    }

    if (source.adapter === 'manual' || source.cadence === 'manual') {
      console.log(`\n[${source.venue_id}] manual 信源或手动更新频率，跳过自动抓取`);
      continue;
    }

    const page = source.pages.find((entry) => entry.role === 'dates');
    if (!page) {
      // 期刊是滚动投稿，本来就没有截止日期页；跳过而不是记失败。
      if (loaded.data.submission_model === 'rolling') {
        console.log(`\n[${source.venue_id}] 滚动投稿期刊，无截止日期页，跳过`);
        continue;
      }
      console.error(`✗ ${source.venue_id}: registry 里没有 role=dates 的页面`);
      failures += 1;
      continue;
    }

    const year = yearFromDatesUrl(page.url);
    if (!year) {
      console.error(`✗ ${source.venue_id}: 无法从 URL 推导年份: ${page.url}`);
      failures += 1;
      continue;
    }

    console.log(`\n[${source.venue_id}] ${page.url}`);
    const response = await fetchPage(page.url);
    if (!response.ok) {
      console.error(`  ✗ 抓取失败: ${response.error ?? `HTTP ${response.status}`}`);
      failures += 1;
      continue;
    }

    const snapshotText = htmlToText(response.html);
    const snapshotHash = sha256Hex(snapshotText);
    const result = extractPage(source.adapter, response.html);

    if (result.status !== 'ok') {
      console.log(`  · 页面可访问，但未公布日期（${result.status}），不写入任何数据`);
      for (const warning of result.warnings) console.log(`    - ${warning}`);
      continue;
    }

    const editionId = `${source.venue_id}-${year}`;
    const editionUrl = editionUrlFromDatesUrl(page.url);
    const existingEdition = loaded.data.editions.find((entry) => entry.id === editionId);
    const built = buildDeadlines(
      editionId,
      result.deadlines,
      snapshotText,
      snapshotHash,
      page.url,
      existingEdition?.deadlines ?? [],
    );

    const diff = diffDeadlines(existingEdition?.deadlines ?? [], built.deadlines);

    console.log(`  快照 ${snapshotHash.slice(0, 12)}…  行 ${result.deadlines.length} 条`);
    for (const deadline of built.deadlines) {
      console.log(`    · ${deadline.kind.padEnd(12)} ${formatDeadline(deadline)}`);
    }
    for (const item of built.skipped) {
      console.log(`    ! 跳过「${item.label}」：${item.reason}`);
    }
    for (const warning of result.warnings) console.log(`    ! ${warning}`);

    console.log(
      `  变更：新增 ${diff.added.length}，修改 ${diff.changed.length}，移除 ${diff.removed.length}`,
    );
    for (const { old, next } of diff.changed) {
      console.log(`    ~ ${next.id}: ${old.due_utc ?? old.due} → ${next.due_utc ?? next.due}`);
    }
    for (const old of diff.removed) {
      console.log(`    - ${old.id}: ${old.due_utc ?? old.due}`);
    }

    if (!args.write) {
      console.log('  （dry-run，未写入）');
      continue;
    }

    if (built.deadlines.length === 0) {
      console.log('  （没有任何通过闸门的日期，拒绝写入）');
      failures += 1;
      continue;
    }

    const extractionGap =
      built.skipped.length > 0 || result.warnings.some((warning) => warning.includes('已跳过'));
    if (diff.removed.length > 0 && extractionGap) {
      console.error('  ✗ 有节点抽取失败且本次将移除既有 deadline，拒绝写入；请先修复页面适配');
      failures += 1;
      continue;
    }

    const editionQuote = findEditionEvidenceQuote(snapshotText);
    if (!editionQuote) {
      console.error('  ✗ 找不到可回验的日期页标题，拒绝写入 edition evidence');
      failures += 1;
      continue;
    }

    const snapshotFile = repoPath('data', 'snapshots', source.venue_id, `${snapshotHash}.txt`);
    mkdirSync(dirname(snapshotFile), { recursive: true });
    writeFileSync(snapshotFile, snapshotText, 'utf8');

    // 页面哈希没变时沿用原证据，避免只改 fetched_at 造成无意义的 diff。
    const previousEditionEvidence = existingEdition?.evidence?.[0];
    const editionEvidence =
      existingEdition &&
      previousEditionEvidence?.snapshot_hash === snapshotHash &&
      existingEdition.evidence.every((item) => snapshotContainsQuote(snapshotText, item.quote))
        ? existingEdition.evidence
        : [
            {
              url: page.url,
              quote: editionQuote,
              fetched_at: todayIso(),
              snapshot_hash: snapshotHash,
            },
          ];

    const edition: Edition = {
      id: editionId,
      year,
      label: `${loaded.data.names.short} ${year}`,
      ...(existingEdition?.location ? { location: existingEdition.location } : {}),
      // 页面解析不出会期时保留已有值，不要因为一次解析失败把已知日期删掉。
      ...(result.editionDates
        ? { dates: result.editionDates }
        : existingEdition?.dates
          ? { dates: existingEdition.dates }
          : {}),
      official_url: editionUrl,
      evidence: editionEvidence,
      deadlines: built.deadlines,
    };

    const nextVenue = mergeEdition(loaded.data, edition);
    const venueFile = join(loaded.path);
    writeFileSync(venueFile, stringifyYaml(nextVenue, { lineWidth: 0 }), 'utf8');
    writes += 1;
    console.log(`  ✓ 已写入 ${loaded.relativePath} 与快照`);
  }

  console.log(`\n完成：写回 ${writes} 个 venue，失败 ${failures} 个。`);
  if (failures > 0) process.exit(1);
}

if (!existsSync(repoPath('data', 'venues'))) {
  console.error('找不到 data/venues，请在仓库根目录运行。');
  process.exit(1);
}

await main();
