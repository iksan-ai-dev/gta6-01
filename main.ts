import { promises as fsp, existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(ROOT, process.env.MAKEFUN_OUTPUT_DIR ?? 'out');
const GAME_DIR = path.join(ROOT, 'game');
const SHOTS_JSON = path.join(ROOT, 'shots.json');
const SHOTS_DIR = path.join(ROOT, 'screenshots');

const SOURCE_EXTS = new Set(['.js', '.ts', '.html', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.git']);
const TEXT_BUDGET = 163840;
const CUT_RESERVE = 160;

interface ShotEntry {
  name: string;
  query?: string;
}

interface ImageEntry {
  name: string;
  path: string;
}

interface SourceFile {
  rel: string;
  content: string;
  lines: number;
  bytes: number;
}

function isSourceFile(rel: string): boolean {
  if (rel.endsWith('.min.js')) return false;
  return SOURCE_EXTS.has(path.extname(rel).toLowerCase());
}

function isVendored(rel: string): boolean {
  if (rel.endsWith('.min.js')) return true;
  return rel
    .split(path.sep)
    .some((part) => part === 'vendor' || part === 'lib' || part === 'libs');
}

function langFor(rel: string): string {
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.ts') return 'ts';
  if (ext === '.html') return 'html';
  if (ext === '.css') return 'css';
  return 'js';
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function walk(dir: string, skipDirs: Set<string>): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (skipDirs.has(abs)) continue;
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, skipDirs)));
    } else if (entry.isSymbolicLink()) {
      const st = await fsp.stat(abs).catch(() => null);
      if (st && st.isDirectory()) out.push(...(await walk(abs, skipDirs)));
      else if (st && st.isFile()) out.push(abs);
    } else {
      out.push(abs);
    }
  }
  return out;
}

async function copyTree(
  src: string,
  dest: string,
  skipDirs: Set<string>,
): Promise<string[]> {
  const files = await walk(src, skipDirs);
  for (const abs of files) {
    const rel = path.relative(src, abs);
    const target = path.join(dest, rel);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(abs, target);
  }
  return files;
}

async function main(): Promise<void> {
  const skipDirs = new Set<string>([OUTPUT_DIR]);

  if (!existsSync(SHOTS_JSON)) {
    fail(`shots.json not found at ${SHOTS_JSON}`);
  }

  let shots: ShotEntry[];
  try {
    shots = JSON.parse(await fsp.readFile(SHOTS_JSON, 'utf8'));
  } catch (err) {
    fail(`shots.json could not be read or parsed: ${(err as Error).message}`);
  }
  if (!Array.isArray(shots) || shots.length === 0) {
    fail('shots.json must be a non-empty array of { name, query } entries');
  }

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  // Copy the whole game/ tree into the output directory.
  const gameFiles = await copyTree(GAME_DIR, OUTPUT_DIR, skipDirs);

  // Classify the copied files.
  const sourceFiles: SourceFile[] = [];
  const vendored: { rel: string; bytes: number }[] = [];
  const assets: { rel: string; bytes: number }[] = [];
  let totalBytes = 0;

  for (const abs of gameFiles) {
    const rel = path.relative(GAME_DIR, abs);
    const bytes = statSync(abs).size;
    totalBytes += bytes;
    if (isSourceFile(rel)) {
      const content = await fsp.readFile(abs, 'utf8');
      const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content;
      sourceFiles.push({ rel, content, lines: trimmed.split('\n').length, bytes });
    } else if (isVendored(rel)) {
      vendored.push({ rel, bytes });
    } else {
      assets.push({ rel, bytes });
    }
  }

  sourceFiles.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  // Validate each named screenshot and copy the screenshots directory.
  const images: ImageEntry[] = [];
  for (const s of shots) {
    const name = s.name;
    if (typeof name !== 'string' || name.length === 0) {
      fail('shots.json entries must have a non-empty "name"');
    }
    let found = false;
    for (const candidate of [
      path.join(SHOTS_DIR, name),
      path.join(GAME_DIR, 'screenshots', name),
    ]) {
      if (!existsSync(candidate)) continue;
      const st = statSync(candidate);
      if (st.isFile() && st.size > 0) {
        found = true;
        break;
      }
    }
    if (!found) {
      fail(`Screenshot missing or empty: ${name}`);
    }
    images.push({ name, path: path.join('screenshots', name) });
  }

  if (existsSync(SHOTS_DIR)) {
    const shotFiles = await walk(SHOTS_DIR, skipDirs);
    for (const abs of shotFiles) {
      const rel = path.relative(SHOTS_DIR, abs);
      const target = path.join(OUTPUT_DIR, 'screenshots', rel);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(abs, target);
    }
  }

  // Build the dossier text.
  const srcBytes = sourceFiles.reduce((a, b) => a + b.bytes, 0);
  const vendBytes = vendored.reduce((a, b) => a + b.bytes, 0);
  const assetBytes = assets.reduce((a, b) => a + b.bytes, 0);

  let header = '## Game\n\n';
  header += `- Source files: ${sourceFiles.length} (${srcBytes} bytes)\n`;
  header += `- Vendored files: ${vendored.length} (${vendBytes} bytes)\n`;
  header += `- Assets: ${assets.length} (${assetBytes} bytes)\n`;
  header += `- Total: ${gameFiles.length} files, ${totalBytes} bytes\n`;
  if (vendored.length > 0) {
    header += '\nVendored:\n' + vendored.map((v) => `- ${v.rel}`).join('\n');
  }
  if (assets.length > 0) {
    header += '\n\nAssets:\n' + assets.map((a) => `- ${a.rel}`).join('\n');
  }
  header += '\n\n## Sources\n';

  let text = header;
  let included = 0;
  for (let i = 0; i < sourceFiles.length; i += 1) {
    const f = sourceFiles[i];
    const block = `\n### ${f.rel} (${f.lines} lines, ${f.bytes} bytes)\n\n\`\`\`${langFor(f.rel)}\n${f.content}\n\`\`\`\n`;
    if (
      Buffer.byteLength(text) + Buffer.byteLength(block) <=
      TEXT_BUDGET - CUT_RESERVE
    ) {
      text += block;
      included = i + 1;
    } else {
      break;
    }
  }

  const cut = sourceFiles.slice(included);
  if (cut.length > 0) {
    const cutBytes = cut.reduce((a, b) => a + b.bytes, 0);
    text += `\n[Cut at ${TEXT_BUDGET} bytes: ${cut.length} files and ${cutBytes} bytes of source left out.]\n`;
  }

  const dossier = {
    schema: 'makefun-dossier/1',
    text,
    images,
    cover: shots[0].name,
  };

  await fsp.writeFile(
    path.join(OUTPUT_DIR, 'dossier.json'),
    JSON.stringify(dossier, null, 2),
  );

  console.log(`Build complete: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
