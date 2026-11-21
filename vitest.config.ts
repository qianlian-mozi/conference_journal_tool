import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // 使用 worker_threads 而不是 child_process fork：
    // 受限沙箱（如 DSH 的 workspace-write 模式）禁止子进程管道，
    // forks 池会因无法建立 IPC 而报 "Timeout terminating forks worker"。
    pool: 'threads',
  },
});
