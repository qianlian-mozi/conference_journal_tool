/**
 * 快照：把抓到的 HTML 规范化成可做「逐字引用」的纯文本，并算内容哈希。
 *
 * 为什么不是直接存 HTML：
 * - 官网模板一变，原始 HTML 差异巨大，但正文往往没变；规范化后 hash 才稳定。
 * - quote 回验需要正文；对依赖倒计时属性的页面，还要保留机器可读时间戳。
 */
import { createHash } from 'node:crypto';

const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'tr', 'td', 'th', 'li', 'ul', 'ol', 'table', 'thead', 'tbody',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer',
  'nav', 'main', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'hr', 'form', 'label',
]);

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * HTML → 规范化文本。
 * 保留换行结构（表格行仍然一行一行），把空白压成单个空格。
 */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // data-countdown 是部分页面唯一的精确时刻来源；以明确的文本行保留进快照，
    // 让 due_source=timestamp 的 evidence.quote 同时证明标签、日期与倒计时。
    .replace(
      /<[a-zA-Z][^>]*\sdata-countdown\s*=\s*(["'])(.*?)\1[^>]*>/gi,
      (_whole, _quote, value: string) => `\n[data-countdown="${value}"]\n`,
    )
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ');

  // 块级标签变成换行，行内标签直接去掉。
  text = text.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (whole, tag: string) => {
    return BLOCK_TAGS.has(tag.toLowerCase()) ? '\n' : '';
  });

  text = decodeEntities(text);
  text = text.replace(/\r\n?/g, '\n');

  const lines = text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0);

  return lines.join('\n');
}

/** 把任意文本压成单行，用于 quote 的子串判定（容忍换行/多空格的差异）。 */
export function normalizeForMatch(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * quote 是否真的出现在快照里。
 * 这是防幻觉的唯一硬闸门：模型抽取的原文必须在页面上逐字存在。
 */
export function snapshotContainsQuote(snapshotText: string, quote: string): boolean {
  const haystack = normalizeForMatch(snapshotText);
  const needle = normalizeForMatch(quote);
  if (needle.length === 0) return false;
  return haystack.includes(needle);
}
