/**
 * discover：在领域候选清单里找还没收录的会议/期刊。
 *
 * 不自动写数据，也不相信搜索结果；只输出「候选 + 官网 + 下一步」。
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadRegistry, loadVenues, repoPath } from '../core/load.ts';
import {
  matchCandidates,
  parseDiscoveryCatalog,
  type DiscoveryMatch,
} from '../core/discover.ts';
import { fetchPage } from '../acquire/fetch.ts';
import { DISCOVER_USAGE, DiscoverArgError, parseDiscoverArgs } from './discover-args.ts';

interface Verification {
  url: string;
  status: number;
  final_url: string;
  title: string | null;
  error: string | null;
}

async function verifyCandidate(match: DiscoveryMatch): Promise<Verification> {
  const url = match.candidate.official_url;
  const result = await fetchPage(url, { retries: 0, timeoutMs: 15000 });
  const title = result.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim();
  return {
    url,
    status: result.status,
    final_url: result.finalUrl,
    title: title || null,
    error: result.error ?? null,
  };
}

function printHuman(
  matches: DiscoveryMatch[],
  fieldId: string,
  query: string,
  verifications: Map<string, Verification>,
  truncated: boolean,
): void {
  const registered = matches.filter((match) => match.registered).length;
  const header = query ? `关键词 "${query}"` : '全部候选';
  console.log(`discover：${fieldId} · ${header}`);
  console.log(`候选 ${matches.length} 个（未收录 ${matches.length - registered}，已收录 ${registered}）`);

  if (matches.length === 0) {
    console.log('\n没有匹配的未收录候选。可以换关键词、加 --all 看已收录项，或直接 npm run add-venue。');
    return;
  }

  matches.forEach((match, index) => {
    const { candidate } = match;
    console.log(`\n${index + 1}. ${candidate.names.short} — ${candidate.names.full}`);
    console.log(`   类型：${candidate.type}`);
    console.log(`   官网：${candidate.official_url}`);
    if (candidate.publisher) console.log(`   出版方：${candidate.publisher}`);
    console.log(`   状态：${match.registered ? '已收录' : '未收录'}`);
    if (candidate.note) console.log(`   备注：${candidate.note}`);

    if (match.registered) {
      console.log('   下一步：已存在，无需接入；要更新日期请跑 npm run update');
      return;
    }

    const verification = verifications.get(candidate.id);
    if (verification) {
      if (verification.status >= 200 && verification.status < 400) {
        const redirect =
          verification.final_url === verification.url ? '' : ` → ${verification.final_url}`;
        console.log(
          `   验证：HTTP ${verification.status} · ${verification.title ?? '（无标题）'}${redirect}`,
        );
      } else {
        console.log(`   验证：失败 · ${verification.error ?? `HTTP ${verification.status}`}`);
      }
    }

    if (match.addCommand) {
      console.log(`   接入：${match.addCommand}`);
    } else {
      console.log('   接入：先找到当届 Dates / CFP 页，再用 npm run add-venue 补 source');
    }
  });

  if (truncated) console.log('\n（只验证了前 10 条官网）');
  console.log('\n提示：候选必须人工确认后再写入；discover 不会自动改 data/。');
}

async function main(): Promise<void> {
  const args = parseDiscoverArgs(process.argv.slice(2));
  if (args.help) {
    console.log(DISCOVER_USAGE);
    return;
  }

  const catalogPath = repoPath('data', 'discovery', `${args.fieldId}.yaml`);
  if (!existsSync(catalogPath)) {
    throw new Error(
      `没有 ${args.fieldId} 的候选清单：${catalogPath}\n` +
        '先建 data/discovery/<field>.yaml，格式见 docs/DISCOVER.md',
    );
  }

  const catalog = parseDiscoveryCatalog(readFileSync(catalogPath, 'utf8'));
  if (catalog.field_id !== args.fieldId) {
    throw new Error(`候选清单 field_id 是 ${catalog.field_id}，与 --field ${args.fieldId} 不一致`);
  }

  const venueIds = new Set(loadVenues().map((venue) => venue.id));
  for (const source of loadRegistry()) venueIds.add(source.venue_id);

  const matches = matchCandidates(catalog, venueIds, {
    query: args.query,
    type: args.type,
    includeRegistered: args.includeRegistered,
    limit: args.limit,
  });

  const verifications = new Map<string, Verification>();
  if (args.verify) {
    const toVerify = matches.slice(0, 10);
    for (const match of toVerify) {
      verifications.set(match.candidate.id, await verifyCandidate(match));
    }
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          field_id: catalog.field_id,
          query: args.query,
          count: matches.length,
          candidates: matches.map((match) => ({
            ...match.candidate,
            registered: match.registered,
            status: match.registered ? 'registered' : 'candidate',
            verification: verifications.get(match.candidate.id) ?? null,
            add_command: match.addCommand,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  printHuman(matches, catalog.field_id, args.query, verifications, args.verify && matches.length > 10);
}

main().catch((error: unknown) => {
  if (error instanceof DiscoverArgError) {
    console.error(`参数错误：${error.message}\n`);
    console.error(DISCOVER_USAGE);
    process.exitCode = 2;
    return;
  }
  console.error(`discover 失败：${(error as Error).message}`);
  process.exitCode = 1;
});
