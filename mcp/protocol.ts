import { callTool } from './tools.ts';

export const TOOLS = [
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
] as const;

type RequestId = number | string | null;
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: RequestId;
  method: string;
  params?: Record<string, unknown>;
}

function result(id: RequestId | undefined, value: unknown) {
  return { jsonrpc: '2.0', id, result: value };
}

function error(id: RequestId | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export function parseError() {
  return error(null, -32700, 'parse error');
}

function textContent(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const validId =
    request.id === undefined || request.id === null || typeof request.id === 'string' || typeof request.id === 'number';
  return request.jsonrpc === '2.0' && typeof request.method === 'string' && request.method.length > 0 && validId;
}

/** 处理一条 JSON-RPC 消息；notification 返回 null，非法请求不会使进程崩溃。 */
export function handleMessage(message: unknown) {
  if (!isRequest(message)) return error(null, -32600, 'Invalid Request');
  const { id, method, params } = message;
  const notification = !Object.hasOwn(message, 'id');
  const reply = (value: unknown) => (notification ? null : result(id, value));
  const replyError = (code: number, text: string) => (notification ? null : error(id, code, text));

  if (method === 'initialize') {
    return reply({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'venue-radar', version: '0.1.0' },
    });
  }
  if (method.startsWith('notifications/')) return null;
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const name = typeof params?.name === 'string' ? params.name : '';
    if (!TOOLS.some((tool) => tool.name === name)) return replyError(-32602, `unknown tool: ${name}`);
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    try {
      return reply(textContent(callTool(name, args)));
    } catch (caught) {
      return reply({
        content: [{ type: 'text', text: (caught as Error).message }],
        isError: true,
      });
    }
  }

  return replyError(-32601, `unknown method: ${method}`);
}
