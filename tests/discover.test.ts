import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAddVenueCommand,
  matchCandidates,
  parseDiscoveryCatalog,
  type DiscoveryCatalog,
} from '../core/discover.ts';
import { DiscoverArgError, parseDiscoverArgs } from '../cmd/discover-args.ts';

const catalogYaml = `schema_version: 2
field_id: computer-vision
candidates:
  - id: demo-conf
    names:
      short: DEMO
      full: Demo Conference on Vision
    type: conference
    official_url: https://demo.example.org/
    aliases: [demo vision]
  - id: demo-journal
    names:
      short: DJ
      full: Demo Journal of Vision
    type: journal
    official_url: https://journal.example.org/
    publisher: Example
    submission_model: rolling
    adapter: manual
    cadence: manual
  - id: known-conf
    names:
      short: KNOWN
      full: Known Conference
    type: conference
    official_url: https://known.example.org/
`;

function catalog(): DiscoveryCatalog {
  return parseDiscoveryCatalog(catalogYaml);
}

describe('discover 候选清单', () => {
  it('解析合法清单并补默认 aliases', () => {
    const parsed = catalog();
    expect(parsed.field_id).toBe('computer-vision');
    expect(parsed.candidates).toHaveLength(3);
    expect(parsed.candidates[2].aliases).toEqual([]);
  });

  it('仓库自带的 computer-vision 候选清单可解析', () => {
    const raw = readFileSync(
      new URL('../data/discovery/computer-vision.yaml', import.meta.url),
      'utf8',
    );
    const shipped = parseDiscoveryCatalog(raw);
    expect(shipped.field_id).toBe('computer-vision');
    expect(shipped.candidates.length).toBeGreaterThan(0);
    expect(new Set(shipped.candidates.map((candidate) => candidate.id)).size).toBe(
      shipped.candidates.length,
    );
  });

  it('拒绝 http、未知字段和重复解析错误', () => {
    expect(() =>
      parseDiscoveryCatalog(
        catalogYaml.replace('https://demo.example.org/', 'http://demo.example.org/'),
      ),
    ).toThrow();
    expect(() =>
      parseDiscoveryCatalog(catalogYaml.replace('    aliases: [demo vision]', '    unknown: x')),
    ).toThrow();
    expect(() =>
      parseDiscoveryCatalog(
        catalogYaml.replace('  - id: known-conf', '  - id: demo-conf'),
      ),
    ).toThrow(/重复/);
  });
});

describe('discover 匹配', () => {
  it('按 short、full、alias 做 token AND 匹配', () => {
    const matches = matchCandidates(catalog(), new Set(), { query: 'demo' });
    expect(matches.map((match) => match.candidate.id)).toEqual(['demo-conf', 'demo-journal']);

    const alias = matchCandidates(catalog(), new Set(), { query: 'demo vision' });
    expect(alias.map((match) => match.candidate.id)).toEqual(['demo-conf', 'demo-journal']);

    expect(matchCandidates(catalog(), new Set(), { query: 'demo conf' })).toHaveLength(1);
    expect(matchCandidates(catalog(), new Set(), { query: 'nothing' })).toEqual([]);
  });

  it('按类型过滤，并默认隐藏已收录', () => {
    const options = { query: 'demo' };
    expect(matchCandidates(catalog(), new Set(['demo-conf']), options).map((m) => m.candidate.id)).toEqual([
      'demo-journal',
    ]);
    expect(
      matchCandidates(catalog(), new Set(['demo-conf']), {
        ...options,
        includeRegistered: true,
      }).map((m) => m.candidate.id),
    ).toEqual(['demo-conf', 'demo-journal']);
    expect(matchCandidates(catalog(), new Set(), { type: 'journal' }).map((m) => m.candidate.id)).toEqual([
      'demo-journal',
    ]);
  });

  it('限制返回条数', () => {
    expect(matchCandidates(catalog(), new Set(), { limit: 1 })).toHaveLength(1);
    expect(matchCandidates(catalog(), new Set(), { limit: 0 })).toEqual([]);
  });
});

describe('discover 接入命令', () => {
  it('期刊用官网入口作为信源，生成完整 add-venue 命令', () => {
    const journal = catalog().candidates[1];
    const command = buildAddVenueCommand(journal);
    expect(command).toContain('npm run add-venue -- --write');
    expect(command).toContain('--id demo-journal');
    expect(command).toContain('--type journal');
    expect(command).toContain('--field computer-vision');
    expect(command).toContain('--model rolling');
    expect(command).toContain('--adapter manual');
    expect(command).toContain('--cadence manual');
  });

  it('没有当届信源页的会议不生成命令', () => {
    expect(buildAddVenueCommand(catalog().candidates[0])).toBeNull();
  });

  it('已收录的候选不生成命令', () => {
    const [match] = matchCandidates(catalog(), new Set(['demo-conf']), {
      query: 'demo-conf',
      includeRegistered: true,
    });
    expect(match.registered).toBe(true);
    expect(match.addCommand).toBeNull();
  });
});

describe('discover 参数', () => {
  it('解析关键词、类型、领域与验证开关', () => {
    const args = parseDiscoverArgs([
      'pattern',
      'recognition',
      '--type',
      'journal',
      '--field',
      'computer-vision',
      '--limit',
      '5',
      '--all',
      '--verify',
      '--json',
    ]);
    expect(args).toMatchObject({
      query: 'pattern recognition',
      type: 'journal',
      fieldId: 'computer-vision',
      limit: 5,
      includeRegistered: true,
      verify: true,
      json: true,
    });
  });

  it('拒绝未知参数、缺值、非法类型和 URL', () => {
    expect(() => parseDiscoverArgs(['--unknown'])).toThrow(DiscoverArgError);
    expect(() => parseDiscoverArgs(['--type'])).toThrow(/需要一个值/);
    expect(() => parseDiscoverArgs(['--type', 'workshop'])).toThrow(/conference 或 journal/);
    expect(() => parseDiscoverArgs(['--limit', '0'])).toThrow(/1 到 100/);
    expect(() => parseDiscoverArgs(['--field', 'Computer Vision'])).toThrow(/小写 slug/);
    expect(() => parseDiscoverArgs(['https://example.org'])).toThrow(/不接受 URL/);
  });

  it('布尔开关可重复出现，--help 不要求关键词', () => {
    expect(parseDiscoverArgs(['--json', '--json', '--help']).help).toBe(true);
    expect(parseDiscoverArgs([]).query).toBe('');
  });
});
