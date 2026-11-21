import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { withFileLockSync, writeFileAtomicSync } from '../core/fs-safe.ts';

const dir = mkdtempSync(join(tmpdir(), 'cv-venue-fs-safe-'));
const target = join(dir, 'registry.yaml');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('原子写与文件锁', () => {
  it('原子替换内容，不留下临时文件', () => {
    writeFileSync(target, 'old\n', 'utf8');
    writeFileAtomicSync(target, 'new\n');
    expect(readFileSync(target, 'utf8')).toBe('new\n');
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('目标目录不可写时不破坏原文件', () => {
    const missing = join(dir, 'missing', 'registry.yaml');
    expect(() => writeFileAtomicSync(missing, 'x')).toThrow();
    expect(existsSync(missing)).toBe(false);
  });

  it('回调抛错后释放锁，后续操作可以继续', () => {
    expect(() =>
      withFileLockSync(target, () => {
        throw new Error('boom');
      }),
    ).toThrow(/boom/);
    expect(existsSync(`${target}.lock`)).toBe(false);
    expect(withFileLockSync(target, () => 'ok')).toBe('ok');
  });

  it('超时后拒绝等待，过期锁可被接管', () => {
    writeFileSync(`${target}.lock`, 'held', 'utf8');
    expect(() => withFileLockSync(target, () => 'no', { timeoutMs: 10 })).toThrow(/超时/);

    const old = new Date(Date.now() - 60_000);
    utimesSync(`${target}.lock`, old, old);
    expect(withFileLockSync(target, () => 'recovered', { timeoutMs: 1000 })).toBe('recovered');
  });
});
