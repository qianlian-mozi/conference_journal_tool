import { readFileSync } from 'node:fs';
import { writeFileAtomicSync } from './fs-safe.ts';

export interface StagedFileWrite {
  path: string;
  content: string;
  previousContent: string;
  label?: string;
}

export type AtomicWriter = (path: string, content: string) => void;

/**
 * 提交已暂存的 venue 写入，再执行 changelog 收尾。
 *
 * 任一步失败都会把已成功写入的文件恢复为 previousContent，避免 venue 已更新而
 * changelog 失败、重试又因 diff 为空而永久丢历史。调用方负责用文件锁串行化提交。
 */
export function commitStagedWrites(
  writes: StagedFileWrite[],
  finalize: () => void,
  writer: AtomicWriter = writeFileAtomicSync,
): void {
  const applied: StagedFileWrite[] = [];
  try {
    // 暂存发生在抓取阶段，提交发生在锁内；期间文件可能被另一个进程改过。
    for (const write of writes) {
      if (readFileSync(write.path, 'utf8') !== write.previousContent) {
        throw new Error(`文件在暂存后被其他进程修改，拒绝覆盖：${write.path}`);
      }
    }
    for (const write of writes) {
      writer(write.path, write.content);
      applied.push(write);
    }
    finalize();
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const write of applied.reverse()) {
      try {
        writer(write.path, write.previousContent);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        '更新提交失败，且部分 venue 文件回滚失败；请先检查磁盘与文件权限',
      );
    }
    throw error;
  }
}
