import { describe, expect, it } from 'vitest';
import { chooseOnboardingField } from '../cmd/add-venue-field.ts';
import type { LoadedFile } from '../core/load.ts';
import type { FieldPack } from '../core/schema.ts';

function field(status: FieldPack['status'], id = status): LoadedFile<FieldPack> {
  return {
    path: `data/fields/${id}.yaml`,
    relativePath: `data/fields/${id}.yaml`,
    data: {
      schema_version: 2,
      id,
      slug: id,
      names: { zh: id, en: id },
      status,
      tier: 'community',
      is_default: false,
      qualification_systems: [],
    },
  };
}

describe('chooseOnboardingField', () => {
  it('允许向 planned 包接入首批 venue', () => {
    const selected = chooseOnboardingField(
      [field('active', 'cv'), field('planned', 'robotics')],
      'robotics',
    );
    expect(selected.data.id).toBe('robotics');
  });

  it('拒绝 archived 或不存在的包', () => {
    const fields = [field('active', 'cv'), field('archived', 'old')];
    expect(() => chooseOnboardingField(fields, 'old')).toThrow('领域 old 不存在或已归档');
    expect(() => chooseOnboardingField(fields, 'missing')).toThrow('可用领域：cv');
  });

  it('省略 --field 时只在唯一 active 包下自动选择', () => {
    expect(chooseOnboardingField([field('active', 'cv'), field('planned', 'robotics')]).data.id).toBe('cv');
    expect(() => chooseOnboardingField([field('active', 'cv'), field('active', 'graphics')]))
      .toThrow('请用 --field 指定：cv, graphics');
  });
});
