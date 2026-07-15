// Generates public/docs.txt from the real JSON_FORMAT_DOCS export in
// src/data/apiDocs.ts, run automatically before every build (see
// package.json's "build" script).
//
// Why this exists: the app uses HashRouter, so /docs is only ever reachable
// as #/docs — a fragment that never reaches the server at all. A plain,
// non-JS-executing fetch of any hash route just gets served the same root
// index.html, regardless of the fragment. That's fine for every other page
// (Roster, Schedule, Log, Charts — all personal, per-visitor localStorage
// data with nothing generic to show a crawler anyway), but /docs is the one
// route with real, static, crawler-relevant content, and it was
// unreachable by anything that doesn't execute JavaScript.
//
// This writes that same content out as a plain .txt file with a real path
// — no hash routing, no JS required to read it. It imports the actual
// exported constant rather than duplicating the text by hand, so the two
// can never drift out of sync with each other.
//
// Uses tsc directly rather than esbuild — this project's Vite setup uses
// the Rolldown bundler, so esbuild isn't actually a dependency here even
// though many Vite projects have it transitively.
import { execSync } from 'child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const tempDir = mkdtempSync(path.join(tmpdir(), 'gen-docs-'));
try {
  copyFileSync(path.join(projectRoot, 'src/data/apiDocs.ts'), path.join(tempDir, 'apiDocs.ts'));
  copyFileSync(path.join(projectRoot, 'src/data/presetFields.ts'), path.join(tempDir, 'presetFields.ts'));
  copyFileSync(path.join(projectRoot, 'src/types/index.ts'), path.join(tempDir, 'types.ts'));

  // Flattened into one directory, so the relative import needs adjusting
  // to match (was '../types' two levels up in the real project structure).
  let presetFieldsSrc = readFileSync(path.join(tempDir, 'presetFields.ts'), 'utf-8');
  presetFieldsSrc = presetFieldsSrc.replace("from '../types'", "from './types'");
  writeFileSync(path.join(tempDir, 'presetFields.ts'), presetFieldsSrc);

  execSync(
    `npx tsc --module esnext --target es2022 --outDir out --skipLibCheck --moduleResolution bundler apiDocs.ts presetFields.ts types.ts`,
    { cwd: tempDir, stdio: 'pipe' }
  );

  const outDir = path.join(tempDir, 'out');
  let apiDocsJs = readFileSync(path.join(outDir, 'apiDocs.js'), 'utf-8');
  apiDocsJs = apiDocsJs.replace("from './presetFields';", "from './presetFields.js';");
  writeFileSync(path.join(outDir, 'apiDocs.js'), apiDocsJs);

  const modulePath = path.join(outDir, 'apiDocs.js');
  const { JSON_FORMAT_DOCS } = await import(`file://${modulePath}?t=${Date.now()}`);

  const publicDir = path.join(projectRoot, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(path.join(publicDir, 'docs.txt'), JSON_FORMAT_DOCS);

  console.log(`Generated public/docs.txt (${JSON_FORMAT_DOCS.length} chars) from JSON_FORMAT_DOCS`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
