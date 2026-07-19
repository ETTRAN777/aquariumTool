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
// Uses TypeScript's own transpileModule() API directly, not a shelled-out
// `npx tsc` — running tsc from an isolated temp directory (needed so Node
// can import the result as a real file) has no local node_modules to
// resolve against, and on a machine that's never run it before, `npx tsc`
// can resolve to a completely unrelated, deprecated npm package literally
// named "tsc" instead of the TypeScript compiler. transpileModule() avoids
// the whole problem — it's a plain function call against this project's
// own `typescript` dependency, no subprocess, no PATH resolution, no
// platform-specific npx behavior.
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function transpile(filePath) {
  const source = readFileSync(filePath, 'utf-8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: false,
  });
  return result.outputText;
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'gen-docs-'));
try {
  const presetFieldsJs = transpile(path.join(projectRoot, 'src/data/presetFields.ts'));
  const targetTraitPresetsJs = transpile(path.join(projectRoot, 'src/data/targetTraitPresets.ts'));
  const apiDocsJs = transpile(path.join(projectRoot, 'src/data/apiDocs.ts'));

  writeFileSync(path.join(tempDir, 'presetFields.js'), presetFieldsJs);
  // targetTraitPresets.ts imports the CustomFieldType *type* from
  // '../types' — transpileModule strips type-only imports entirely, so
  // there's no runtime import left pointing at a types.js that doesn't
  // exist here. Only presetFields.js and apiDocs.js need writing out.
  writeFileSync(path.join(tempDir, 'targetTraitPresets.js'), targetTraitPresetsJs);
  // transpileModule() strips TS syntax but leaves import specifiers
  // untouched — Node's ESM resolver needs the explicit .js extension on
  // relative imports that tsc's own bundled emit would normally add.
  writeFileSync(
    path.join(tempDir, 'apiDocs.js'),
    apiDocsJs
      .replace("from './presetFields';", "from './presetFields.js';")
      .replace("from './targetTraitPresets';", "from './targetTraitPresets.js';")
  );

  const modulePath = path.join(tempDir, 'apiDocs.js');
  const { JSON_FORMAT_DOCS } = await import(`file://${modulePath}?t=${Date.now()}`);

  const publicDir = path.join(projectRoot, 'public');
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(path.join(publicDir, 'docs.txt'), JSON_FORMAT_DOCS);

  console.log(`Generated public/docs.txt (${JSON_FORMAT_DOCS.length} chars) from JSON_FORMAT_DOCS`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
