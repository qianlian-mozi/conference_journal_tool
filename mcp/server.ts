#!/usr/bin/env node
/**
 * 最小 MCP server（stdio，newline-delimited JSON-RPC 2.0）。
 *
 * 零依赖、零配置：clone 下来直接
 *   node mcp/server.ts
 * 然后在支持 MCP 的 agent 里把命令指向它即可。
 *
 * 暴露三个工具：
 *   search_venues  —— 按领域/类型/剩余天数筛
 *   get_venue      —— 取单个 venue 的全部日期
 *   get_deadlines  —— 平铺的截止日期列表
 *
 * 所有结果都带 evidence（官网 URL + 原文 + 核验日期），不做任何二次加工。
 */
import { createInterface } from 'node:readline';
import { loadVenues } from '../core/load.ts';
import { daysLeft, queryVenues, submitDeadline, toAgentJson } from '../core/query.ts';
import type { Venue } from '../core/schema.ts';

const venues: Venue[] = loadVenues().map((file) => file.data);

const TOOLS = [
  {
    name: 'search_venues',
    description:
      '按领域、类型、剩余天数筛选会议与期刊。返回带 evidence 的 JSON；没有日期的 venue 会以 state=unknown/rolling 出现，不会被静默丢弃。',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: '领域 id，例如 computer-vision' },
        type: { type: 'string', enum: ['conference', 'journal'] },
        within_days: { type: 'number', description: '只看未来 N 天内截止的' },
        open_only: { type: 'boolean', description: '只看还没截止的' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_venue',
    description: '按 id 取单个会议/期刊的完整信息（含所有届次与截止日期）。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_deadlines',
    description: '平铺列出截止日期，可按 venue_id 或 within_days 过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        venue_id: { type: 'string' },
        within_days: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
];

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

function send(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function result(id: JsonRpcRequest['id'], value: unknown): void {
  send({ jsonrpc: '2.0', id, result: value });
}

function fail(id: JsonRpcRequest['id'], code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function textContent(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function callTool(name: string, args: Record<string, unknown>) {
  if (name === 'search_venues') {
    const rows = queryVenues(venues, {
      field: typeof args.field === 'string' ? args.field : null,
      type: typeof args.type === 'string' ? args.type : null,
      withinDays: typeof args.within_days === 'number' ? args.within_days : null,
      openOnly: args.open_only === true,
    });
    return toAgentJson(rows);
  }

  if (name === 'get_venue') {
    const id = typeof args.id === 'string' ? args.id : '';
    const venue = venues.find((item) => item.id === id);
    if (!venue) throw new Error(`unknown venue: ${id}`);
    return toAgentJson(
      queryVenues([venue], {}).map((row) => ({
        ...row,
        deadline: row.deadline ?? submitDeadline(venue)?.deadline ?? null,
      })),
    )[0];
  }

  if (name === 'get_deadlines') {
    const venueId = typeof args.venue_id === 'string' ? args.venue_id : null;
    const withinDays = typeof args.within_days === 'number' ? args.within_days : null;
    const rows = queryVenues(venues, { venueId });
    const flattened = rows.flatMap(({ venue, edition }) =>
      (edition?.deadlines ?? []).map((deadline) => {
        const days = daysLeft(deadline);
        return {
          venue_id: venue.id,
          venue: venue.names.short,
          edition_id: edition?.id ?? null,
          ...deadline,
          days_left: days,
        };
      }),
    );
    return withinDays === null
      ? flattened
      : flattened.filter((item) => item.days_left !== null && item.days_left >= 0 && item.days_left <= withinDays);
  }

  throw new Error(`unknown tool: ${name}`);
}

function handle(message: JsonRpcRequest): void {
  const { id, method, params } = message;

  if (method === 'initialize') {
    return result(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'cv-venue-radar', version: '0.1.0' },
    });
  }
  if (method === 'notifications/initialized' || method.startsWith('notifications/')) return;
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = typeof params?.name === 'string' ? params.name : '';
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    try {
      return result(id, textContent(callTool(name, args)));
    } catch (error) {
      return result(id, {
        content: [{ type: 'text', text: (error as Error).message }],
        isError: true,
      });
    }
  }

  if (id !== undefined && id !== null) fail(id, -32601, `unknown method: ${method}`);
}

const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
reader.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message: JsonRpcRequest;
  try {
    message = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    fail(null, -32700, 'parse error');
    return;
  }
  handle(message);
});
