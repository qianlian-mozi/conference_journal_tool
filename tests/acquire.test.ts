import { describe, expect, it } from 'vitest';
import { htmlToText, normalizeForMatch, sha256Hex, snapshotContainsQuote } from '../acquire/snapshot.ts';
import {
  classifyDeadline,
  extractTheCvf,
  isRelevantLabel,
  parseRawTextDate,
} from '../acquire/adapters/thecvf.ts';

const ANCHOR_ROW = `
<tr>
  <td class="borderNone"></td>
  <td title=""><a href='/Conferences/2027/CallForPapers' class='gray'>Submission  Deadline</a></td>
  <td><span class='gray'>Nov 16 '26 (Anywhere on Earth)</span></td>
  <td>
    <span class="gray">
      <script nonce="x" >
        var submission_deadline_1 = "2026/11/17 11:59:59 UTC";
      </script>
    </span>
  </td>
</tr>`;

const SPAN_ROW = `
<tr>
  <td class="borderNone"></td>
  <td title=""><span class='gray'>Round 1  Paper  Submission  Deadline</span></td>
  <td><span class='gray'>Jun 26 '26 (Anywhere on Earth)</span></td>
  <td>
    <span class="gray">
      <script nonce="y" >
        var round_1_paper_submission_deadline_1 = "2026/06/27 11:59:59 UTC";
      </script>
    </span>
  </td>
</tr>`;

const TEXT_ONLY_ROW = `
<tr>
  <td class="borderNone"></td>
  <td title=""><a href='#' class='gray'>Final Decisions</a></td>
  <td><span class='gray'>Feb 25 '27 (Anywhere on Earth)</span></td>
  <td></td>
</tr>`;

const IRRELEVANT_ROW = `
<tr>
  <td class="borderNone"></td>
  <td title=""><a href='#' class='gray'>ACs draft meta review due</a></td>
  <td><span class='gray'>Feb 11 '27 (Anywhere on Earth)</span></td>
  <td></td>
</tr>`;

const TABLE_HEADER = '<h3>Dates and Deadlines</h3>';

describe('htmlToText', () => {
  it('剥掉脚本与标签，保留可引用的正文', () => {
    const text = htmlToText(`<div>${TABLE_HEADER}${ANCHOR_ROW}</div>`);
    expect(text).toContain('Submission Deadline');
    expect(text).toContain("Nov 16 '26 (Anywhere on Earth)");
    expect(text).not.toContain('<script');
  });
});

describe('snapshotContainsQuote', () => {
  it('空白差异不影响命中', () => {
    const text = htmlToText(`<div>${TABLE_HEADER}${ANCHOR_ROW}</div>`);
    expect(snapshotContainsQuote(text, "Submission  Deadline Nov 16 '26 (Anywhere on Earth)")).toBe(
      true,
    );
  });

  it('不存在的原文不命中（这是防幻觉的关键）', () => {
    const text = htmlToText(`<div>${TABLE_HEADER}${ANCHOR_ROW}</div>`);
    expect(snapshotContainsQuote(text, 'Submission Deadline Nov 30 2026')).toBe(false);
  });

  it('空 quote 一律不命中', () => {
    expect(snapshotContainsQuote('anything', '   ')).toBe(false);
  });
});

describe('sha256Hex / normalizeForMatch', () => {
  it('同内容同哈希，不同内容不同哈希', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
    expect(sha256Hex('abc')).toHaveLength(64);
  });

  it('把换行与多空格压成单个空格', () => {
    expect(normalizeForMatch('a\n\n b\t c')).toBe('a b c');
  });
});

describe('parseRawTextDate 文本兜底', () => {
  it('只有日期时按 AoE 当日 23:59:59', () => {
    expect(parseRawTextDate("Feb 25 '27 (Anywhere on Earth)", 'AoE')).toBe(
      '2027-02-26T11:59:59.000Z',
    );
  });

  it('带具体时刻时使用该时刻', () => {
    expect(parseRawTextDate("Nov 08 '26 04:59 AM UTC", 'UTC')).toBe('2026-11-08T04:59:00.000Z');
  });

  it('无法解析时返回 null', () => {
    expect(parseRawTextDate('TBD', 'AoE')).toBeNull();
  });
});

describe('classifyDeadline / isRelevantLabel', () => {
  it('按标签映射节点类型', () => {
    expect(classifyDeadline('Submission Deadline')).toBe('paper');
    expect(classifyDeadline('Paper Registration Deadline')).toBe('registration');
    expect(classifyDeadline('Supplementary Materials Deadline')).toBe('supplement');
    expect(classifyDeadline('Author rebuttals due')).toBe('rebuttal');
    expect(classifyDeadline('Final Decisions')).toBe('notification');
    expect(classifyDeadline('Camera Ready')).toBe('camera_ready');
  });

  it('过滤内部流程行，保留作者关心的节点', () => {
    expect(isRelevantLabel('ACs draft meta review due')).toBe(false);
    expect(isRelevantLabel('SACs oversee reviewer-author discussions')).toBe(false);
    expect(isRelevantLabel('Submission Deadline')).toBe(true);
    expect(isRelevantLabel('Round 1  Paper  Submission  Deadline')).toBe(true);
    expect(isRelevantLabel('Final Decisions')).toBe(true);
  });
});

describe('extractTheCvf', () => {
  it('优先使用倒计时变量的 UTC，并同时支持两种行结构', () => {
    const html = `<html><body>${TABLE_HEADER}${ANCHOR_ROW}${SPAN_ROW}</body></html>`;
    const result = extractTheCvf(html);

    expect(result.status).toBe('ok');
    expect(result.deadlines).toHaveLength(2);

    const submission = result.deadlines.find((item) => item.kind === 'paper');
    expect(submission?.dueUtc).toBe('2026-11-17T11:59:59.000Z');
    expect(submission?.timezone).toBe('AoE');
    expect(submission?.dueSource).toBe('timestamp');

    const roundOne = result.deadlines.find((item) => item.label.includes('Round 1'));
    expect(roundOne?.dueUtc).toBe('2026-06-27T11:59:59.000Z');
  });

  it('没有倒计时变量时走文本兜底，并标记 dueSource=text', () => {
    const html = `<html><body>${TABLE_HEADER}${TEXT_ONLY_ROW}</body></html>`;
    const result = extractTheCvf(html);

    expect(result.status).toBe('ok');
    expect(result.deadlines[0].dueSource).toBe('text');
    expect(result.deadlines[0].dueUtc).toBe('2027-02-26T11:59:59.000Z');
  });

  it('过滤掉内部流程行', () => {
    const html = `<html><body>${TABLE_HEADER}${IRRELEVANT_ROW}${TEXT_ONLY_ROW}</body></html>`;
    const result = extractTheCvf(html);

    expect(result.deadlines).toHaveLength(1);
    expect(result.deadlines[0].label).toBe('Final Decisions');
  });

  it('页面没有日期表时返回 no_dates_table，而不是抛错', () => {
    const result = extractTheCvf('<html><body><h1>Coming soon</h1></body></html>');
    expect(result.status).toBe('no_dates_table');
    expect(result.deadlines).toHaveLength(0);
  });
});
