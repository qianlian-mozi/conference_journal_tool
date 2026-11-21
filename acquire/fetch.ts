/**
 * 抓取：只做「取一个页面并返回文本」，不解析、不落盘。
 * 失败要能区分「404 / 超时 / 网络错误」，因为三种情况在调度里的处置不同。
 */
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

const lastHitByHost = new Map<string, number>();

/** 抓取礼仪：同一主机两次请求之间至少间隔 minIntervalMs。 */
async function throttle(url: string, minIntervalMs: number): Promise<void> {
  const host = new URL(url).host;
  const last = lastHitByHost.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastHitByHost.set(host, Date.now());
}

export async function fetchPage(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const { timeoutMs = 20000, retries = 2, userAgent = DEFAULT_UA, minIntervalMs = 2000 } = options;
  let lastError = '';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await throttle(url, minIntervalMs);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const html = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        finalUrl: response.url,
        html,
        fetchedAt: new Date().toISOString(),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
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
