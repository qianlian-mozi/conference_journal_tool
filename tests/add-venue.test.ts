import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  appendSourceRegistry,
  buildVenuePlan,
  inferAdapter,
  inferVenueId,
  normalizeHttpsUrl,
} from '../core/add-venue.ts';
import { VenueSchema, type SourceEntry } from '../core/schema.ts';
import { isPrivateAddress } from '../core/net-safety.ts';
import { assertPublicHttpsUrl } from '../acquire/fetch.ts';
import { parseAddVenueArgs } from '../cmd/add-venue-args.ts';

const registry = `schema_version: 2
# 测试用登记表，不依赖仓库数据
sources:
  - venue_id: cvpr
    adapter: thecvf
    cadence: weekly
    pages:
      - role: dates
        url: https://cvpr.thecvf.com/Conferences/2027/Dates
    cross_check: []
`;

const baseInput = {
  id: 'demo-conf',
  short: 'DEMO',
  full: 'Demo Conference on Testing',
  type: 'conference' as const,
  fieldId: 'computer-vision',
  sourceUrl: 'https://demo.thecvf.com/Conferences/2027/Dates',
};

describe('add-venue URL 与推断', () => {
  it('只接受公开的 HTTPS 地址并去掉 fragment', () => {
    expect(normalizeHttpsUrl('https://eccv.ecva.net/dates#top')).toBe('https://eccv.ecva.net/dates');
    expect(() => normalizeHttpsUrl('http://eccv.ecva.net/')).toThrow(/https/);
    expect(() => normalizeHttpsUrl('https://localhost/dates')).toThrow(/公开域名/);
    expect(() => normalizeHttpsUrl('https://localhost./dates')).toThrow(/公开域名/);
    expect(() => normalizeHttpsUrl('https://foo.localhost./dates')).toThrow(/公开域名/);
    expect(() => normalizeHttpsUrl('https://127.0.0.1.nip.io/dates')).toThrow(/公开域名/);
    expect(() => normalizeHttpsUrl('https://127.0.0.1/dates')).toThrow(/公开域名/);
    expect(() => normalizeHttpsUrl('https://[::1]/dates')).toThrow(/公开域名/);
    expect(() => normalizeHttpsUrl('https://user:pass@localhost/')).toThrow(/用户名或密码/);
    expect(normalizeHttpsUrl('https://example.org./dates')).toBe('https://example.org/dates');
  });

  it('识别非公网 IP 段', () => {
    for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.1.1', '172.20.0.1', '192.168.1.1', '::1', 'fc00::1', 'fe80::1', 'ff02::1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('198.18.0.242')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('抓取边界复用同一套字面量拒绝规则', async () => {
    await expect(assertPublicHttpsUrl('https://localhost./dates')).rejects.toThrow(/公开域名/);
    await expect(assertPublicHttpsUrl('http://example.org/')).rejects.toThrow(/https/);
    await expect(assertPublicHttpsUrl('https://foo.localhost./dates')).rejects.toThrow(/公开域名/);
  });

  it('从官方域名推断 id 与适配器', () => {
    expect(inferVenueId('https://eccv.ecva.net/')).toBe('eccv');
    expect(inferVenueId('https://www.computer.org/csdl/journal/tp')).toBe('computer');
    expect(inferVenueId('not a url')).toBeNull();
    expect(inferAdapter('https://cvpr.thecvf.com/Conferences/2027/Dates')).toBe('thecvf');
    expect(inferAdapter('https://eccv.ecva.net/')).toBe('manual');
  });
});

describe('add-venue 骨架', () => {
  it('固定会议生成空 editions，并登记 dates 页', () => {
    const plan = buildVenuePlan(baseInput, registry);
    expect(plan.venue.editions).toEqual([]);
    expect(plan.venue.submission_model).toBe('fixed');
    expect(plan.venue.official_url).toBe('https://demo.thecvf.com/');
    expect(plan.source).toMatchObject({
      venue_id: 'demo-conf',
      adapter: 'thecvf',
      cadence: 'weekly',
      pages: [{ role: 'dates', url: baseInput.sourceUrl }],
    });
    expect(plan.warnings).toEqual([]);
    expect(VenueSchema.parse(parseYaml(plan.venueYaml))).toEqual(plan.venue);
  });

  it('滚动期刊没有日期，登记官网入口而不是 dates 页', () => {
    const plan = buildVenuePlan(
      {
        ...baseInput,
        id: 'demo-journal',
        type: 'journal',
        sourceUrl: 'https://example.org/journal',
        publisher: 'Demo Society',
        officialUrl: 'https://example.org/journal/home',
      },
      registry,
    );
    expect(plan.venue.submission_model).toBe('rolling');
    expect(plan.venue.editions).toEqual([]);
    expect(plan.venue.publisher).toBe('Demo Society');
    expect(plan.source.adapter).toBe('manual');
    expect(plan.source.cadence).toBe('manual');
    expect(plan.source.pages).toEqual([{ role: 'home', url: 'https://example.org/journal' }]);
  });

  it('期刊未显式给官网时保留入口路径，不截成域名根', () => {
    const plan = buildVenuePlan(
      {
        ...baseInput,
        id: 'demo-journal',
        type: 'journal',
        sourceUrl: 'https://www.computer.org/csdl/journal/tp',
      },
      registry,
    );
    expect(plan.venue.official_url).toBe('https://www.computer.org/csdl/journal/tp');
    expect(plan.source.pages[0]).toEqual({
      role: 'home',
      url: 'https://www.computer.org/csdl/journal/tp',
    });
  });

  it('显式字段覆盖默认推断并给出人工适配提醒', () => {
    const plan = buildVenuePlan(
      {
        ...baseInput,
        sourceUrl: 'https://example.org/2027/dates',
        type: 'journal',
        submissionModel: 'fixed',
        adapter: 'manual',
        cadence: 'daily',
      },
      registry,
    );
    expect(plan.source.pages[0].role).toBe('dates');
    expect(plan.source.cadence).toBe('daily');
    expect(plan.warnings.join('\n')).toContain('manual adapter');
  });

  it('拒绝非法 id、空名称和重复源登记', () => {
    expect(() => buildVenuePlan({ ...baseInput, id: 'Demo Conf' }, registry)).toThrow(/id/);
    expect(() => buildVenuePlan({ ...baseInput, full: '   ' }, registry)).toThrow(/full/);
    expect(() => buildVenuePlan({ ...baseInput, id: 'cvpr' }, registry)).toThrow(/已有 cvpr/);
  });

  it('追加登记保留已有注释，且不改变原有条目', () => {
    const source = buildVenuePlan(baseInput, registry).source;
    const next = appendSourceRegistry(registry, source);
    expect(next).toContain('# 测试用登记表');
    expect(next).toContain('  - venue_id: demo-conf');
    const parsed = parseYaml(next) as { sources: SourceEntry[] };
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].venue_id).toBe('cvpr');
    expect(parsed.sources.at(-1)).toEqual(source);
  });

  it('空 sources 列表也能追加，并保留行尾注释', () => {
    const empty = 'schema_version: 2\nsources: [] # 保留我\n';
    const source = buildVenuePlan(baseInput, empty).source;
    const next = appendSourceRegistry(empty, source);
    expect(next).toContain('# 保留我');
    expect((parseYaml(next) as { sources: SourceEntry[] }).sources).toEqual([source]);
  });

  it('兼容无缩进的合法 YAML 序列', () => {
    const indentless = `schema_version: 2
sources:
- venue_id: cvpr
  adapter: thecvf
  cadence: weekly
  pages:
  - role: dates
    url: https://cvpr.thecvf.com/Conferences/2027/Dates
  cross_check: []
`;
    const source = buildVenuePlan(baseInput, indentless).source;
    const next = appendSourceRegistry(indentless, source);
    expect(next).toContain('\n- venue_id: demo-conf');
    expect((parseYaml(next) as { sources: SourceEntry[] }).sources).toHaveLength(2);
  });

  it('拒绝无法安全追加的流式 sources', () => {
    const flow = `schema_version: 2
sources: [{ venue_id: cvpr, adapter: thecvf, cadence: weekly, pages: [{ role: dates, url: https://cvpr.thecvf.com/Conferences/2027/Dates }], cross_check: [] }]
`;
    const source = buildVenuePlan(baseInput, registry).source;
    expect(() => appendSourceRegistry(flow, source)).toThrow(/流式/);
  });
});

