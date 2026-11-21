import { readSnapshot } from '../core/load.ts';
import { snapshotContainsQuote } from './snapshot.ts';

export interface SnapshotEvidence {
  quote: string;
  snapshot_hash?: string;
}

/** 返回 null 表示证据可回验；否则返回可直接拼上条目前缀的错误。 */
export function snapshotEvidenceError(
  venueId: string,
  evidence: SnapshotEvidence,
  snapshotText?: string,
): string | null {
  const hash = evidence.snapshot_hash;
  if (!hash) return 'evidence 缺少 snapshot_hash，无法回验 quote';
  const snapshot = snapshotText === undefined ? readSnapshot(venueId, hash) : snapshotText;
  if (snapshot === null) {
    return `缺少快照文件 data/snapshots/${venueId}/${hash}.txt`;
  }
  if (!snapshotContainsQuote(snapshot, evidence.quote)) {
    return `quote 未能在快照中命中：「${evidence.quote}」`;
  }
  return null;
}
