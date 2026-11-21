import type { VenueType } from '../core/add-venue.ts';

export interface DiscoverArgs {
  query: string;
  fieldId: string;
  type?: VenueType;
  includeRegistered: boolean;
  verify: boolean;
  json: boolean;
  limit: number;
  help: boolean;
}

export class DiscoverArgError extends Error {
  readonly code = 2;
  constructor(message: string) {
    super(message);
    this.name = 'DiscoverArgError';
  }
}

function requireValue(argv: string[], index: number, flag: string): string {
  const raw = argv[index + 1];
  if (raw === undefined || raw.startsWith('-')) {
    throw new DiscoverArgError(`${flag} 需要一个值`);
  }
  const value = raw.trim();
  if (!value) throw new DiscoverArgError(`${flag} 不能为空`);
  return value;
}

export function parseDiscoverArgs(argv: string[]): DiscoverArgs {
  const args: DiscoverArgs = {
    query: '',
    fieldId: 'computer-vision',
    includeRegistered: false,
    verify: false,
    json: false,
    limit: 20,
    help: false,
  };
  const queryParts: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--all') {
      args.includeRegistered = true;
      continue;
    }
    if (token === '--verify') {
      args.verify = true;
      continue;
    }

    if (token === '--field' || token === '--type' || token === '--limit') {
      if (seen.has(token)) throw new DiscoverArgError(`${token} 只能出现一次`);
      seen.add(token);
      const value = requireValue(argv, i, token);
      i += 1;
      if (token === '--field') {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
          throw new DiscoverArgError('--field 必须是小写 slug，例如 computer-vision');
        }
        args.fieldId = value;
      } else if (token === '--type') {
        if (value !== 'conference' && value !== 'journal') {
          throw new DiscoverArgError('--type 只能是 conference 或 journal');
        }
        args.type = value;
      } else {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          throw new DiscoverArgError('--limit 必须是 1 到 100 的整数');
        }
        args.limit = limit;
      }
      continue;
    }

    if (token.startsWith('-')) {
      throw new DiscoverArgError(`未知参数：${token}（用 --help 看用法）`);
    }
    if (/^https?:\/\//i.test(token)) {
      throw new DiscoverArgError('discover 接受关键词，不接受 URL；接入网址请用 npm run add-venue');
    }
    queryParts.push(token);
  }

  args.query = queryParts.join(' ').trim();
  return args;
}

export const DISCOVER_USAGE = `
用法：npm run discover -- [关键词...] [选项]

在领域候选清单里查找「还没收录」的会议/期刊。只做匹配和提示，不抓网页、不写数据。

选项：
  --field <id>         领域 id（默认 computer-vision）
  --type <type>        conference 或 journal
  --limit <n>          最多返回多少条（1-100，默认 20）
  --all                连已收录的也一起显示
  --verify             访问候选官网，确认入口是否可用
  --json               输出 JSON
  -h, --help           显示本帮助

示例：
  npm run discover -- 3dv
  npm run discover -- "pattern recognition" --type journal
  npm run discover -- --all --type conference
`.trim();
