/**
 * Markdown editor 的插件引擎：资源适配器 + 保存 / 资源 / 图片命令。
 *
 * 页面只通过 @work-studio/sdk/global 的 bridge 调命令；写入统一走
 * markdown-editor.save，图片与富媒体统一走 asset / writeImage。
 * Agent 读取 Markdown 时也使用同一份 resource adapter。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { definePlugin } from '@work-studio/sdk';

const MAX_ASSET_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 600;
const MAX_WALK_DEPTH = 10;

const MIME: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.weba': 'audio/webm',
  '.pdf': 'application/pdf',
};

const IMAGE_EXT = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.oga', '.weba']);
const DOC_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd', '.pdf']);
const LISTABLE_EXT = new Set([...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT, ...DOC_EXT]);
const SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  'out',
  'build',
  'target',
  'vendor',
]);

function pathOf(ref: string): string {
  try {
    return fileURLToPath(ref);
  } catch {
    throw new Error(`不是 file:// 地址：${ref}`);
  }
}

function mimeOf(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function kindOf(path: string): 'markdown' | 'image' | 'video' | 'audio' | 'doc' {
  const ext = extname(path).toLowerCase();
  if (ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd') {
    return 'markdown';
  }
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'doc';
}

function extensionForMime(mime: string): string {
  for (const [ext, value] of Object.entries(MIME)) {
    if (value === mime) return ext;
  }
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/svg+xml') return '.svg';
  return '.png';
}

function safeBaseName(name: string): string {
  const trimmed = basename(name)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
  return trimmed || 'image';
}

function base64Payload(data: string): string {
  const comma = data.indexOf(',');
  return data.startsWith('data:') && comma >= 0 ? data.slice(comma + 1) : data;
}

async function grepFile(ref: string, query: string) {
  const text = await readFile(pathOf(ref), 'utf-8');
  const needle = query.toLowerCase();
  if (!needle) return [];
  const lines = text.split('\n');
  const items: Array<{ locator: string; snippet: string; line: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.toLowerCase().includes(needle)) continue;
    items.push({
      locator: `${ref}#L${index + 1}`,
      snippet: line.slice(0, 240),
      line: index + 1,
    });
    if (items.length >= 100) break;
  }
  return items;
}

interface FileEntry {
  name: string;
  path: string;
  ref: string;
  kind: 'markdown' | 'image' | 'video' | 'audio' | 'doc';
}

async function listFiles(
  root: string,
  query?: string,
  limit = MAX_FILES,
): Promise<FileEntry[]> {
  const absolute = resolve(root);
  const info = await stat(absolute).catch(() => null);
  if (!info?.isDirectory()) return [];
  const needle = (query ?? '').toLowerCase();
  const result: FileEntry[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (result.length >= limit || depth > MAX_WALK_DEPTH) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    for (const entry of entries) {
      if (result.length >= limit) return;
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!LISTABLE_EXT.has(ext)) continue;
      const path = relative(absolute, full).split(sep).join('/');
      if (needle && !path.toLowerCase().includes(needle)) continue;
      result.push({
        name: entry.name,
        path,
        ref: pathToFileURL(full).href,
        kind: kindOf(full),
      });
    }
  }

  await walk(absolute, 0);
  return result;
}

const fileCache = new Map<string, { at: number; files: FileEntry[] }>();

export const workstudio = definePlugin({
  resources: {
    markdown: {
      async read(ref, options) {
        const file = pathOf(ref);
        const text = await readFile(file, 'utf-8');
        if (!options?.offset && !options?.limit) {
          return [{ locator: ref, title: basename(file), text }];
        }
        const lines = text.split('\n');
        const offset = Math.max(0, (options?.offset ?? 1) - 1);
        const limit = Math.max(1, Math.min(options?.limit ?? 200, 2000));
        const content = lines.slice(offset, offset + limit).join('\n');
        return [
          {
            locator: `${ref}#L${offset + 1}`,
            title: basename(file),
            text: content,
            ...(content.length !== text.length
              ? { truncated: true, totalLines: lines.length }
              : {}),
          },
        ];
      },
      async grep(ref, query) {
        return grepFile(ref, query);
      },
    },
  },
  commands: {
    'markdown-editor.save': {
      summary: '保存 Markdown 内容',
      args: {
        ref: { type: 'string', required: true },
        content: { type: 'string', required: true },
      },
      async run(input, ctx) {
        const ref = String(input.ref);
        await ctx.fs.write(ref, new TextEncoder().encode(String(input.content)));
        ctx.changed(ref, 'content');
        return { saved: true, ref };
      },
    },
    'markdown-editor.readAsset': {
      summary: '读取图片 / 媒体资源并返回 data URL',
      args: {
        ref: { type: 'string', required: true },
      },
      async run(input, ctx) {
        const ref = String(input.ref);
        const bytes = await ctx.fs.read(ref);
        if (bytes.byteLength > MAX_ASSET_BYTES) {
          throw new Error(`资源过大（${Math.round(bytes.byteLength / 1024 / 1024)}MB）`);
        }
        const mime = mimeOf(pathOf(ref));
        const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
        return { dataUrl, mime, size: bytes.byteLength };
      },
    },
    'markdown-editor.writeImage': {
      summary: '把粘贴 / 选择的图片写入文档同级的 media 目录',
      args: {
        ref: { type: 'string', required: true },
        name: { type: 'string', required: true },
        mime: { type: 'string', required: true },
        data: { type: 'string', required: true },
      },
      async run(input, ctx) {
        const ref = String(input.ref);
        const mime = String(input.mime);
        const rawName = String(input.name);
        const ext = extname(rawName).toLowerCase() || extensionForMime(mime);
        const base = basename(rawName, extname(rawName));
        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '-')
          .replace('Z', '');
        const filename = `${stamp}-${safeBaseName(base)}${ext}`;
        const target = pathToFileURL(
          join(dirname(pathOf(ref)), 'media', filename),
        ).href;
        const bytes = Buffer.from(base64Payload(String(input.data)), 'base64');
        await ctx.fs.write(target, bytes);
        return {
          path: `media/${filename}`,
          ref: target,
          mime,
          size: bytes.byteLength,
        };
      },
    },
    'markdown-editor.files': {
      summary: '列出工作区中的 Markdown 与媒体文件（链接补全用）',
      args: {
        root: { type: 'string', required: true },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      async run(input) {
        const root = String(input.root);
        const key = `${root}\u0000${String(input.query ?? '')}`;
        const cached = fileCache.get(key);
        if (cached && Date.now() - cached.at < 3000) {
          return { files: cached.files.slice(0, Number(input.limit ?? MAX_FILES)) };
        }
        const files = await listFiles(
          root,
          typeof input.query === 'string' ? input.query : undefined,
          Math.max(1, Math.min(Number(input.limit ?? MAX_FILES), MAX_FILES)),
        );
        fileCache.set(key, { at: Date.now(), files });
        if (fileCache.size > 40) {
          const oldest = [...fileCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) fileCache.delete(oldest[0]);
        }
        return { files };
      },
    },
  },
});
