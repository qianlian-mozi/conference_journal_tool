#!/usr/bin/env node
/**
 * 隐私自查：把「如果现在公开仓库，会泄露什么」找出来。
 *
 * 用法：npm run audit:privacy
 * 退出码 0 = 干净；1 = 有命中项。
 *
 * 设计取向：
 * - 不调用 git、不 spawn 子进程（受限沙箱、CI、用户本机都能跑）。
 * - 按 .gitignore 过滤，只检查「会被提交的文件」，否则本地的 .env / key 文件会一直误报。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.npm-cache', '.tmp', '.workbuddy', 'coverage']);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.gz',
]);
const MAX_BYTES = 512 * 1024;
// 只有逐条审阅过的公开职能邮箱可以豁免；个人邮箱仍会报警。
const PUBLIC_SNAPSHOT_EMAILS = new Set([
  '3dv27-sponsors' + '@' + 'googlegroups.com',
  'chairs-eg2027full' + '@' + 'eg.org',
]);
const SNAPSHOT_PATH = /^data\/snapshots\/[a-z0-9-]+\/[a-f0-9]{64}\.txt$/;

// URL 中带 home 路径段是公开地址（例如 SAGE 的期刊入口），不是本机家目录。
function withoutHttpUrls(line) {
  return line.replace(/https?:\/\/[^\s"'<>]+/gi, '<url>');
}

const CHECKS = [
  { name: 'Windows 绝对路径', re: /\b[A-Za-z]:\\[^\s"'<>|]+/g },
  { name: 'Unix 家目录', re: /\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+/g },
  { id: 'email', name: '邮箱地址', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: 'API key', re: /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g },
  { name: '机器名', re: /\bDESKTOP-[A-Z0-9]{5,}\b/g },
];

function loadIgnorePatterns() {
  const file = join(ROOT, '.gitignore');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'))
    .map((line) => {
      const dirOnly = line.endsWith('/');
      const body = line.replace(/\/$/, '');
      const escaped = body
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(dirOnly ? `(^|/)${escaped}/` : `(^|/)${escaped}$`);
    });
}

const ignore = loadIgnorePatterns();

function isIgnored(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return ignore.some((re) => re.test(normalized));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || isIgnored(rel)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (isIgnored(rel)) continue;
      out.push(full);
    }
  }
  return out;
}

const findings = [];
const exemptions = [];

for (const file of walk(ROOT)) {
  if (SKIP_EXT.has(extname(file).toLowerCase())) continue;
  if (statSync(file).size > MAX_BYTES) continue;

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const rel = relative(ROOT, file).replace(/\\/g, '/');
  // 快照是已公开官网的原文，可能含公开的联系/赞助商邮箱；这不是本地隐私。
  // 其它检查（密钥、路径、机器名）仍然对快照生效。
  const publicSourceSnapshot = SNAPSHOT_PATH.test(rel);
  const lines = text.split(/\r?\n/);
  for (const check of CHECKS) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = check.name.endsWith('路径') || check.name === 'Unix 家目录'
        ? withoutHttpUrls(lines[index])
        : lines[index];
      const matches = line.match(check.re);
      if (!matches) continue;
      for (const match of matches) {
        const masked = match.length <= 4 ? '***' : `${match.slice(0, 4)}…(${match.length})`;
        if (
          check.id === 'email' &&
          publicSourceSnapshot &&
          PUBLIC_SNAPSHOT_EMAILS.has(match.toLowerCase())
        ) {
          exemptions.push({ file: rel, line: index + 1, kind: '公开职能邮箱', masked });
          continue;
        }
        findings.push({ file: rel, line: index + 1, kind: check.name, masked });
      }
    }
  }
}

for (const item of exemptions) {
  console.log(`  ℹ ${item.file}:${item.line}  [${item.kind}豁免]  ${item.masked}`);
}

if (findings.length === 0) {
  console.log('✓ 将要提交的文件里，没有发现路径、邮箱、密钥或机器名痕迹。');
} else {
  console.log('✗ 发现可疑内容：');
  for (const item of findings) {
    console.log(`  - ${item.file}:${item.line}  [${item.kind}]  ${item.masked}`);
  }
}

process.exit(findings.length > 0 ? 1 : 0);
