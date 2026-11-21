#!/usr/bin/env node
// `npx cueboard`: Cueboard on your own computer, from npm, without the code. It runs the same
// local app as `npm start` in a clone (scripts/serve.ts, bundled into dist/server.mjs), keeping
// its settings and its one key file in ~/.cueboard instead of the clone's folder.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = join(homedir(), '.cueboard');
const HELP = `Cueboard: visual prep for your next meeting, on your own computer.

  npx cueboard          start it, at http://localhost:5180
  npx cueboard demo     a sample week to try, no key needed, at http://localhost:5190
  npx cueboard 5300     start it on another port

Claude: run \`ant auth login\` once, or set ANTHROPIC_API_KEY.
Other settings (Granola, Google Calendar, which model) go in ${join(HOME, '.env')}:
https://github.com/7mehul/cueboard/blob/main/.env.example lists them all.

Your boards stay in your browser. Cueboard keeps one file of its own, in ${HOME}.
It runs while this terminal is open; Ctrl+C stops it.`;

const argv = process.argv.slice(2);
if (argv.some(a => a === '--help' || a === '-h' || a === 'help')) { console.log(HELP); process.exit(0); }
if (argv.some(a => a === '--version' || a === '-v')) {
  console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}

// Settings from ~/.cueboard/.env, never from whatever folder this happens to run in (another
// project's .env could carry its own keys and port). The environment wins over the file.
const settings = join(process.env.CUE_DATA_DIR || HOME, '.env');
if (existsSync(settings)) process.loadEnvFile(settings);
process.env.CUE_DATA_DIR ||= HOME;

const rest = argv.filter(a => a !== 'demo');
const demo = argv.includes('demo') ? [...(rest.some(a => /^\d+$/.test(a)) ? [] : ['5190']), '--demo', '--fake-model'] : [];
process.argv = [process.argv[0], process.argv[1], ...demo, ...rest];
await import(new URL('./server.mjs', import.meta.url).href);
