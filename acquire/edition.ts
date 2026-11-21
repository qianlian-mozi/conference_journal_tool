/** 从官网 Dates URL 推导 edition，路径中出现多个不同年份时拒绝猜测。 */
export function yearFromDatesUrl(rawUrl: string): number | null {
  const conferenceMatch = /\/Conferences\/(\d{4})\b/.exec(rawUrl);
  if (conferenceMatch) {
    const year = Number(conferenceMatch[1]);
    return year >= 2000 && year <= 2100 ? year : null;
  }
  try {
    const years = [
      ...new Set(
        new URL(rawUrl).pathname
          .split('/')
          .filter((part) => /^\d{4}$/.test(part))
          .map(Number)
          .filter((year) => year >= 2000 && year <= 2100),
      ),
    ];
    return years.length === 1 ? years[0] : null;
  } catch {
    return null;
  }
}

export function editionUrlFromDatesUrl(rawUrl: string): string {
  return rawUrl.replace(/\/Dates\/?$/i, '');
}
