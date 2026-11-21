/**
 * 小文件的原子写与跨进程互斥。
 *
 * 原子写：同目录临时文件 → fsync → rename。失败时目标文件保持原样。
 * 文件锁：`<target>.lock` 的 O_EXCL 创建；超时或进程崩溃后由 mtime 判定过期。
 */
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function writeFileAtomicSync(target: string, content: string): void {
  const temp = join(
    dirname(target),
    `.${basename(target)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  let fd: number | undefined;
  try {
    fd = openSync(temp, 'wx', 0o644);
    writeFileSync(fd, content, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, target);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(temp);
    } catch {
      // 临时文件可能尚未创建，或已被 rename。
    }
    throw error;
  }
}

export interface LockOptions {
  timeoutMs?: number;
  staleMs?: number;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 串行化对同一文件的“读—改—写”；回调抛错时也会释放锁。 */
export function withFileLockSync<T>(
  target: string,
  fn: () => T,
  options: LockOptions = {},
): T {
  const { timeoutMs = 5000, staleMs = 30_000 } = options;
  const lockPath = `${target}.lock`;
  const deadline = Date.now() + timeoutMs;
  const token = `${process.pid}-${randomBytes(6).toString('hex')}`;

  for (;;) {
    let fd: number | undefined;
    try {
      fd = openSync(lockPath, 'wx', 0o644);
      writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), token }));
      closeSync(fd);
      fd = undefined;
      break;
    } catch (error) {
      if (fd !== undefined) closeSync(fd);
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        try {
          unlinkSync(lockPath);
        } catch {
          // 创建锁失败时文件可能不存在。
        }
        throw error;
      }
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        // 锁刚被另一个进程释放，直接重试。
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`等待文件锁超时：${lockPath}`);
      }
      sleepSync(50);
    }
  }

  try {
    return fn();
  } finally {
    try {
      // 只删除自己持有的锁：过期锁被接管后，原持有者不能误删新锁。
      if (readFileSync(lockPath, 'utf8').includes(token)) unlinkSync(lockPath);
    } catch {
      // 锁已被清理时无需再报错。
    }
  }
}
