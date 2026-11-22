// Packages the game for the make.fun runtime: resolve the output directory,
// copy game/ and screenshots/ into it (keeping game/ as its own directory),
// then let buildDossier derive the dossier from the packaged build.
import {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

type DossierLimits = {
  text_max_bytes: number;
  screenshots: { max: number; max_bytes: number };
  game_max_files: number;
  game_max_bytes: number;
  game_path_max_bytes: number;
};

const LIMITS: DossierLimits = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  mkdirSync(outDir, { recursive: true });

  const gameDir = join(scriptDir, 'game');
  if (!existsSync(gameDir)) {
    throw new Error(`game directory not found at ${gameDir}`);
  }

  copyTree(gameDir, join(outDir, 'game'));

  const shotsDir = join(scriptDir, 'screenshots');
  if (existsSync(shotsDir)) {
    copyTree(shotsDir, join(outDir, 'screenshots'));
  }

  const dossier = buildDossier(outDir, LIMITS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(`Build complete: ${outDir}`);
}

main();
