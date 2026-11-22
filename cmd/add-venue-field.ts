import type { LoadedFile } from '../core/load.ts';
import type { FieldPack } from '../core/schema.ts';

export function chooseOnboardingField(
  fields: Array<LoadedFile<FieldPack>>,
  requestedId?: string,
): LoadedFile<FieldPack> {
  const active = fields.filter((file) => file.data.status === 'active');
  const available = fields.filter(
    (file) => file.data.status === 'active' || file.data.status === 'planned',
  );

  if (!requestedId) {
    if (active.length !== 1) {
      throw new Error(
        `当前有 ${active.length} 个可用领域，请用 --field 指定：` +
          active.map((file) => file.data.id).join(', '),
      );
    }
    return active[0];
  }

  const selected = available.find(
    (file) => file.data.id === requestedId || file.data.slug === requestedId,
  );
  if (!selected) {
    throw new Error(
      `领域 ${requestedId} 不存在或已归档；可用领域：` +
        (available.map((file) => file.data.id).join(', ') || '无'),
    );
  }
  return selected;
}
