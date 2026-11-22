import { describe, expect, it } from 'vitest';
import { loadFieldPacks, loadVenues } from '../core/load.ts';
import {
  activeFieldPacks,
  defaultFieldPack,
  packErrors,
  venuesForPack,
} from '../core/packs.ts';
import { FieldPackSchema, type FieldPack } from '../core/schema.ts';

function field(overrides: Partial<FieldPack> = {}): FieldPack {
  return FieldPackSchema.parse({
    schema_version: 2,
    id: 'demo',
    slug: 'demo',
    names: { zh: '演示', en: 'Demo' },
    status: 'active',
    ...overrides,
  });
}

describe('field packs', () => {
  it('默认 tier 为 community，is_default 为 false', () => {
    const value = field();
    expect(value.tier).toBe('community');
    expect(value.is_default).toBe(false);
  });

  it('显式默认包优先，否则按 id 选择活跃包', () => {
    const fields = [field(), field({ id: 'alpha', slug: 'alpha' }), field({ id: 'chosen', slug: 'chosen', is_default: true })];
    expect(defaultFieldPack(fields).id).toBe('chosen');
    expect(defaultFieldPack(fields.map((item) => ({ ...item, is_default: false }))).id).toBe('alpha');
    expect(activeFieldPacks([field({ status: 'planned' })])).toEqual([]);
  });

  it('同一 venue 可进入多个 pack', () => {
    const venues = [
      { id: 'shared', field_ids: ['alpha', 'beta'] },
      { id: 'other', field_ids: ['beta'] },
    ];
    expect(venuesForPack(venues, 'alpha').map((venue) => venue.id)).toEqual(['shared']);
    expect(venuesForPack(venues, 'beta').map((venue) => venue.id)).toEqual(['shared', 'other']);
  });

  it('拒绝重复 id/slug、多个默认包和空活跃包', () => {
    const errors = packErrors(
      [field({ is_default: true }), field({ is_default: true })],
      [],
    );
    expect(errors.some((error) => error.includes('id 重复'))).toBe(true);
    expect(errors.some((error) => error.includes('slug 重复'))).toBe(true);
    expect(errors.some((error) => error.includes('默认领域包最多一个'))).toBe(true);
    expect(errors.some((error) => error.includes('没有任何 venue'))).toBe(true);
  });

  it('planned 不能成为默认包，slug 必须与 id 一致', () => {
    const errors = packErrors(
      [field({ status: 'planned', is_default: true, slug: 'other' })],
      [],
    );
    expect(errors).toEqual([
      '领域包 demo: slug "other" 必须与 id 一致',
      '领域包 demo: planned 包不能设为默认',
      '至少需要一个 active 领域包',
    ]);
  });

  it('仓库的 3DGS / Avatar 是默认包且复用已有 venues', () => {
    const fields = loadFieldPacks().map((file) => file.data);
    const venues = loadVenues().map((file) => file.data);
    expect(packErrors(fields, venues)).toEqual([]);
    expect(defaultFieldPack(fields).id).toBe('3dgs-avatar');
    const avatarVenues = venuesForPack(venues, '3dgs-avatar');
    const cvVenues = venuesForPack(venues, 'computer-vision');
    expect(avatarVenues.map((venue) => venue.id)).toEqual(
      expect.arrayContaining(['cvpr', '3dv', 'siggraph', 'ismar', 'tvcg']),
    );
    expect(cvVenues.map((venue) => venue.id)).toEqual(
      expect.arrayContaining(['cvpr', 'icpr', 'wacv', 'cviu']),
    );
    expect(avatarVenues.every((venue) => venue.field_ids.includes('3dgs-avatar'))).toBe(true);
    expect(cvVenues.every((venue) => venue.field_ids.includes('computer-vision'))).toBe(true);
  });
});
