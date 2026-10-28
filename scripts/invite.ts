// Make invite codes for the hosted test version. Run it in your own terminal:
//   node scripts/invite.ts maya ben priya [--url https://your-app.onrender.com] [--add "$CUE_INVITES"]
// It prints the CUE_INVITES value to set on the host and one link per person to send them.
// With --add, existing invites are kept and only the new names get codes.
import { newCode, parseInvites } from './gate.ts';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const url = (flag('--url') ?? 'https://YOUR-APP.onrender.com').replace(/\/+$/, '');
const existing = parseInvites(flag('--add') ?? '');
const names = args.map(a => a.toLowerCase());
if (!names.length) { console.error('Name at least one tester: node scripts/invite.ts maya ben'); process.exit(1); }

const pairs = [...existing].map(([code, name]) => `${name}:${code}`);
const links: string[] = [];
for (const name of names) {
  if ([...existing.values()].includes(name)) { console.error(`${name} already has an invite; skipped`); continue; }
  const code = newCode();
  pairs.push(`${name}:${code}`);
  links.push(`${name.padEnd(12)} ${url}/join#${code}`);
}
parseInvites(pairs.join(',')); // the same check the server makes when it starts

console.log(`\nSet this on the host as CUE_INVITES (replacing the old value):\n\n${pairs.join(',')}\n`);
console.log(`Send each person their link. The code after # never reaches the server’s logs:\n\n${links.join('\n')}\n`);
