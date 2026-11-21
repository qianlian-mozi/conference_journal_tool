/**
 * 数据加载：把仓库里的 YAML 读成类型化对象。
 * 读取失败时直接抛错并带上文件路径 —— 校验器要把「文件坏了」和「内容不合规」分开报告。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  FieldPackSchema,
  SourceRegistrySchema,
  VenueSchema,
  type FieldPack,
  type SourceEntry,
  type Venue,
} from './schema.ts';

export const REPO_ROOT = resolve(import.meta.dirname, '..');

export function repoPath(...segments: string[]): string {
  return join(REPO_ROOT, ...segments);
}

export function readYamlFile(path: string): unknown {
  if (!existsSync(path)) {
    throw new Error(`文件不存在: ${path}`);
  }
  const text = readFileSync(path, 'utf8');
  try {
    return parseYaml(text);
  } catch (error) {
    throw new Error(`YAML 解析失败: ${path}\n${(error as Error).message}`);
  }
}

export interface LoadedFile<T> {
  path: string;
  relativePath: string;
  data: T;
}

export function loadFieldPacks(root = repoPath('data', 'fields')): Array<LoadedFile<FieldPack>> {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => {
      const path = join(root, name);
      return {
        path,
        relativePath: `data/fields/${name}`,
        data: FieldPackSchema.parse(readYamlFile(path)),
      };
    });
}

export function loadVenues(root = repoPath('data', 'venues')): Array<LoadedFile<Venue>> {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => {
      const path = join(root, name);
      return {
        path,
        relativePath: `data/venues/${name}`,
        data: VenueSchema.parse(readYamlFile(path)),
      };
    });
}

export function loadRegistry(path = repoPath('sources', 'registry.yaml')): SourceEntry[] {
  const parsed = SourceRegistrySchema.parse(readYamlFile(path));
  return parsed.sources;
}

/** 快照按内容寻址存放：data/snapshots/<venue>/<sha256>.txt */
export function snapshotPath(venueId: string, hash: string): string {
  return repoPath('data', 'snapshots', venueId, `${hash}.txt`);
}

export function readSnapshot(venueId: string, hash: string): string | null {
  const path = snapshotPath(venueId, hash);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}
