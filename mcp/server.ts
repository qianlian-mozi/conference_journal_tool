#!/usr/bin/env node
/**
 * 最小 MCP server（stdio，newline-delimited JSON-RPC 2.0）。
 *
 * 零依赖、零配置：clone 下来直接 `node mcp/server.ts`。
 * 协议与工具实现分别位于 protocol.ts / tools.ts，便于独立测试。
 */
import { createInterface } from 'node:readline';
import { handleMessage, parseError } from './protocol.ts';

const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
reader.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let response: unknown;
  try {
    response = handleMessage(JSON.parse(trimmed));
  } catch {
    response = parseError();
  }
  if (response !== null) process.stdout.write(`${JSON.stringify(response)}\n`);
});
