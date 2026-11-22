export const ICS_CRLF = '\r\n';

const encoder = new TextEncoder();

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

export function formatIcsUtc(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('ICS 日期无效');
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function takeUtf8Prefix(value: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return value.slice(0, end);
}

/** RFC 5545：内容行最多 75 octets，续行以单个空格开头，不能切断 UTF-8 字符。 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  let limit = 75;
  while (encoder.encode(remaining).length > limit) {
    const chunk = takeUtf8Prefix(remaining, limit);
    if (chunk === '') throw new Error('ICS 行折行失败');
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length);
    limit = 74; // 续行前导空格也占 1 octet。
  }
  chunks.push(remaining);
  return chunks[0] + chunks.slice(1).map((chunk) => `${ICS_CRLF} ${chunk}`).join('');
}

export function serializeIcsLines(lines: string[]): string {
  return lines.map(foldIcsLine).join(ICS_CRLF) + ICS_CRLF;
}