describe('add-venue 参数解析', () => {
  it('支持位置 URL、等号参数和交互缺省', () => {
    const args = parseAddVenueArgs([
      '--id=eccv',
      '--short',
      'ECCV',
      '--full',
      'European Conference on Computer Vision',
      '--type',
      'journal',
      '--model',
      'rolling',
      '--write',
      '--json',
      'https://eccv.ecva.net/',
    ]);
    expect(args).toMatchObject({
      sourceUrl: 'https://eccv.ecva.net/',
      id: 'eccv',
      short: 'ECCV',
      full: 'European Conference on Computer Vision',
      type: 'journal',
      model: 'rolling',
      write: true,
      json: true,
      help: false,
    });
  });

  it('拒绝未知参数、缺值和重复 URL', () => {
    expect(() => parseAddVenueArgs(['https://example.org/'])).not.toThrow();
    expect(() => parseAddVenueArgs([])).toThrow(/缺少官网入口/);
    expect(() => parseAddVenueArgs(['https://example.org/', '--wat'])).toThrow(/未知参数/);
    expect(() => parseAddVenueArgs(['https://example.org/', '--id'])).toThrow(/需要/);
    expect(() => parseAddVenueArgs(['https://example.org/', '--type', 'workshop'])).toThrow(/type/);
    expect(() => parseAddVenueArgs(['https://a.org/', 'https://b.org/'])).toThrow(/多余/);
    expect(() => parseAddVenueArgs(['--help'])).not.toThrow();
  });
});
