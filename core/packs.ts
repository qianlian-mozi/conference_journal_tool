import type { FieldPack, Venue } from './schema.ts';

export type PackVenue = Pick<Venue, 'id' | 'field_ids'>;

/** 活跃包才进入 Web 构建；planned 包只作为接入中的声明。 */
export function activeFieldPacks(fields: FieldPack[]): FieldPack[] {
  return fields.filter((field) => field.status === 'active');
}

export function defaultFieldPack(fields: FieldPack[]): FieldPack {
  const active = activeFieldPacks(fields);
  if (active.length === 0) throw new Error('至少需要一个 active 领域包');
  const defaults = active.filter((field) => field.is_default);
  if (defaults.length > 1) {
    throw new Error(`默认领域包最多一个，当前为 ${defaults.map((field) => field.id).join(', ')}`);
  }
  return defaults[0] ?? [...active].sort((a, b) => a.id.localeCompare(b.id))[0];
}

export function venuesForPack<T extends PackVenue>(venues: T[], packId: string): T[] {
  return venues.filter((venue) => venue.field_ids.includes(packId));
}

/** 跨 pack 共享 venue，但 id、slug、默认包和活跃包内容必须无歧义。 */
export function packErrors(fields: FieldPack[], venues: PackVenue[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const field of fields) {
    if (ids.has(field.id)) errors.push(`领域包 id 重复 "${field.id}"`);
    if (slugs.has(field.slug)) errors.push(`领域包 slug 重复 "${field.slug}"`);
    ids.add(field.id);
    slugs.add(field.slug);
    if (field.id !== field.slug) {
      errors.push(`领域包 ${field.id}: slug "${field.slug}" 必须与 id 一致`);
    }
    if (field.is_default && field.status !== 'active') {
      errors.push(`领域包 ${field.id}: planned 包不能设为默认`);
    }
  }

  const active = activeFieldPacks(fields);
  if (active.length === 0) errors.push('至少需要一个 active 领域包');
  const defaults = active.filter((field) => field.is_default);
  if (defaults.length > 1) {
    errors.push(`默认领域包最多一个，当前为 ${defaults.map((field) => field.id).join(', ')}`);
  }
  for (const field of active) {
    if (venuesForPack(venues, field.id).length === 0) {
      errors.push(`活跃领域包 ${field.id} 没有任何 venue；请改为 planned 或添加 venue`);
    }
  }
  return errors;
}
