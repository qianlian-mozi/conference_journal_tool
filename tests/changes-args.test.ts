import { describe, expect, it } from 'vitest';
import { ChangesArgError, parseChangesArgs } from '../cmd/changes-args.ts';

describe('parseChangesArgs', () => {
  it('uses a seven-day window by default', () => {
    expect(parseChangesArgs([])).toEqual({
      days: 7,
      pack: null,
      venue: null,
      json: false,
      help: false,
    });
  });

  it('parses a bounded window and filters', () => {
    expect(parseChangesArgs(['--days', '30', '--pack', '3dgs-avatar', '--venue', 'siggraph', '--json'])).toEqual({
      days: 30,
      pack: '3dgs-avatar',
      venue: 'siggraph',
      json: true,
      help: false,
    });
  });

  it.each([['--days'], ['--pack'], ['--venue']])('rejects a missing value for %s', (flag) => {
    expect(() => parseChangesArgs([flag])).toThrow(ChangesArgError);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc'], ['3651']])('rejects invalid --days %s', (days) => {
    expect(() => parseChangesArgs(['--days', days])).toThrow('--days');
  });

  it('rejects unknown arguments', () => {
    expect(() => parseChangesArgs(['--limit', '3'])).toThrow('未知参数');
  });
});
