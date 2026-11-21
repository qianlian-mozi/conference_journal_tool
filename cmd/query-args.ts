export interface QueryArgs {
  field: string | null;
  type: 'conference' | 'journal' | null;
  within: number | null;
  venue: string | null;
  json: boolean;
  open: boolean;
  help: boolean;
}

export const QUERY_USAGE =
  '用法：node cmd/query.ts [--json] [--open] [--field <id>] [--type conference|journal] [--within <非负天数>] [--venue <id>]';

export function parseQueryArgs(argv: string[]): QueryArgs {
  const args: QueryArgs = {
    field: null,
    type: null,
    within: null,
    venue: null,
    json: false,
    open: false,
    help: false,
  };

  const valueOf = (inline: string | undefined, name: string, index: number): [string, number] => {
    if (inline !== undefined) {
      if (!inline.trim()) throw new Error(`${name} 需要一个非空值`);
      return [inline, index];
    }
    const value = argv[index + 1];
    if (!value || !value.trim() || value.startsWith('--')) throw new Error(`${name} 需要一个非空值`);
    return [value, index + 1];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--open') args.open = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else {
      const equals = arg.indexOf('=');
      const name = equals === -1 ? arg : arg.slice(0, equals);
      const inline = equals === -1 ? undefined : arg.slice(equals + 1);
      if (!['--field', '--type', '--within', '--venue'].includes(name)) {
        throw new Error(`未知参数：${arg}`);
      }
      const [value, nextIndex] = valueOf(inline, name, index);
      index = nextIndex;
      if (name === '--field') args.field = value;
      else if (name === '--venue') args.venue = value;
      else if (name === '--type') {
        if (value !== 'conference' && value !== 'journal') {
          throw new Error('--type 只支持 conference 或 journal');
        }
        args.type = value;
      } else {
        const within = Number(value);
        if (!Number.isFinite(within) || within < 0) {
          throw new Error('--within 需要一个非负数字（天）');
        }
        args.within = within;
      }
    }
  }
  return args;
}
