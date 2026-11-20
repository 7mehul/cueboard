// Render sample boards to reports/gallery.html, laid out exactly as the engine placed them.
// Usage: node scripts/gallery.ts [--per 2]   (boards per meeting type and stage, plus the two fixtures)
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildBoard } from '../src/engine.ts';
import { checkBoard } from '../src/check.ts';
import type { Block, Board, Line, MeetingType, Packet, Stage } from '../src/types.ts';
import { MEETING_TYPES } from '../src/types.ts';
import { fmtValue, shortDate } from '../src/text.ts';
import { FULL } from '../src/layout.ts';
import { generate } from '../synth/generate.ts';
import { danaFirst, danaFollowup } from '../test/fixtures.ts';

const per = Number(process.argv[process.argv.indexOf('--per') + 1]) || 2;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const samples: { name: string; packet: Packet; tags: string[] }[] = [
  { name: 'Fixture · Dana, first meeting', packet: danaFirst(), tags: [] },
  { name: 'Fixture · Dana, follow-up', packet: danaFollowup(), tags: [] },
];
for (const type of MEETING_TYPES) for (const stage of ['first', 'followup'] as Stage[]) {
  let found = 0;
  for (let seed = 1; found < per && seed < 5000; seed++) {
    const g = generate(seed * 7919, { type: type as MeetingType, stage, edgeRate: 0.06 });
    if (g.tags.includes('sparse') || g.tags.includes('no_attendees')) continue;
    samples.push({ name: `Seed ${g.seed} · ${type}, ${stage}`, packet: g.packet, tags: g.tags.slice(3) });
    found++;
  }
}

function lineHtml(l: Line) {
  const cls = ['ln', l.gap ? 'gap' : '', l.memory ? 'mem' : '', l.tone ? `t-${l.tone}` : ''].filter(Boolean).join(' ');
  const label = l.label ? `<span class="lab">${esc(l.label)}</span>` : '';
  return `<div class="${cls}">${label}<span>${esc(l.text)}</span></div>`;
}

function chartSvg(b: Block, w: number, h: number) {
  const c = b.chart!;
  const W = w - 32, H = h - 30 - 28 - b.lines.length * 24, padL = 56, padB = 22, padT = 16;
  const vals = c.points.map(p => p.value);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals) || 1;
  const X = (i: number) => padL + (b.kind === 'bars' ? ((W - padL) / c.points.length) * (i + 0.5) : c.points.length === 1 ? (W - padL) / 2 : ((W - padL - 10) * i) / (c.points.length - 1));
  const Y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const fmt = (v: number) => fmtValue(v, c.prefix, c.suffix);
  let body = `<line x1="${padL}" x2="${W}" y1="${Y(lo)}" y2="${Y(lo)}" class="axis"/><text x="${padL - 8}" y="${Y(hi) + 4}" text-anchor="end">${esc(fmt(hi))}</text><text x="${padL - 8}" y="${Y(lo) + 4}" text-anchor="end">${esc(fmt(lo))}</text>`;
  if (b.kind === 'bars') {
    const bw = Math.min(56, ((W - padL) / c.points.length) * 0.6);
    c.points.forEach((p, i) => {
      body += `<rect x="${X(i) - bw / 2}" y="${Y(p.value)}" width="${bw}" height="${Math.max(1, Y(lo) - Y(p.value))}" rx="3" class="bar"/>` +
        `<text x="${X(i)}" y="${Y(p.value) - 6}" text-anchor="middle" class="val">${esc(fmt(p.value))}</text><text x="${X(i)}" y="${H - 4}" text-anchor="middle">${esc(p.label)}</text>`;
    });
  } else {
    const d = c.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
    body += `<path d="${d}" class="ln-path"/>` + c.points.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.value)}" r="${i === c.points.length - 1 ? 4.5 : 3}" class="pt"/>`).join('');
    const last = c.points.at(-1)!;
    body += `<text x="${X(c.points.length - 1) - 8}" y="${Y(last.value) - 10}" text-anchor="end" class="val">${esc(fmt(last.value))}</text>`;
    const every = Math.ceil(c.points.length / 8);
    c.points.forEach((p, i) => { if (i % every === 0 || i === c.points.length - 1) body += `<text x="${X(i)}" y="${H - 4}" text-anchor="middle">${esc(p.label)}</text>`; });
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

