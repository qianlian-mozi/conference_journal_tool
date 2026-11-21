import type { SourceAdapter, SourceCadence, SubmissionModel, VenueType } from '../core/add-venue.ts';

export interface AddVenueArgs {
  sourceUrl: string | null;
  id: string | null;
  short: string | null;
  full: string | null;
  type: VenueType;
  field: string | null;
  officialUrl: string | null;
  publisher: string | null;
  model: SubmissionModel | null;
  adapter: SourceAdapter | null;
  cadence: SourceCadence | null;
  write: boolean;
  json: boolean;
  help: boolean;
}

export const ADD_VENUE_USAGE = `用法：
  node cmd/add-venue.ts <官网入口 URL> [选项]

必填（缺省时交互询问）：
  --id <slug>             venue id，如 eccv
  --short <名称>          简称，如 ECCV
  --full <全称>           官方全称

可选：
  --type conference|journal   默认 conference
  --field <id>                领域 id；只有一个可用领域时自动选择
  --official-url <url>        官网主页；会议默认取入口 origin，期刊默认取入口 URL
  --publisher <名称>
  --model fixed|rolling       默认会议 fixed、期刊 rolling
  --adapter thecvf|manual     默认按域名推断
  --cadence daily|weekly|monthly|manual
  --write                     真正写入；默认只预览
  --json                      机器可读输出
  --help

示例：
  node cmd/add-venue.ts https://eccv.ecva.net/ --id eccv --short ECCV --full "European Conference on Computer Vision"
  npm run add-venue -- --write https://example.org/2027/dates --id example ...`;

const VALUE_FLAGS = new Set([
  '--id',
  '--short',
  '--full',
  '--type',
  '--field',
  '--official-url',
  '--publisher',
  '--model',
  '--adapter',
  '--cadence',
]);

function parseValue(
  argv: string[],
  index: number,
  inline: string | undefined,
  name: string,
): [string, number] {
  if (inline !== undefined) {
    if (!inline.trim()) throw new Error(`${name} 需要一个非空值`);
    return [inline, index];
  }
  const value = argv[index + 1];
  if (!value || !value.trim() || value.startsWith('--')) {
    throw new Error(`${name} 需要一个非空值`);
  }
  return [value, index + 1];
}

export function parseAddVenueArgs(argv: string[]): AddVenueArgs {
  const args: AddVenueArgs = {
    sourceUrl: null,
    id: null,
    short: null,
    full: null,
    type: 'conference',
    field: null,
    officialUrl: null,
    publisher: null,
    model: null,
    adapter: null,
    cadence: null,
    write: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') args.write = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('-')) {
      const equals = arg.indexOf('=');
      const name = equals === -1 ? arg : arg.slice(0, equals);
      const inline = equals === -1 ? undefined : arg.slice(equals + 1);
      if (!VALUE_FLAGS.has(name)) throw new Error(`未知参数：${arg}`);
      const [value, nextIndex] = parseValue(argv, index, inline, name);
      index = nextIndex;
      if (name === '--id') args.id = value;
      else if (name === '--short') args.short = value;
      else if (name === '--full') args.full = value;
      else if (name === '--field') args.field = value;
      else if (name === '--official-url') args.officialUrl = value;
      else if (name === '--publisher') args.publisher = value;
      else if (name === '--type') {
        if (value !== 'conference' && value !== 'journal') {
          throw new Error('--type 只支持 conference 或 journal');
        }
        args.type = value;
      } else if (name === '--model') {
        if (value !== 'fixed' && value !== 'rolling') {
          throw new Error('--model 只支持 fixed 或 rolling');
        }
        args.model = value;
      } else if (name === '--adapter') {
        if (value !== 'thecvf' && value !== 'manual') {
          throw new Error('--adapter 只支持 thecvf 或 manual');
        }
        args.adapter = value;
      } else {
        if (!['daily', 'weekly', 'monthly', 'manual'].includes(value)) {
          throw new Error('--cadence 只支持 daily、weekly、monthly 或 manual');
        }
        args.cadence = value as SourceCadence;
      }
    } else {
      if (args.sourceUrl) throw new Error(`多余的参数：${arg}`);
      args.sourceUrl = arg;
    }
  }

  if (!args.help && !args.sourceUrl) {
    throw new Error('缺少官网入口 URL');
  }
  return args;
}
