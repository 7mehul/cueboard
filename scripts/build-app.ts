// Build the canvas app into one self-contained file, dist/cueboard.html, so it can be opened
// directly or published as a Claude artifact. Usage: node scripts/build-app.ts [--watch]
// CUE_DIST puts it somewhere else (the server tests build into their own folder).
import { readFileSync, renameSync, writeFileSync, mkdirSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const at = (p: string) => new URL(p, root);
const out = process.env.CUE_DIST ? pathToFileURL(resolve(process.env.CUE_DIST) + '/') : at('dist/');

async function once() {
  const t0 = Date.now();
  const engine = await build({
    entryPoints: [fileURLToPath(at('app/engine-entry.ts'))],
    bundle: true, write: false, format: 'iife', globalName: 'CueEngine', target: 'es2022', minify: true,
  });
  const html = readFileSync(at('app/index.html'), 'utf8')
    .replace('/*CSS*/', () => readFileSync(at('app/board.css'), 'utf8'))
    .replace('/*FLOATCSS*/', () => readFileSync(at('app/float.css'), 'utf8'))
    .replace('/*ENGINE*/', () => engine.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'))
    .replace('/*APP*/', () => readFileSync(at('app/board.js'), 'utf8'));
  // Written aside and renamed into place, so a server reading it never gets half a page.
  mkdirSync(out, { recursive: true });
  const tmp = new URL(`cueboard.html.${process.pid}.tmp`, out);
  writeFileSync(tmp, html);
  renameSync(tmp, new URL('cueboard.html', out));
  console.log(`built ${fileURLToPath(new URL('cueboard.html', out)).replace(fileURLToPath(root), '')} (${Math.round(html.length / 1024)} KB) in ${Date.now() - t0} ms`);
}

await once();
if (process.argv.includes('--watch')) {
  let t: ReturnType<typeof setTimeout> | undefined;
  for (const dir of ['app', 'src', 'synth', 'test']) {
    watch(at(dir + '/'), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => once().catch(e => console.error(e.message)), 80); });
  }
  console.log('watching app/, src/, synth/ and test/ for changes');
}