function timelineSvg(b: Block, w: number) {
  const ev = b.events!;
  const W = w - 32, y = 50;
  // Evenly spaced in order, not by date: meetings bunch up in time and the labels would collide.
  const X = (i: number) => 14 + ((W - 28) * i) / Math.max(1, ev.length - 1);
  // Four label lanes (two above the line, two below); each label takes the first lane it fits in.
  const LANES = [y - 14, y + 24, y - 30, y + 40];
  const ends = LANES.map(() => -Infinity);
  let body = `<line x1="14" x2="${W - 14}" y1="${y}" y2="${y}" class="axis"/>`;
  ev.forEach((e, i) => {
    const x = X(i), anchor = i === 0 ? 'start' : i === ev.length - 1 ? 'end' : 'middle';
    const label = e.kind === 'today' ? 'Today' : `${shortDate(e.date)} · ${e.label}`;
    const w = label.length * 6.7;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    let lane = ends.findIndex(end => end + 10 < x0);
    if (lane < 0) lane = ends.indexOf(Math.min(...ends));
    ends[lane] = x0 + w;
    body += e.kind === 'today' ? `<circle cx="${x}" cy="${y}" r="6" class="today"/>` : `<circle cx="${x}" cy="${y}" r="5" class="${e.memory ? 'ev mem' : 'ev'}"/>`;
    body += `<text x="${x}" y="${LANES[lane]}" text-anchor="${anchor}">${esc(label)}</text>`;
  });
  return `<svg width="${W}" height="96" viewBox="0 0 ${W} 96">${body}</svg>`;
}

function blockHtml(b: Block, pl: { x: number; y: number; w: number; h: number }) {
  const style = `left:${pl.x}px;top:${pl.y}px;width:${pl.w}px;height:${pl.h}px" data-kind="${b.kind}" data-lines="${b.lines.length}`;
  const head = (tag: string) => `<div class="tag"><i></i>${esc(tag)}</div>`;
  switch (b.kind) {
    case 'header':
      return `<div class="blk hdr" style="${style}"><div class="h1">${esc(b.title)}</div><div class="meta">${esc(b.lines[0].text)}</div></div>`;
    case 'person': {
      const initials = b.title.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
      return `<div class="blk card" data-c="sky" style="${style}">${head('Person')}<div class="who"><span class="av">${esc(initials)}</span><b>${esc(b.title)}</b></div>${b.lines.map(lineHtml).join('')}</div>`;
    }
    case 'keynotes':
      return `<div class="blk card" data-c="mint" style="${style}">${head('Key notes')}${b.lines.map(lineHtml).join('')}</div>`;
    case 'phase':
      return `<div class="blk card" data-c="lilac" style="${style}">${head(`${b.minutes?.from}–${b.minutes?.to} min`)}<div class="title">${esc(b.title)}</div>${b.lines.map(lineHtml).join('')}</div>`;
    case 'questions':
      return `<div class="blk card" style="${style}"><div class="title">${esc(b.title)}</div>${b.lines.map(l => `<div class="q"><span class="ck"></span>${lineHtml(l)}</div>`).join('')}</div>`;
    case 'number':
      return `<div class="blk card stat" style="${style}"><div class="slab">${esc(b.title)}</div><div class="sval">${esc(b.lines[0]?.text ?? '')}</div>${b.lines[1] ? lineHtml(b.lines[1]) : ''}</div>`;
    case 'note':
      return `<div class="blk note" data-c="${b.color ?? 'yellow'}" style="${style}"><b>${esc(b.title)}</b>${b.lines.map(lineHtml).join('')}</div>`;
    case 'trend':
    case 'bars':
      return `<div class="blk card" style="${style}"><div class="title">${esc(b.title)}</div>${b.lines.map(lineHtml).join('')}${chartSvg(b, pl.w, pl.h)}</div>`;
    case 'timeline':
      return `<div class="blk card" data-c="lilac" style="${style}"><div class="title">${esc(b.title)}</div>${timelineSvg(b, pl.w)}${b.lines.map(lineHtml).join('')}</div>`;
  }
}

