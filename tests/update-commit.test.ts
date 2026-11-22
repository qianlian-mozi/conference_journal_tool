import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomicSync } from '../core/fs-safe.ts';
import { commitStagedWrites } from '../core/update-commit.ts';

describe('update transaction', () => {
  it('changelog 写入失败会回滚 venue，修复后可重试', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-radar-update-'));
    try {
      const venuePath = join(dir, 'venue.yaml');
      const changelogPath = join(dir, 'changelog.yaml');
      writeFileSync(venuePath, 'old venue\n', 'utf8');
      writeFileSync(changelogPath, 'old changelog\n', 'utf8');
      let failChangelog = true;
      const writer = (path: string, content: string) => {
        if (path === changelogPath && failChangelog) throw new Error('injected changelog failure');
        writeFileAtomicSync(path, content);
      };
      const staged = [{
        path: venuePath,
        content: 'new venue\n',
        previousContent: 'old venue\n',
      }];
      const finalize = () => writer(changelogPath, 'new changelog\n');

      expect(() => commitStagedWrites(staged, finalize, writer)).toThrow('injected changelog failure');
      expect(readFileSync(venuePath, 'utf8')).toBe('old venue\n');
      expect(readFileSync(changelogPath, 'utf8')).toBe('old changelog\n');

      failChangelog = false;
      commitStagedWrites(staged, finalize, writer);
      expect(readFileSync(venuePath, 'utf8')).toBe('new venue\n');
      expect(readFileSync(changelogPath, 'utf8')).toBe('new changelog\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('venue 写入失败时不执行 changelog 收尾', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-radar-update-'));
    try {
      const venuePath = join(dir, 'venue.yaml');
      writeFileSync(venuePath, 'old venue\n', 'utf8');
      let finalized = false;
      const writer = () => {
        throw new Error('injected venue failure');
      };
      expect(() => commitStagedWrites(
        [{ path: venuePath, content: 'new venue\n', previousContent: 'old venue\n' }],
        () => { finalized = true; },
        writer,
      )).toThrow('injected venue failure');
      expect(finalized).toBe(false);
      expect(readFileSync(venuePath, 'utf8')).toBe('old venue\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('暂存后文件被其他进程修改时拒绝覆盖', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-radar-update-'));
    try {
      const venuePath = join(dir, 'venue.yaml');
      writeFileSync(venuePath, 'old venue\n', 'utf8');
      const staged = [{ path: venuePath, content: 'new venue\n', previousContent: 'old venue\n' }];
      writeFileSync(venuePath, 'other process\n', 'utf8');
      let finalized = false;
      expect(() => commitStagedWrites(staged, () => { finalized = true; }))
        .toThrow('文件在暂存后被其他进程修改');
      expect(finalized).toBe(false);
      expect(readFileSync(venuePath, 'utf8')).toBe('other process\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
