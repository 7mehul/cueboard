// Build what `npx cueboard` runs: the page (dist/cueboard.html), the local app bundled into one
// JavaScript file with everything it uses (dist/server.mjs), and the command in front of it
// (dist/cli.mjs). Node won't run TypeScript from inside node_modules, and one file with nothing
// to install starts fast. `npm pack` and `npm publish` run this first (the prepack script).
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const at = (p: string) => fileURLToPath(new URL('../' + p, import.meta.url));
const { version } = JSON.parse(readFileSync(at('package.json'), 'utf8'));

if (spawnSync(process.execPath, [at('scripts/build-app.ts')], { stdio: 'inherit' }).status !== 0) process.exit(1);

const common = {
  bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'warning',
  banner: {
    // A few dependencies still call require(); in an ES module it has to be made.
    js: `// Cueboard ${version}. AGPL-3.0-only. Source: https://github.com/7mehul/cueboard\nimport { createRequire as __cueRequire } from 'node:module'; const require = __cueRequire(import.meta.url);`,
  },
} as const;

await build({ ...common, entryPoints: [at('scripts/serve.ts')], outfile: at('dist/server.mjs') });
await build({ ...common, entryPoints: [at('scripts/cli.ts')], outfile: at('dist/cli.mjs'), external: ['./server.mjs'] });

for (const f of ['dist/cli.mjs', 'dist/server.mjs']) console.log(`built ${f} (${Math.round(statSync(at(f)).size / 1024)} KB)`);