function boardHtml(name: string, board: Board, p: Packet, tags: string[]) {
  const pos = new Map(board.canvas.map(c => [c.id, c]));
  const height = Math.max(...board.canvas.map(c => c.y + c.h)) + 8;
  const issues = checkBoard(board, p);
  const notes = [
    `${board.type}${board.typeGuessed ? ' (guessed)' : ''} · ${board.stage} · ${board.budget.used} of ${board.budget.max} blocks`,
    board.budget.dropped.length ? `dropped for space: ${board.budget.dropped.join(', ')}` : '',
    tags.length ? `planted: ${tags.join(', ')}` : '',
    board.warnings.length ? `warnings: ${board.warnings.map(w => w.code).join(', ')}` : '',
    issues.length ? `<span class="bad">rules broken: ${issues.map(i => i.code).join(', ')}</span>` : '<span class="ok">passes every rule</span>',
  ].filter(Boolean);
  return `<section><h2>${esc(name)}</h2><p class="sub">${notes.join(' · ')}</p>
<div class="frame"><div class="board" style="width:${FULL}px;height:${height}px">${board.blocks.map(b => blockHtml(b, pos.get(b.id)!)).join('')}</div></div></section>`;
}

const css = `
:root{--ground:#E7EAEE;--surface:#fff;--ink:#13161B;--muted:#596371;--faint:#8C95A1;--line:#D4D9E0;--accent:#2B50CF;--good:#18834F;--bad:#C0394A;
--yellow:#FAE596;--mint:#C4ECD4;--sky:#CBE0FA;--rose:#F7CFD4;--lilac:#DED5F6;--note-ink:#1C1A15;--t-yellow:#A57D04;--t-mint:#18834F;--t-sky:#2868C4;--t-rose:#C0394A;--t-lilac:#6A4BCB}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#13161A;--surface:#20252B;--ink:#E8ECF1;--muted:#9BA5B1;--faint:#6D7783;--line:#323942;--accent:#819DFF;--good:#5CD39B;--bad:#F27D89;
--yellow:#E8D47C;--mint:#A6DABB;--sky:#ACC8EC;--rose:#E9B5BC;--lilac:#C9BBEC;--note-ink:#16150F;--t-yellow:#E0BC45;--t-mint:#5CD39B;--t-sky:#82B2F2;--t-rose:#F27D89;--t-lilac:#B49BF4}}
*{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:14px "Hanken Grotesk",system-ui,sans-serif;padding:24px 16px 64px}
header.top{max-width:${FULL + 48}px;margin:0 auto 8px}header.top h1{font:700 28px "Familjen Grotesk",sans-serif;margin:0 0 4px}header.top p{color:var(--muted);margin:0 0 16px;max-width:70ch;line-height:1.5}
.legend{display:flex;gap:16px;flex-wrap:wrap;font:12px "IBM Plex Mono",monospace;color:var(--muted)}.legend span{display:inline-flex;gap:6px;align-items:center}
section{max-width:${FULL + 48}px;margin:32px auto 0}h2{font:600 18px "Familjen Grotesk",sans-serif;margin:0}.sub{font:12px "IBM Plex Mono",monospace;color:var(--muted);margin:4px 0 10px;line-height:1.6}
.ok{color:var(--good)}.bad{color:var(--bad)}.frame{overflow-x:auto;padding:16px;border-radius:14px;background:repeating-radial-gradient(circle at 0 0,transparent 0,transparent 0) var(--ground);border:1px solid var(--line)}
.board{position:relative;margin:0 auto}.blk{position:absolute;border-radius:12px;padding:12px 16px;overflow:hidden}
.blk.overflow{box-shadow:inset 0 -3px 0 var(--bad)}
.card{background:var(--surface);border:1px solid var(--line)}.tag{display:flex;gap:7px;align-items:center;font:500 11px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.tag i{width:8px;height:8px;border-radius:50%;background:var(--t-sky)}[data-c=mint] .tag i{background:var(--t-mint)}[data-c=lilac] .tag i{background:var(--t-lilac)}
.title{font:600 17px "Familjen Grotesk",sans-serif;margin-bottom:6px}.who{display:flex;gap:8px;align-items:center;margin-bottom:6px}.who b{font:600 18px "Familjen Grotesk",sans-serif}
.av{width:30px;height:30px;border-radius:50%;background:var(--sky);color:var(--note-ink);display:grid;place-items:center;font:600 12px "Hanken Grotesk",sans-serif}
.ln{font-size:14.5px;line-height:1.45;margin:3px 0}.ln .lab{display:block;font:500 11px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-top:6px}
.ln.mem{border-left:3px solid var(--good);padding-left:7px}.ln.gap span{border:1px dashed var(--faint);border-radius:5px;padding:0 5px;color:var(--muted)}
.t-good span{color:var(--good)}.t-bad span{color:var(--bad)}.t-overdue span{color:var(--bad)}.t-done span{color:var(--muted)}
.hdr{padding:0}.h1{font:700 34px/1.15 "Familjen Grotesk",sans-serif;letter-spacing:-.02em}.meta{color:var(--muted);font-size:15px;margin-top:6px}
.q{display:flex;gap:9px;align-items:flex-start}.ck{flex:none;width:17px;height:17px;border-radius:50%;border:1.6px solid var(--faint);margin-top:5px}
.stat .slab{font:500 11px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.stat .sval{font:600 38px/1.1 "Familjen Grotesk",sans-serif;letter-spacing:-.03em;margin:6px 0 2px}
.note{background:var(--yellow);color:var(--note-ink);border-radius:6px}.note[data-c=rose]{background:var(--rose)}.note[data-c=mint]{background:var(--mint)}.note[data-c=sky]{background:var(--sky)}
.note b{display:block;font:600 16px "Familjen Grotesk",sans-serif;margin-bottom:4px}.note .ln{font-size:15px}.note .ln.mem{border-color:var(--t-mint)}.note .t-bad span,.note .t-overdue span{color:#8f1d2c}
svg text{font:11px "IBM Plex Mono",monospace;fill:var(--muted)}svg .val{fill:var(--ink);font-weight:500}svg .axis{stroke:var(--line)}svg .bar{fill:var(--accent)}
svg .ln-path{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round}svg .pt{fill:var(--accent)}svg .ev{fill:var(--accent)}svg .ev.mem{fill:var(--good)}svg .today{fill:none;stroke:var(--good);stroke-width:2}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Board gallery</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style></head><body>
<header class="top"><h1>Board gallery</h1><p>Boards straight from the engine, placed where the layout put them. Each one comes from a packet: the two Dana fixtures, then generated meetings for every type and stage. A red line along the bottom of a card means its text ran past the height the layout guessed.</p>
<div class="legend"><span><b style="width:3px;height:14px;background:var(--good)"></b>from memory (past meetings)</span><span><b style="border:1px dashed var(--faint);padding:0 5px">[gap]</b>unknown: look up or confirm</span><span style="color:var(--good)">good change</span><span style="color:var(--bad)">bad change or overdue</span></div></header>
${samples.map(s => { const b = buildBoard(s.packet); return boardHtml(s.name, b, s.packet, s.tags); }).join('\n')}
<script>
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll('.blk')) if (el.scrollHeight > el.clientHeight + 2) el.classList.add('overflow');
});
</script></body></html>`;

mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
writeFileSync(new URL('../reports/gallery.html', import.meta.url), html);
console.log(`Wrote reports/gallery.html with ${samples.length} boards`);
