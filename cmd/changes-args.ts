/** `changes` 命令的参数解析；独立文件便于测试错误分支。 */
export interface ChangesArgs {
  days: number;
  pack: string | null;
  venue: string | null;
  json: boolean;
  help: boolean;
}

export const CHANGES_USAGE = `用法：
  node cmd/changes.ts [--days 7] [--pack <field>] [--venue <id>] [--json]

示例：
  node cmd/changes.ts
  node cmd/changes.ts --days 30
  node cmd/changes.ts --pack 3dgs-avatar
  node cmd/changes.ts --venue siggraph --json

说明：只读取 data/changelog.yaml 中已有的真实 diff，每条摘要都带 changelog id 与证据 URL。`;

export class ChangesArgError extends Error {
  readonly code: number;

  constructor(message: string, code = 2) {
    super(message);
    this.name = 'ChangesArgError';
    this.code = code;
  }
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--') || value.trim() === '') {
    throw new ChangesArgError(`${flag} 需要一个值。`);
  }
  return value;
}

export function parseChangesArgs(argv: string[]): ChangesArgs {
  const args: ChangesArgs = { days: 7, pack: null, venue: null, json: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--days') {
      const raw = takeValue(argv, index, token);
      index += 1;
      const days = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isInteger(days) || days < 1 || days > 3650) {
        throw new ChangesArgError('--days 必须是 1–3650 的整数。');
      }
      args.days = days;
      continue;
    }
    if (token === '--pack') {
      const value = takeValue(argv, index, token).trim();
      index += 1;
      args.pack = value;
      continue;
    }
    if (token === '--venue') {
      const value = takeValue(argv, index, token).trim();
      index += 1;
      args.venue = value;
      continue;
    }
    throw new ChangesArgError(`未知参数：${token}`);
  }

  return args;
}
