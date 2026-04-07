#!/usr/bin/env tsx
// Build script: compile DOOM source through EmberC, track gaps
import { readFileSync, readdirSync } from 'fs';
import { compile } from './src/compiler/compiler';
import { registerInclude } from './src/compiler/preprocessor';
import { registerStdlib } from './src/compiler/stdlib';

registerStdlib();

const DOOM_DIR = '/tmp/doomgeneric/doomgeneric';

// Register all DOOM header files
const hFiles = readdirSync(DOOM_DIR).filter(f => f.endsWith('.h'));
for (const f of hFiles) {
  registerInclude(f, readFileSync(`${DOOM_DIR}/${f}`, 'utf-8'));
}

// Exclude platform-specific files
const excludePatterns = [
  'doomgeneric_sdl', 'doomgeneric_win', 'doomgeneric_xlib', 'doomgeneric_allegro',
  'doomgeneric_emscripten', 'doomgeneric_soso', 'doomgeneric_sosox', 'doomgeneric_linuxvt',
  'i_sdlmusic', 'i_sdlsound', 'i_allegromusic', 'i_allegrosound',
  'dummy.c',
];

const cFiles = readdirSync(DOOM_DIR)
  .filter(f => f.endsWith('.c'))
  .filter(f => !excludePatterns.some(p => f.includes(p)))
  .sort();

console.log(`Compiling ${cFiles.length} DOOM source files...\n`);

let ok = 0;
let fail = 0;
const errors = new Map<string, string>();

for (const f of cFiles) {
  const src = readFileSync(`${DOOM_DIR}/${f}`, 'utf-8');
  const lines = src.split('\n').length;

  try {
    const start = performance.now();
    const result = compile(src);
    const ms = (performance.now() - start).toFixed(0);

    if (result.success) {
      ok++;
      console.log(`  ✓ ${f} (${lines} lines, ${ms}ms)`);
    } else {
      fail++;
      const err = result.errors[0];
      const msg = `${err.message} (line ${err.line})`;
      console.log(`  ✗ ${f} (${lines} lines, ${ms}ms): ${msg}`);
      errors.set(f, msg);
    }
  } catch (e: any) {
    fail++;
    const msg = `CRASH: ${e.message.slice(0, 100)}`;
    console.log(`  ✗ ${f} (${lines} lines): ${msg}`);
    errors.set(f, msg);
  }
}

console.log(`\n${ok}/${cFiles.length} compiled successfully`);

if (errors.size > 0) {
  // Group by error type
  const byType = new Map<string, string[]>();
  for (const [file, msg] of errors) {
    // Extract error pattern
    const pattern = msg.replace(/\(line \d+\)/, '').replace(/\d+:\d+: /, '').trim();
    if (!byType.has(pattern)) byType.set(pattern, []);
    byType.get(pattern)!.push(file);
  }

  console.log('\nErrors by type:');
  for (const [pattern, files] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  [${files.length}x] ${pattern}`);
    files.slice(0, 3).forEach(f => console.log(`       ${f}`));
    if (files.length > 3) console.log(`       ... and ${files.length - 3} more`);
  }
}
