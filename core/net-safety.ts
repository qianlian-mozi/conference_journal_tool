/**
 * 网络目标安全策略：只允许公开 HTTPS 域名。
 *
 * add-venue 在写清单前做同步的「字面量」检查；fetch 在真正发请求前
 * 还会解析全部 A/AAAA 记录，并在每一次重定向后重复检查。
 */
import { isIP } from 'node:net';

const LOCAL_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.nip.io',
  '.sslip.io',
  '.xip.io',
  '.localtest.me',
  '.lvh.me',
];

export function stripTrailingDot(host: string): string {
  return host.replace(/\.+$/, '');
}

/** 明显的本机/内网/通配 DNS 名称。真正的 IP 检查由 isPrivateAddress 负责。 */
export function isLocalHostname(host: string): boolean {
  const normalized = stripTrailingDot(host.toLowerCase());
  return (
    !normalized ||
    !normalized.includes('.') ||
    normalized === 'localhost' ||
    LOCAL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

/** 规范化并限制为公开 HTTPS 地址，避免把本机/内网地址写进 Actions 的抓取清单。 */
export function normalizeHttpsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`不是合法 URL：${raw}`);
  }
  if (url.protocol !== 'https:') throw new Error(`只接受 https:// 地址：${raw}`);
  if (url.username || url.password) throw new Error('URL 不能包含用户名或密码');
  const rawHost = url.hostname.toLowerCase();
  const host = stripTrailingDot(rawHost);
  if (rawHost !== host) url.hostname = host;
  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isLocalHostname(host) || isIP(ipHost) !== 0) {
    throw new Error(`只接受公开域名，不接受本机或 IP 地址：${raw}`);
  }
  url.hash = '';
  return url.toString();
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets;
}

function isPrivateIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    // 198.18.0.0/15 是基准测试段，但 Clash 等代理常用作 fake-IP；
    // 它不会路由到局域网，放行才能让本地 update 与 Actions 行为一致。
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isPrivateIpv4(mapped);
  }
  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8')
  );
}

/** 非公网单播地址（回环、私网、链路本地、保留、组播等）。 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}
