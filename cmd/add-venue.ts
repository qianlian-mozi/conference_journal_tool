/**
 * add-venue：登记一个新会议/期刊，生成可校验的 YAML 骨架与信源条目。
 *
 * 默认只预览，--write 才落盘。命令不会生成任何日期：
 * 日期必须随后由 update 从官网抓取，并经过 quote 回验。
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { repoPath, loadFieldPacks, loadRegistry, loadVenues } from '../core/load.ts';
import { buildVenuePlan, inferVenueId } from '../core/add-venue.ts';
import { withFileLockSync, writeFileAtomicSync } from '../core/fs-safe.ts';
import { ADD_VENUE_USAGE, parseAddVenueArgs, type AddVenueArgs } from './add-venue-args.ts';

function printUsage(): void {
  console.log(ADD_VENUE_USAGE);
}

async function promptText(question: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(question)).trim();
  } finally {
    readline.close();
  }
}

async function fillInteractive(args: AddVenueArgs): Promise<void> {
  const interactive = !args.json && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!args.id) {
    const inferred = inferVenueId(args.sourceUrl!);
    if (inferred) {
      args.id = inferred;
      if (!args.json) console.log(`根据域名推断 venue id：${inferred}（可用 --id 覆盖）`);
    } else if (interactive) {
      args.id = await promptText('venue id（小写字母/数字/连字符）：');
    }
  }
  if (!args.id) throw new Error('无法从域名推断 venue id，请显式提供 --id');
  if (!args.short) {
    if (!interactive) throw new Error('缺少 --short（venue 简称）');
    args.short = await promptText('venue 简称（如 ECCV）：');
  }
  if (!args.full) {
    if (!interactive) throw new Error('缺少 --full（venue 官方全称）');
    args.full = await promptText('venue 官方全称：');
  }
}

async function main(): Promise<void> {
  let args: AddVenueArgs;
  try {
    args = parseAddVenueArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`错误：${(error as Error).message}`);
    console.error(ADD_VENUE_USAGE);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    printUsage();
    return;
  }

  await fillInteractive(args);

  const activeFields = loadFieldPacks().filter((file) => file.data.status === 'active');
  let fieldId = args.field;
  if (!fieldId) {
    if (activeFields.length !== 1) {
      throw new Error(
        `当前有 ${activeFields.length} 个可用领域，请用 --field 指定：` +
          activeFields.map((file) => file.data.id).join(', '),
      );
    }
    fieldId = activeFields[0].data.id;
  }
  const field = activeFields.find(
    (file) => file.data.id === fieldId || file.data.slug === fieldId,
  );
  if (!field) {
    throw new Error(
      `领域 ${fieldId} 不存在或未激活；可用领域：` +
        (activeFields.map((file) => file.data.id).join(', ') || '无'),
    );
  }

  const id = args.id!;
  const venues = loadVenues();
  if (venues.some((file) => file.data.id === id)) {
    throw new Error(`venue ${id} 已存在（data/venues）`);
  }
  const venuePath = repoPath('data', 'venues', `${id}.yaml`);
  if (existsSync(venuePath)) throw new Error(`文件已存在，拒绝覆盖：data/venues/${id}.yaml`);

  const registryPath = repoPath('sources', 'registry.yaml');
  const registryYaml = readFileSync(registryPath, 'utf8');
  if (loadRegistry(registryPath).some((entry) => entry.venue_id === id)) {
    throw new Error(`venue ${id} 已在 sources/registry.yaml 登记`);
  }

  const input = {
    id,
    short: args.short!,
    full: args.full!,
    type: args.type,
    fieldId: field.data.id,
    sourceUrl: args.sourceUrl!,
    officialUrl: args.officialUrl ?? undefined,
    publisher: args.publisher ?? undefined,
    submissionModel: args.model ?? undefined,
    adapter: args.adapter ?? undefined,
    cadence: args.cadence ?? undefined,
  };
  let plan = buildVenuePlan(input, registryYaml);

  if (args.write) {
    plan = withFileLockSync(registryPath, () => {
      // 在锁内重新读取并生成，避免两个并发 add-venue 互相覆盖。
      const freshRegistryYaml = readFileSync(registryPath, 'utf8');
      if (existsSync(venuePath)) {
        throw new Error(`文件已存在，拒绝覆盖：data/venues/${id}.yaml`);
      }
      const freshPlan = buildVenuePlan(input, freshRegistryYaml);

      let wroteVenue = false;
      try {
        writeFileSync(venuePath, freshPlan.venueYaml, { encoding: 'utf8', flag: 'wx' });
        wroteVenue = true;
        writeFileAtomicSync(registryPath, freshPlan.registryYaml);
        return freshPlan;
      } catch (error) {
        if (wroteVenue) {
          try {
            unlinkSync(venuePath);
          } catch {
            // 清理失败时保留原始错误；registry 仍是原子写之前的版本。
          }
        }
        throw error;
      }
    });
  }

  const result = {
    written: args.write,
    files: {
      venue: `data/venues/${id}.yaml`,
      registry: 'sources/registry.yaml',
    },
    venue: plan.venue,
    source: plan.source,
    warnings: plan.warnings,
  };

  if (args.json) {
    console.log(JSON.stringify(args.write ? result : { ...result, preview: { ...plan } }, null, 2));
  } else {
    console.log(args.write ? '\n已写入：' : '\n预览（未写入，加 --write 落盘）：');
    console.log(`  data/venues/${id}.yaml`);
    console.log('  sources/registry.yaml（追加 1 条）');
    console.log(`  ${plan.venue.names.short} — ${plan.venue.names.full}`);
    console.log(
      `  type=${plan.venue.type} model=${plan.venue.submission_model} ` +
        `adapter=${plan.source.adapter} cadence=${plan.source.cadence}`,
    );
    console.log(`  source[${plan.source.pages[0].role}] ${plan.source.pages[0].url}`);
    for (const warning of plan.warnings) console.log(`  注意：${warning}`);
    console.log('\n下一步：');
    if (plan.venue.submission_model === 'fixed' && plan.source.adapter === 'thecvf') {
      console.log(`  npm run update:dry -- --venue ${id}`);
      console.log(`  npm run update -- --venue ${id}`);
    } else if (plan.venue.submission_model === 'fixed') {
      console.log('  该信源还没有自动抽取适配器：先补 acquire/adapters/，或按数据契约手工补带 evidence 的日期。');
    } else {
      console.log('  rolling 期刊没有截止日期；按需补充 qualifications / scope。');
    }
    console.log('  npm run validate');
  }
}

main().catch((error: unknown) => {
  console.error(`失败：${(error as Error).message}`);
  process.exitCode = 1;
});
