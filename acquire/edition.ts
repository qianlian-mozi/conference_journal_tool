/** 从官网 Dates URL 推导 edition；路径或年份子域出现多个不同年份时拒绝猜测。 */
export function yearFromDatesUrl(rawUrl: string): number | null {
  try {
    const url = new URL(rawUrl);
    const years = new Set<number>();
    const addYear = (value: string) => {
      if (!/^\d{4}$/.test(value)) return;
      const year = Number(value);
      if (year >= 2000 && year <= 2100) years.add(year);
    };

    addYear(/\/Conferences\/(\d{4})\b/i.exec(url.pathname)?.[1] ?? '');
    for (const part of url.pathname.split('/')) addYear(part);
    for (const label of url.hostname.split('.')) {
      for (const match of label.matchAll(/20\d{2}/g)) addYear(match[0]);
    }
    return years.size === 1 ? [...years][0] : null;
  } catch {
    return null;
  }
}

export function editionUrlFromDatesUrl(rawUrl: string): string {
  return rawUrl.replace(/\/(?:Dates(?:\.html)?|important-dates|program\/technical-papers)\/?$/i, '');
}
