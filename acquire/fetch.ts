/**
 * 抓取：只做「取一个页面并返回文本」，不解析、不落盘。
 * 失败要能区分「404 / 超时 / 网络错误」，因为三种情况在调度里的处置不同。
 */
import { lookup } from 'node:dns/promises';
import { isPrivateAddress, normalizeHttpsUrl } from '../core/net-safety.ts';

export interface FetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  fetchedAt: string;
  error?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  minIntervalMs?: number;
}

const DEFAULT_UA = 'cv-venue-radar/0.2 (+https://github.com/; data verification bot)';
const MAX_REDIRECTS = 5;

const lastHitByHost = new Map<string, number>();

/** 抓取礼仪：同一主机两次请求之间至少间隔 minIntervalMs。 */
async function throttle(url: string, minIntervalMs: number): Promise<void> {
  const host = new URL(url).host;
  const last = lastHitByHost.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastHitByHost.set(host, Date.now());
}

/**
 * 每次请求（含每一次重定向）都重新解析 DNS，拒绝任何非公网 A/AAAA 记录。
 * 这是比“看起来像公网域名”更强的边界：域名可以解析到 127.0.0.1。
 */
export async function assertPublicHttpsUrl(raw: string): Promise<string> {
  const normalized = normalizeHttpsUrl(raw);
  const host = new URL(normalized).hostname;
  let records: Awaited<ReturnType<typeof lookup>>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`DNS 解析失败（${host}）：${(error as Error).message}`);
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`DNS 没有返回地址：${host}`);
  }
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error(`拒绝抓取非公网地址：${host} -> ${record.address}`);
    }
  }
  return normalized;
}

export async function fetchPage(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const { timeoutMs = 20000, retries = 2, userAgent = DEFAULT_UA, minIntervalMs = 2000 } = options;
  let lastError = '';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      let current = await assertPublicHttpsUrl(url);
      for (let redirects = 0; ; redirects += 1) {
        if (redirects > MAX_REDIRECTS) throw new Error('重定向次数过多');
        await throttle(current, minIntervalMs);
        const response = await fetch(current, {
          headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) throw new Error(`HTTP ${response.status} 重定向缺少 Location`);
          current = await assertPublicHttpsUrl(new URL(location, current).toString());
          continue;
        }

        const html = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          finalUrl: current,
          html,
          fetchedAt: new Date().toISOString(),
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      lastError = (error as Error).message;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
  }

  return {
    ok: false,
    status: 0,
    finalUrl: url,
    html: '',
    fetchedAt: new Date().toISOString(),
    error: lastError || 'unknown fetch error',
  };
}
