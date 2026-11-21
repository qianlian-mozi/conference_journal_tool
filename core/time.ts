/**
 * 时间处理：本地时间 ↔ UTC 瞬时。
 *
 * 设计要点：
 * - 截止日期一律以「官网给出的本地时间 + 时区」保存（due + timezone），
 *   同时保存由官网推导出的 UTC 瞬时（due_utc），二者互校。
 * - AoE（Anywhere on Earth）= UTC-12，是最容易算错的一类，单独处理。
 * - IANA 时区用 Intl 推导，不引入第三方时区库。
 */

export const AOE = 'AoE';
const AOE_OFFSET_MINUTES = -12 * 60;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const LOCAL_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseLocalIso(local: string): LocalParts | null {
  const match = LOCAL_ISO_RE.exec(local);
  if (!match) return null;

  const parts: LocalParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  };

  if (parts.month < 1 || parts.month > 12) return null;
  if (parts.day < 1 || parts.day > 31) return null;
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return null;

  // 拒绝 2 月 30 日这类「格式合法但日历上不存在」的日期。
  const probe = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() !== parts.month - 1 ||
    probe.getUTCDate() !== parts.day
  ) {
    return null;
  }

  return parts;
}

function wallClockToMs(parts: LocalParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** 某个 IANA 时区在给定 UTC 瞬时的偏移（分钟，东正西负）。 */
export function zoneOffsetMinutes(timeZone: string, utcMs: number): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(utcMs))) {
    values[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/** 把「本地时间 + 时区」换算成 UTC ISO 字符串；非法输入返回 null。 */
export function localToUtcIso(local: string, timeZone: string): string | null {
  const parts = parseLocalIso(local);
  if (!parts) return null;
  const wall = wallClockToMs(parts);

  if (timeZone === AOE) {
    return new Date(wall - AOE_OFFSET_MINUTES * 60000).toISOString();
  }
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC' || timeZone === 'Z') {
    return new Date(wall).toISOString();
  }

  try {
    // 用两次迭代收敛：先假设偏移，再用得到的瞬时重新取偏移（覆盖 DST 边界）。
    let guess = wall - zoneOffsetMinutes(timeZone, wall) * 60000;
    guess = wall - zoneOffsetMinutes(timeZone, guess) * 60000;
    return new Date(guess).toISOString();
  } catch {
    return null;
  }
}

/** 把 UTC ISO 瞬时格式化成某时区的本地 ISO（不含偏移），用于与官网原文对照。 */
export function utcIsoToLocal(utcIso: string, timeZone: string): string | null {
  const instant = new Date(utcIso);
  if (Number.isNaN(instant.getTime())) return null;

  if (timeZone === AOE) {
    const shifted = new Date(instant.getTime() + AOE_OFFSET_MINUTES * 60000);
    return shifted.toISOString().slice(0, 19);
  }
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC' || timeZone === 'Z') {
    return instant.toISOString().slice(0, 19);
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const values: Record<string, string> = {};
    for (const part of formatter.formatToParts(instant)) values[part.type] = part.value;
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  } catch {
    return null;
  }
}

/** 两个 ISO 瞬时是否在容差内相等（默认 60 秒）。 */
export function sameInstant(a: string, b: string, toleranceSeconds = 60): boolean {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return Math.abs(left - right) <= toleranceSeconds * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === AOE || timeZone === 'UTC' || timeZone === 'Etc/UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
