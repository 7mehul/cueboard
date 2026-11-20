(() => {
'use strict';

/* ================= helpers ================= */
const $ = (q, r = document) => r.querySelector(q);
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) n.append(c);
  return n;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, ...kids) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rid = p => p + Math.random().toString(36).slice(2, 8) + (Date.now() % 46656).toString(36);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const narrow = () => window.matchMedia && matchMedia('(max-width: 760px)').matches;
const Engine = window.CueEngine || null;

const SOURCE_URL = 'https://github.com/7mehul/cueboard';
const ICONS = {
  note: '<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/>',
  text: '<path d="M5 7V4.5h14V7M12 4.5V20M9 20h6"/>',
  card: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7 9.5h6M7 13h10M7 16h7"/>',
  list: '<path d="M4 7l1.6 1.6L8.5 5.7M4 14l1.6 1.6 2.9-2.9M11.5 7H20M11.5 14H20M11.5 19H20"/>',
  chart: '<path d="M4 20h16M7.5 16.5v-5M12 16.5V7M16.5 16.5v-8"/>',
  stat: '<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>',
  person: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  shape: '<rect x="3.5" y="4" width="10" height="10" rx="2"/><circle cx="15.5" cy="15.5" r="5"/>',
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  tidy: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4.5" rx="1.5"/><rect x="13" y="10.5" width="7" height="9.5" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
  spark: '<path d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  glance: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  boards: '<path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  popout: '<rect x="3.5" y="6" width="12.5" height="12.5" rx="2"/><path d="M13 3.5h7.5V11M20.5 3.5l-8 8"/>',
  hide: '<path d="M3.5 3.5l17 17"/><path d="M10.4 6.2A9.6 9.6 0 0112 6c5 0 8.4 4.4 9.4 6-.5.8-1.6 2.3-3.2 3.6M6.7 7.7C4.7 9 3.3 10.9 2.6 12c1 1.6 4.4 6 9.4 6 1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  compact: '<path d="M7 14.5l5-5 5 5"/>',
  expand: '<path d="M7 9.5l5 5 5-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  front: '<rect x="3.5" y="3.5" width="11" height="11" rx="2" stroke-dasharray="2.2 2.2"/><rect x="9.5" y="9.5" width="11" height="11" rx="2"/>',
  back: '<rect x="3.5" y="3.5" width="11" height="11" rx="2"/><rect x="9.5" y="9.5" width="11" height="11" rx="2" stroke-dasharray="2.2 2.2"/>',
  align: '<path d="M4 4v16M8 7h10M8 12h6M8 17h12"/>',
  alignL: '<path d="M4 4v16M8 7h10M8 12h6M8 17h12"/>',
  alignC: '<path d="M12 4v16M6 7h12M8.5 12h7M5 17h14"/>',
  alignR: '<path d="M20 4v16M6 7h10M10 12h6M4 17h12"/>',
  alignT: '<path d="M4 4h16M7 8v10M12 8v6M17 8v12"/>',
  alignM: '<path d="M4 12h16M7 6v12M12 8.5v7M17 5v14"/>',
  alignB: '<path d="M4 20h16M7 6v10M12 10v6M17 4v12"/>',
  distH: '<path d="M4 4v16M20 4v16M9.5 8v8M14.5 8v8"/>',
  distV: '<path d="M4 4h16M4 20h16M8 9.5h8M8 14.5h8"/>',
  lnNone: '<path d="M4 12h16"/>',
  lnEnd: '<path d="M4 12h15M14 7l5 5-5 5"/>',
  lnBoth: '<path d="M5 12h14M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  dash: '<path d="M3 12h4M10 12h4M17 12h4"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  round: '<rect x="4" y="6" width="16" height="12" rx="5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  diamond: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  pen: '<path d="M4 20l1.4-4.6L15.6 5.2a2.1 2.1 0 013 3L8.4 18.4z"/><path d="M13.8 7l3 3"/>',
  marker: '<path d="M6 20h7"/><path d="M8.5 15.5l-2 2.5h4l1-1.5"/><path d="M8.5 15.5L15.8 6a2 2 0 012.9-.3l.8.7a2 2 0 01.2 2.8L12 17z"/>',
  rotate: '<path d="M19.5 11a7.5 7.5 0 10-2.2 5.3"/><path d="M19.8 4.5V11h-6.5"/>',
  group: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/><path d="M14 4h6v6M10 20H4v-6"/>',
  ungroup: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/><path d="M14 4h2M18.5 4H20v1.5M20 8v2M4 14v2M4 18.5V20h1.5M8 20h2"/>',
  straighten: '<rect x="3" y="9" width="18" height="6" rx="3"/><path d="M12 9v6"/>',
  label: '<path d="M3.5 7.5h11l5.5 4.5-5.5 4.5h-11z"/>',
  selectMore: '<rect x="3.5" y="3.5" width="11" height="11" rx="2"/><path d="M18 9v8a3 3 0 01-3 3H9"/><path d="M6.5 9l2 2 3.5-3.6"/>',
  selectAll: '<path d="M4 7.5V5a1 1 0 011-1h2.5M16.5 4H19a1 1 0 011 1v2.5M20 16.5V19a1 1 0 01-1 1h-2.5M7.5 20H5a1 1 0 01-1-1v-2.5"/><path d="M8.5 12l2.3 2.3 4.7-4.6"/>',
  eraser: '<path d="M9 20h11"/><path d="M5.6 14.6l7.6-7.6a2 2 0 012.8 0l2.4 2.4a2 2 0 010 2.8L12 18.6H9.6z"/><path d="M9.5 10.7l4.6 4.6"/>',
};
const svgStr = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
function ic(name) { const s = document.createElement('span'); s.className = 'ic'; s.innerHTML = svgStr(name); return s; }
document.querySelectorAll('[data-ic]').forEach(el => { el.classList.add('ic'); el.innerHTML = svgStr(el.dataset.ic); });

function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string') { const m = v.replace(/,/g, '').match(/-?\d*\.?\d+(?:e-?\d+)?/i); return m ? parseFloat(m[0]) : NaN; }
  return NaN;
}
function str(v, max) {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' && isFinite(v)) return String(v);
  return '';
}
const initials = name => String(name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/* ================= model ================= */
const TYPES = ['note', 'text', 'card', 'list', 'chart', 'stat', 'person', 'timeline', 'shape', 'image', 'ink'];
const FIXED_H = new Set(['chart', 'shape', 'image', 'ink']); // height is set, not grown by content
const KEEP_RATIO = new Set(['image', 'ink']);                // resize keeps proportions unless Shift is held
const BOXED = new Set(['card', 'list', 'chart', 'stat', 'person', 'timeline']);
const COLORS = ['yellow', 'mint', 'sky', 'rose', 'lilac'];
const FILLS = ['yellow', 'mint', 'sky', 'rose', 'lilac', 'white', 'none'];
const INKS = ['ink', 'muted', 'accent', 'rose', 'mint', 'lilac'];
const SHAPES = ['rect', 'round', 'ellipse', 'diamond'];
const TONES = ['good', 'bad', 'done', 'open', 'overdue'];
const ARROWS = ['none', 'end', 'both'];
const DEF = {
  note: { w: 220, h: 190 }, text: { w: 520, h: 30 }, card: { w: 280, h: 140 }, list: { w: 280, h: 140 },
  chart: { w: 460, h: 270 }, stat: { w: 220, h: 120 }, person: { w: 280, h: 130 }, timeline: { w: 720, h: 170 }, shape: { w: 180, h: 120 },
  image: { w: 320, h: 240 }, ink: { w: 100, h: 100 },
};
const MIN = {
  note: { w: 140, h: 100 }, text: { w: 80, h: 24 }, card: { w: 180, h: 80 }, list: { w: 180, h: 80 },
  chart: { w: 260, h: 200 }, stat: { w: 150, h: 90 }, person: { w: 200, h: 90 }, timeline: { w: 360, h: 140 }, shape: { w: 40, h: 30 },
  image: { w: 40, h: 30 }, ink: { w: 8, h: 8 },
};
const ALLOWED = {
  note: ['x', 'y', 'w', 'h', 'color', 'title', 'text', 'memory'],
  text: ['x', 'y', 'w', 'h', 'text', 'size', 'ink'],
  card: ['x', 'y', 'w', 'h', 'color', 'tag', 'title', 'lines'],
  list: ['x', 'y', 'w', 'h', 'title', 'items'],
  chart: ['x', 'y', 'w', 'h', 'title', 'kind', 'prefix', 'suffix', 'data', 'caption', 'captionTone'],
  stat: ['x', 'y', 'w', 'h', 'label', 'value', 'note', 'tone', 'memory'],
  person: ['x', 'y', 'w', 'h', 'color', 'name', 'lines'],
  timeline: ['x', 'y', 'w', 'h', 'title', 'events', 'lines'],
  shape: ['x', 'y', 'w', 'h', 'shape', 'fill', 'text'],
  image: ['x', 'y', 'w', 'h', 'alt'],
  ink: ['x', 'y', 'w', 'h'],
};
const IMG_SRC = /^(?:(?:idb|asset):[\w-]{1,64}|data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+)$/;

// Where an engine line came from ("Email · Aug 28"). Only the engine and saved boards carry it;
// the assistant can't add one, and rewriting the line makes it the user's own and drops it.
function normCite(v) {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, 3).map(c => (c && typeof c.label === 'string' && c.label.trim()) ? Object.assign({ label: c.label.slice(0, 80) },
    typeof c.date === 'string' && c.date ? { date: c.date.slice(0, 20) } : {},
    typeof c.url === 'string' && /^https?:\/\/[^\s"'<>]{1,300}$/.test(c.url) ? { url: c.url } : {}) : null).filter(Boolean);
  return out.length ? out : null;
}
const citeText = c => c ? c.map(x => x.label + (x.date ? ' · ' + x.date : '')).join('; ') : '';

// A line on a card keeps where it came from (memory, an unknown, its source) until the user rewrites it.
function normLine(l, trusted) {
  if (typeof l === 'string') return { text: l.replace(/^\s*[•\-*]\s+/, '').slice(0, 300) };
  const o = { text: str(l && l.text, 300) };
  if (l && typeof l.label === 'string' && l.label) o.label = l.label.slice(0, 30);
  if (l && l.memory) o.memory = true;
  if (l && l.gap) o.gap = true;
  if (l && l.suggested) o.suggested = true;
  if (l && TONES.includes(l.tone)) o.tone = l.tone;
  const c = trusted && l && normCite(l.cite);
  if (c) o.cite = c;
  return o;
}
function linesFrom(raw, keep) {
  let out = [];
  if (Array.isArray(raw.lines)) out = raw.lines.slice(0, 40).map(l => normLine(l, keep));
  else if (typeof raw.body === 'string') out = raw.body.split('\n').map(l => normLine(l, false));
  return out.filter(l => keep || l.text.trim());
}

function normalizeEl(raw, keepId) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').toLowerCase();
  if (!TYPES.includes(type)) return null;
  const e = { id: (keepId && typeof raw.id === 'string' && /^[\w-]{1,48}$/.test(raw.id)) ? raw.id : rid('e'), type };
  const x = num(raw.x), y = num(raw.y);
  e.x = isFinite(x) ? Math.round(clamp(x, -50000, 50000)) : null;
  e.y = isFinite(y) ? Math.round(clamp(y, -50000, 50000)) : null;
  if (keepId) { if (e.x == null) e.x = 0; if (e.y == null) e.y = 0; }
  if (type === 'text') e.size = ['h1', 'h2', 'body'].includes(raw.size) ? raw.size : 'h2';
  const dw = type === 'text' ? ({ h1: 720, h2: 520, body: 420 })[e.size] : DEF[type].w;
  const w = num(raw.w), hh = num(raw.h);
  e.w = Math.round(isFinite(w) ? clamp(w, MIN[type].w, 2400) : dw);
  e.h = Math.round(isFinite(hh) ? clamp(hh, MIN[type].h, 1600) : DEF[type].h);
  switch (type) {
    case 'note':
      e.color = COLORS.includes(raw.color) ? raw.color : 'yellow';
      e.title = str(raw.title, 80); e.text = str(raw.text, 600);
      if (raw.memory) e.memory = true;
      if (keepId && normCite(raw.cite)) e.cite = normCite(raw.cite);
      break;
    case 'text': e.text = str(raw.text, 300); e.ink = INKS.includes(raw.ink) ? raw.ink : 'ink'; break;
    case 'card':
      e.color = COLORS.includes(raw.color) ? raw.color : 'sky';
      e.tag = str(raw.tag, 40); e.title = str(raw.title, 160); e.lines = linesFrom(raw, keepId);
      if (raw.live === true) e.live = true;
      break;
    case 'person':
      e.color = COLORS.includes(raw.color) ? raw.color : 'sky';
      e.name = str(raw.name, 80); e.lines = linesFrom(raw, keepId);
      break;
    case 'list':
      e.title = str(raw.title, 160);
      e.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 40)
        .map(it => typeof it === 'string' ? { text: it.slice(0, 240), done: false }
          : Object.assign({ text: str(it && it.text, 240), done: !!(it && it.done) }, it && it.gap ? { gap: true } : {}, it && it.memory ? { memory: true } : {},
            keepId && it && normCite(it.cite) ? { cite: normCite(it.cite) } : {}))
        .filter(it => keepId || it.text);
      break;
    case 'chart': {
      e.title = str(raw.title, 120);
      e.kind = raw.kind === 'line' ? 'line' : 'bar';
      e.prefix = str(raw.prefix, 4); e.suffix = str(raw.suffix, 6);
      let data = Array.isArray(raw.data) ? raw.data : [];
      if (!data.length && Array.isArray(raw.labels) && Array.isArray(raw.values)) data = raw.labels.map((l, i) => ({ label: l, value: raw.values[i] }));
      e.data = data.slice(0, 24).map(p => ({ label: str(p && p.label, 24), value: num(p && p.value) })).filter(p => isFinite(p.value));
      e.caption = str(raw.caption, 120);
      if (TONES.includes(raw.captionTone)) e.captionTone = raw.captionTone;
      break;
    }
    case 'stat':
      e.label = str(raw.label, 60); e.value = str(raw.value, 24); e.note = str(raw.note, 90);
      if (TONES.includes(raw.tone)) e.tone = raw.tone;
      if (raw.memory) e.memory = true;
      if (keepId && normCite(raw.cite)) e.cite = normCite(raw.cite);
      break;
    case 'timeline':
      e.title = str(raw.title, 80);
      e.events = (Array.isArray(raw.events) ? raw.events : []).slice(0, 12).map(ev => ({
        when: str(ev && ev.when, 16), label: str(ev && ev.label, 60), memory: !!(ev && ev.memory), today: !!(ev && ev.today),
      }));
      e.lines = linesFrom(raw, keepId);
      break;
    case 'shape':
      e.shape = SHAPES.includes(raw.shape) ? raw.shape : 'round';
      e.fill = FILLS.includes(raw.fill) ? raw.fill : 'sky';
      e.text = str(raw.text, 400);
      break;
    case 'image':
      if (typeof raw.src !== 'string' || raw.src.length > 2e6 || !IMG_SRC.test(raw.src)) return null;
      e.src = raw.src; e.alt = str(raw.alt, 200);
      break;
    case 'ink': {
      // Strokes are kept in the drawing's own coordinates (vw × vh), so resizing scales them.
      e.vw = isFinite(num(raw.vw)) && num(raw.vw) > 0 ? +num(raw.vw).toFixed(1) : e.w;
      e.vh = isFinite(num(raw.vh)) && num(raw.vh) > 0 ? +num(raw.vh).toFixed(1) : e.h;
      e.strokes = (Array.isArray(raw.strokes) ? raw.strokes : []).slice(0, 400).map(st => {
        const p = (Array.isArray(st && st.p) ? st.p : []).slice(0, 6000).map(v => +num(v).toFixed(1));
        if (p.length < 2 || p.length % 2 || p.some(v => !isFinite(v))) return null;
        return { c: INKS.includes(st.c) ? st.c : 'ink', s: clamp(isFinite(num(st.s)) ? num(st.s) : 3, 0.3, 80), hl: !!st.hl, p };
      }).filter(Boolean);
      if (!e.strokes.length) return null;
      break;
    }
  }
  const rot = normAngle(num(raw.rot));
  if (rot) e.rot = rot;
  if (typeof raw.why === 'string' && raw.why.trim()) e.why = raw.why.slice(0, 140);
  if (typeof raw.group === 'string' && /^g[\w-]{1,40}$/.test(raw.group)) e.group = raw.group;
  return e;
}
// Degrees in (-180, 180], rounded; 0 for anything that isn't a real angle.
function normAngle(a) {
  if (!isFinite(a)) return 0;
  let r = (((a + 180) % 360) + 360) % 360 - 180;
  if (r === -180) r = 180;
  return Math.abs(r) < 0.05 ? 0 : +r.toFixed(1);
}

function linkEnd(v) {
  if (v && typeof v.id === 'string' && /^[\w-]{1,48}$/.test(v.id)) return { id: v.id };
  if (v && isFinite(num(v.x)) && isFinite(num(v.y))) return { x: Math.round(num(v.x)), y: Math.round(num(v.y)) };
  return null;
}
function normalizeLink(raw, ids) {
  if (!raw || typeof raw !== 'object') return null;
  const from = linkEnd(raw.from), to = linkEnd(raw.to);
  if (!from || !to) return null;
  if ((from.id && !ids.has(from.id)) || (to.id && !ids.has(to.id)) || (from.id && from.id === to.id)) return null;
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,48}$/.test(raw.id) ? raw.id : rid('l'),
    from, to,
    arrow: ARROWS.includes(raw.arrow) ? raw.arrow : 'end',
    dashed: !!raw.dashed,
    ink: INKS.includes(raw.ink) ? raw.ink : 'ink',
    ...(str(raw.label, 60).trim() ? { label: str(raw.label, 60).trim() } : {}),
  };
}

function normalizeBoard(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const v = raw.view && typeof raw.view === 'object' ? raw.view : null;
  const elements = (Array.isArray(raw.elements) ? raw.elements : []).slice(0, 400).map(e => normalizeEl(e, true)).filter(Boolean);
  const ids = new Set(elements.map(e => e.id));
  return {
    id: raw.id,
    title: str(raw.title, 120) || 'Untitled meeting',
    updatedAt: isFinite(num(raw.updatedAt)) ? num(raw.updatedAt) : 0,
    example: !!raw.example,
    saved: true,
    elements,
    links: (Array.isArray(raw.links) ? raw.links : []).slice(0, 400).map(l => normalizeLink(l, ids)).filter(Boolean),
    view: v && isFinite(num(v.x)) && isFinite(num(v.y)) && isFinite(num(v.z)) ? { x: num(v.x), y: num(v.y), z: clamp(num(v.z), 0.15, 3) } : null,
    ...(typeof raw.meetingId === 'string' && /^[\w-]{1,80}$/.test(raw.meetingId) ? { meetingId: raw.meetingId } : {}),
    ...(raw.settle === true ? { settle: true } : {}),
    ...(raw.reflow === true ? { reflow: true } : {}),
    ...(raw.gen && typeof raw.gen === 'object' && Array.isArray(raw.gen.els) ? { gen: normGen(raw.gen) } : {}),
  };
}
// What the engine drafted last time, kept so a refresh can tell its cards from the user's.
function normGen(g) {
  return {
    inputs: typeof g.inputs === 'string' ? g.inputs.slice(0, 64) : '', at: isFinite(num(g.at)) ? num(g.at) : 0,
    mode: g.mode === 'model' ? 'model' : 'rules', title: str(g.title, 120), auto: !!g.auto,
    goals: (Array.isArray(g.goals) ? g.goals : []).filter(t => typeof t === 'string' && t.trim()).slice(0, 3).map(t => t.slice(0, 160)),
    goalHint: str(g.goalHint, 120),
    els: g.els.slice(0, 400).map(e => normalizeEl(e, true)).filter(Boolean),
  };
}
function serialize(b) {
  return { title: b.title, updatedAt: b.updatedAt, example: !!b.example, view: b.view || null, elements: b.elements, links: b.links || [], ...(b.meetingId ? { meetingId: b.meetingId } : {}), ...(b.settle ? { settle: true } : {}), ...(b.reflow ? { reflow: true } : {}), ...(b.gen ? { gen: b.gen } : {}) };
}

// A board the engine drew, as a starting arrangement the user then owns.
function fromEngine(cb, id, extra) {
  const elements = cb.elements.map(raw => {
    const e = normalizeEl(raw, true);
    // Engine heights are estimates; let content set the height except where it's fixed.
    if (e && e.type !== 'chart' && e.type !== 'shape') e.h = MIN[e.type].h;
    return e;
  }).filter(Boolean);
  return Object.assign({ id, title: cb.title, example: false, saved: false, updatedAt: Date.now(), elements, links: [], view: null, settle: true }, extra || {});
}

function makeExample() {
  const cb = Engine && Engine.exampleBoard();
  if (cb) return fromEngine(cb, 'b-example', { title: 'Halyard Ventures follow-up', example: true, updatedAt: 0 });
  const E = o => normalizeEl(o, false);
  const elements = [
    E({ type: 'text', size: 'h1', text: 'Halyard Ventures · partner meeting', x: 0, y: 0, w: 780 }),
    E({ type: 'person', name: 'Dana Ruiz', lines: ['Partner at Halyard Ventures', 'Led 3 dev-tools seed rounds', 'Digs into retention cohorts'], x: 0, y: 90, w: 280 }),
    E({ type: 'card', color: 'mint', tag: 'Key notes', title: 'Run of show', lines: [{ label: 'Goal', text: 'A second meeting with the partnership' }, { label: 'Ask', text: 'Check size and decision timeline' }], x: 304, y: 90, w: 280 }),
    E({ type: 'stat', label: 'MRR', value: '$48.2k', note: '+18% month over month', x: 608, y: 90, w: 220 }),
    E({ type: 'note', color: 'yellow', title: 'Retention', text: 'Lead with cohorts. She’ll ask.', x: 608, y: 240, w: 220 }),
  ].filter(Boolean);
  return { id: 'b-example', title: 'Halyard Ventures partner meeting', example: true, saved: false, updatedAt: 0, elements, links: [], view: null };
}

/* ================= state ================= */
const S = {
  boards: {}, boardId: null, sel: null, multi: new Set(), selLink: null, editEl: null, pop: null, focused: null,
  view: { x: 0, y: 0, z: 1 }, glance: false, undo: [], redo: [], chats: {}, asOpen: false, touched: false,
  allowNative: false, space: false, clip: null, pasteN: 0, alignOpen: false, tempLink: null, linkHover: null,
};
const board = () => S.boards[S.boardId];
const els = () => board().elements;
const links = () => board().links || (board().links = []);
const byId = id => els().find(e => e.id === id);
const linkById = id => links().find(l => l.id === id);
const selected = () => [...S.multi].map(byId).filter(Boolean);
const nodes = new Map();

/* ================= dom refs ================= */
const app = $('#app'), stage = $('#stage'), canvas = $('#canvas'), world = $('#world');
const titleIn = $('#title'), statusEl = $('#status'), exChip = $('#ex-chip');
const selbar = $('#seltools'), pop = $('#pop'), menu = $('#menu'), toastEl = $('#toast');
const emptyEl = $('#empty'), emptyIn = $('#empty-in'), emptyGo = $('#empty-go'), emptyP = $('#empty-p');
const asEl = $('#assistant'), asMsgs = $('#as-msgs'), asIn = $('#as-in'), asSend = $('#as-send'), asCtx = $('#as-ctx'), asDeep = $('#as-deep');
const gbar = $('#glancebar'), gQ = $('#g-q'), gChips = $('#g-chips'), gTitle = $('#g-title'), gnote = $('#gnote'), gnoteIn = $('#gnote-in');
const linkLayer = sv('svg', { class: 'links', 'aria-hidden': 'true' });
const overlay = h('div', { class: 'overlay' });

const PT = (() => { try { const d = document.createElement('div'); d.contentEditable = 'plaintext-only'; return d.contentEditable === 'plaintext-only'; } catch (_) { return false; } })();

/* ================= view ================= */
const ZMIN = 0.15, ZMAX = 3;
function applyView() {
  const v = S.view;
  world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  world.style.setProperty('--z', v.z);
  const g = 24 * v.z;
  canvas.style.backgroundSize = `${g}px ${g}px`;
  canvas.style.backgroundPosition = `${v.x}px ${v.y}px`;
  $('#z-reset').textContent = Math.round(v.z * 100) + '%';
  if (board()) board().view = { x: Math.round(v.x), y: Math.round(v.y), z: +v.z.toFixed(3) };
  if (S.selLink) renderLinks();
  if (labelEd) closeLabelEditor(true);
  positionSelTools(); positionPop();
}
let animT = null;
function setView(t, animate) {
  if (animate && !RM) {
    world.classList.add('animate'); canvas.classList.add('animate');
    clearTimeout(animT);
    animT = setTimeout(() => { world.classList.remove('animate'); canvas.classList.remove('animate'); positionSelTools(); }, 420);
  }
  S.view = { x: t.x, y: t.y, z: t.z };
  applyView();
}
function zoomAt(sx, sy, f) {
  const v = S.view, z = clamp(v.z * f, ZMIN, ZMAX), k = z / v.z;
  setView({ z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k });
}
const GOAL = { el: null, edit: null, draft: '', busy: new Set() };
function insets() {
  if (S.glance) return { t: gbar.offsetHeight + 12, b: gnote.offsetHeight + 32, l: 24, r: 24 };
  // The assistant floats over the board, so a fitted board stays clear of it.
  // And of the goal bar, when a meeting's board is showing it.
  const gb = GOAL.el && !GOAL.el.hidden ? GOAL.el.offsetHeight + 6 : 0;
  return { t: 76 + gb, b: 100, l: 28, r: S.asOpen && !narrow() ? 28 + 396 : 28 };
}
function sizeOf(e) { const n = nodes.get(e.id); return { w: n ? n.offsetWidth : e.w, h: n ? n.offsetHeight : e.h }; }
const RAD = Math.PI / 180;
// An item's own frame: its center, half-size and angle. Items rotate around their center.
function frameOf(e) { const s = sizeOf(e); return { cx: e.x + s.w / 2, cy: e.y + s.h / 2, hw: s.w / 2, hh: s.h / 2, a: (e.rot || 0) * RAD }; }
// The upright box that contains an item, rotation included. Anything spatial uses this.
function boxOf(e) {
  const f = frameOf(e);
  if (!f.a) return { x: e.x, y: e.y, w: f.hw * 2, h: f.hh * 2 };
  const c = Math.abs(Math.cos(f.a)), sn = Math.abs(Math.sin(f.a));
  const W = 2 * (f.hw * c + f.hh * sn), H = 2 * (f.hw * sn + f.hh * c);
  return { x: f.cx - W / 2, y: f.cy - H / 2, w: W, h: H };
}
function unionBox(boxes) {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  return { x: x0, y: y0, w: Math.max(...boxes.map(b => b.x + b.w)) - x0, h: Math.max(...boxes.map(b => b.y + b.h)) - y0 };
}
function rectOf(list) { return list && list.length ? unionBox(list.map(boxOf)) : null; }
const applyRot = (n, e) => { if (n) n.style.rotate = e.rot ? e.rot + 'deg' : ''; };

/* ---------- groups ---------- */
const membersOf = g => els().filter(e => e.group === g);
// A group acts as one item, unless you've double-clicked into it to work on one member.
const unitKey = e => (e.group && e.group !== S.inGroup ? 'g:' + e.group : 'e:' + e.id);
function unitsOf(list) {
  const m = new Map();
  for (const e of list) { const k = unitKey(e); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return [...m.values()].map(members => ({ members, box: unionBox(members.map(boxOf)) }));
}
const expandGroups = ids => [...new Set(ids.flatMap(id => { const e = byId(id); return e && e.group && e.group !== S.inGroup ? membersOf(e.group).map(m => m.id) : [id]; }))];
const oneGroup = list => list.length > 1 && !!list[0].group && list.every(e => e.group === list[0].group) && membersOf(list[0].group).length === list.length;
const wholeGroupSelected = e => !!e.group && e.group !== S.inGroup && membersOf(e.group).every(m => S.multi.has(m.id));
function pruneGroups() {
  const count = new Map();
  for (const e of els()) if (e.group) count.set(e.group, (count.get(e.group) || 0) + 1);
  for (const e of els()) if (e.group && count.get(e.group) < 2) delete e.group;
  if (S.inGroup && !(count.get(S.inGroup) >= 2)) S.inGroup = null;
}
function remapGroups(copies) {
  const count = new Map(), map = new Map();
  for (const c of copies) if (c.group) count.set(c.group, (count.get(c.group) || 0) + 1);
  for (const c of copies) {
    if (!c.group) continue;
    if (count.get(c.group) < 2) { delete c.group; continue; }
    if (!map.has(c.group)) map.set(c.group, rid('g'));
    c.group = map.get(c.group);
  }
}
function fitRect(r, maxZ, animate) {
  if (!r) return;
  const W = canvas.clientWidth, H = canvas.clientHeight, i = insets();
  const aw = Math.max(120, W - i.l - i.r), ah = Math.max(120, H - i.t - i.b);
  const z = clamp(Math.min(aw / Math.max(r.w, 1), ah / Math.max(r.h, 1)), ZMIN, maxZ);
  setView({ z, x: i.l + (aw - r.w * z) / 2 - r.x * z, y: i.t + (ah - r.h * z) / 2 - r.y * z }, animate);
}
function fitAll(animate) {
  const r = rectOf(els());
  if (!r) { setView({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2, z: 1 }, animate); return; }
  fitRect(r, S.glance ? 1.6 : 1, animate);
}
function viewCenter() {
  const i = insets(), W = canvas.clientWidth, H = canvas.clientHeight;
  return { x: (i.l + (W - i.l - i.r) / 2 - S.view.x) / S.view.z, y: (i.t + (H - i.t - i.b) / 2 - S.view.y) / S.view.z };
}
function toWorld(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left - S.view.x) / S.view.z, y: (cy - r.top - S.view.y) / S.view.z };
}

/* ================= rendering ================= */
function field(tag, cls, name, text, ph, opts) {
  const n = h(tag, { class: 'f ' + cls, 'data-field': name, 'data-ph': ph });
  if (opts && opts.single) n.dataset.single = '1';
  if (opts && opts.i != null) n.dataset.i = String(opts.i);
  n.textContent = text || '';
  return n;
}
function setEditable(node, on) {
  node.querySelectorAll('.f').forEach(f => {
    if (on && !S.glance) { f.contentEditable = PT ? 'plaintext-only' : 'true'; f.spellcheck = true; }
    else f.removeAttribute('contenteditable');
  });
}
function applySize(n, e) {
  n.style.width = e.w + 'px';
  if (FIXED_H.has(e.type)) { n.style.height = e.h + 'px'; n.style.minHeight = ''; }
  else n.style.minHeight = (e.type === 'text' ? 0 : e.h) + 'px';
}
function noteTone(f, v, tone) {
  f.classList.toggle('t-good', tone ? tone === 'good' : /^\s*\+/.test(v || ''));
  f.classList.toggle('t-bad', tone ? tone === 'bad' || tone === 'overdue' : /^\s*[-−–]/.test(v || ''));
}
function lineRow(l, i) {
  const cls = 'ln' + (l.memory ? ' mem' : '') + (l.gap ? ' gap' : '') + (l.suggested ? ' is-suggested' : '') + (l.tone ? ' t-' + l.tone : '');
  // A suggestion (a goal the engine inferred) is marked until the user rewrites or confirms it.
  const lab = l.label || l.suggested ? h('span', { class: 'ln-lab' }, l.label || '', l.suggested ? h('span', { class: 'sug-tag', text: 'suggested' }) : null) : null;
  return h('div', { class: cls, title: l.cite ? 'From ' + citeText(l.cite) : null }, lab, field('span', 'ln-text', 'line', l.text, 'Add a point', { single: 1, i }));
}
const linesBlock = e => h('div', { class: 'lines' }, e.lines.map(lineRow));
const addLineBtn = () => h('button', { class: 'add-item add-line', type: 'button' }, ic('plus'), 'Add a line');
const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function build(e) {
  const n = h('div', { class: 'el el-' + e.type, 'data-id': e.id });
  if (e.color) n.dataset.color = e.color;
  if (e.type === 'text') { n.dataset.size = e.size; n.dataset.ink = e.ink; }
  if (e.type === 'shape') { n.dataset.shape = e.shape; n.dataset.fill = e.fill; }
  if (e.memory) n.classList.add('mem');
  if (e.why) n.title = `Why it’s here: ${e.why}`;
  n.style.left = e.x + 'px'; n.style.top = e.y + 'px';
  applySize(n, e); applyRot(n, e);
  switch (e.type) {
    case 'note':
      n.append(field('div', 'note-title', 'title', e.title, 'Topic', { single: 1 }), field('div', 'note-text', 'text', e.text, 'Type a note'));
      break;
    case 'text': n.append(field('div', 'text-text', 'text', e.text, e.size === 'body' ? 'Text' : 'Heading')); break;
    case 'card':
      n.append(
        h('div', { class: 'card-tag' }, h('span', { class: 'dot' }), field('span', 'tag-text', 'tag', e.tag, 'Label', { single: 1 })),
        field('div', 'card-title', 'title', e.title, 'Title', { single: 1 }),
        linesBlock(e), addLineBtn());
      break;
    case 'person':
      n.append(
        h('div', { class: 'p-head' }, h('span', { class: 'avatar', text: initials(e.name) }), field('div', 'p-name', 'name', e.name, 'Name', { single: 1 })),
        linesBlock(e), addLineBtn());
      break;
    case 'list': {
      const ul = h('ul', { class: 'items' });
      e.items.forEach((it, i) => {
        ul.append(h('li', { class: [it.done ? 'done' : '', it.gap ? 'gap' : '', it.memory ? 'mem' : ''].filter(Boolean).join(' ') },
          h('button', { class: 'check', type: 'button', 'aria-pressed': String(!!it.done), 'aria-label': it.done ? 'Mark not done' : 'Mark done', 'data-i': i }, ic('check')),
          field('span', 'item-text', 'item', it.text, 'Item', { single: 1, i })));
      });
      n.append(field('div', 'list-title', 'title', e.title, 'Checklist', { single: 1 }), ul,
        h('button', { class: 'add-item', type: 'button' }, ic('plus'), 'Add item'));
      break;
    }
    case 'stat': {
      const nt = field('div', 'stat-note', 'note', e.note, 'Context', { single: 1 });
      noteTone(nt, e.note, e.tone);
      n.append(field('div', 'stat-label', 'label', e.label, 'Label', { single: 1 }), field('div', 'stat-value', 'value', e.value, '0', { single: 1 }), nt);
      break;
    }
    case 'chart': {
      const cap = field('div', 'chart-cap', 'caption', e.caption, 'Takeaway', { single: 1 });
      noteTone(cap, e.caption, e.captionTone);
      n.append(field('div', 'chart-title', 'title', e.title, 'Chart title', { single: 1 }), cap, h('div', { class: 'chart-body' }, chartSVG(e)));
      break;
    }
    case 'timeline':
      n.append(field('div', 'tl-title', 'title', e.title, 'Timeline', { single: 1 }), h('div', { class: 'tl-body' }, timelineSVG(e)), linesBlock(e), addLineBtn());
      break;
    case 'shape':
      n.append(shapeSVG(e), field('div', 'shape-text', 'text', e.text, ''));
      break;
    case 'image': {
      const img = h('img', { alt: e.alt || '', draggable: 'false', decoding: 'async' });
      const url = Images.resolve(e.src, u => { const live = nodes.get(e.id); const im = live && live.querySelector('img'); if (im) im.src = u; });
      if (url) img.src = url; else n.classList.add('loading');
      img.addEventListener('load', () => n.classList.remove('loading', 'broken'));
      img.addEventListener('error', () => n.classList.add('broken'));
      n.append(img);
      break;
    }
    case 'ink': n.append(inkSVG(e)); break;
  }
  const dirs = e.type === 'text' ? ['e', 'w'] : KEEP_RATIO.has(e.type) ? ['nw', 'ne', 'se', 'sw'] : HANDLE_DIRS;
  for (const d of dirs) n.append(h('div', { class: 'handle', 'data-dir': d, 'aria-hidden': 'true' }));
  n.append(h('div', { class: 'rot-handle', title: 'Drag to rotate. Shift for 15° steps', 'aria-hidden': 'true' }, ic('rotate')));
  if (S.multi.has(e.id) && !S.glance) {
    n.classList.add('selected');
    if (wholeGroupSelected(e)) n.classList.add('gsel');
    if (S.multi.size === 1) { n.classList.add('solo'); setEditable(n, true); }
  }
  nodes.set(e.id, n);
  return n;
}
function renderAll() {
  world.textContent = ''; nodes.clear();
  world.append(linkLayer);
  for (const e of els()) world.append(build(e));
  world.append(overlay, inkLayer);
  world.style.setProperty('--z', S.view.z);
  renderLinks(); updateSelTools(); updateEmpty(); updateOverlay();
  if (S.glance) { buildChips(); applySearch(); }
  queueFloat();
}
function rerender(e) {
  const old = nodes.get(e.id), n = build(e);
  if (old && old.parentNode) old.replaceWith(n); else world.insertBefore(n, overlay);
  if (S.multi.has(e.id)) { positionSelTools(); updateOverlay(); }
  renderLinks();
  return n;
}
function refreshChart(e) {
  const n = nodes.get(e.id); if (!n) return;
  if (e.type === 'chart') { const b = n.querySelector('.chart-body'); if (b) b.replaceChildren(chartSVG(e)); }
  if (e.type === 'shape') { const s = n.querySelector('.shape-bg'); if (s) s.replaceWith(shapeSVG(e)); }
  if (e.type === 'timeline') { const b = n.querySelector('.tl-body'); if (b) b.replaceChildren(timelineSVG(e)); }
  if (e.type === 'ink') { const s = n.querySelector('.ink-svg'); if (s) { s.setAttribute('width', e.w); s.setAttribute('height', e.h); } }
}

/* ---------- charts, timelines, shapes ---------- */
function niceNum(x, round) {
  if (!(x > 0)) return 1;
  const ex = Math.floor(Math.log10(x)), f = x / Math.pow(10, ex);
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * Math.pow(10, ex);
}
function niceScale(lo, hi, n) {
  if (hi === lo) hi = lo + 1;
  const step = niceNum((hi - lo) / (n - 1), true);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}
function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return +(v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return +(v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return +(v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return (+v.toFixed(a < 10 ? 2 : 1)).toLocaleString('en-US');
}
const fmtV = (e, v) => (v < 0 ? '−' : '') + (e.prefix || '') + fmtNum(Math.abs(v)) + (e.suffix || '');
const trunc = (t, n) => { t = String(t || ''); n = Math.max(2, n); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function chartSVG(e) {
  const W = Math.max(160, e.w - 34), H = Math.max(100, e.h - (e.caption ? 78 : 56));
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': e.title || 'Chart' });
  const data = e.data || [];
  if (!data.length) { svg.append(sv('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, 'Add numbers to draw this chart')); return svg; }
  const vals = data.map(d => d.value);
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const ticks = []; for (let i = 0; sc.lo + i * sc.step <= sc.hi + sc.step / 2; i++) ticks.push(+(sc.lo + i * sc.step).toFixed(10));
  const tl = ticks.map(t => fmtV(e, t));
  const padL = Math.min(70, 12 + Math.max(...tl.map(l => l.length)) * 6.7), padR = 10, padT = 20, padB = 24;
  const pw = W - padL - padR, ph = H - padT - padB;
  const Y = v => padT + ph - (v - sc.lo) / (sc.hi - sc.lo) * ph;
  const g = sv('g', { class: 'grid' });
  ticks.forEach((t, i) => { const y = Y(t); g.append(sv('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: t === 0 ? 'zero' : null }), sv('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end' }, tl[i])); });
  svg.append(g);
  const n = data.length;
  if (e.kind === 'bar') {
    const band = pw / n, bw = Math.min(56, band * 0.62);
    data.forEach((d, i) => {
      const x = padL + band * i + (band - bw) / 2, y0 = Y(Math.max(0, d.value)), y1 = Y(Math.min(0, d.value));
      svg.append(sv('rect', { x: x.toFixed(1), y: y0.toFixed(1), width: bw.toFixed(1), height: Math.max(1, y1 - y0).toFixed(1), rx: 3, class: 'bar' }));
      svg.append(sv('text', { x: (x + bw / 2).toFixed(1), y: (d.value >= 0 ? y0 - 6 : y1 + 13).toFixed(1), 'text-anchor': 'middle', class: 'val' }, fmtV(e, d.value)));
      svg.append(sv('text', { x: (padL + band * i + band / 2).toFixed(1), y: H - 5, 'text-anchor': 'middle' }, trunc(d.label, Math.floor(band / 6.8))));
    });
  } else {
    const X = i => n === 1 ? padL + pw / 2 : padL + pw * i / (n - 1);
    const pts = data.map((d, i) => [X(i), Y(d.value)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const base = Y(Math.max(sc.lo, Math.min(0, sc.hi)));
    svg.append(sv('path', { d: `${line} L${X(n - 1).toFixed(1)} ${base.toFixed(1)} L${X(0).toFixed(1)} ${base.toFixed(1)} Z`, class: 'area' }), sv('path', { d: line, class: 'ln' }));
    pts.forEach((p, i) => svg.append(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: i === n - 1 ? 4.5 : 3, class: i === n - 1 ? 'pt end' : 'pt' })));
    const last = pts[n - 1];
    svg.append(sv('text', { x: (last[0] - 9).toFixed(1), y: (last[1] - 10).toFixed(1), 'text-anchor': 'end', class: 'val' }, fmtV(e, data[n - 1].value)));
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 52))));
    data.forEach((d, i) => {
      if (i % every && i !== n - 1) return;
      if (i !== n - 1 && n - 1 - i < every && i % every === 0 && i !== 0) return;
      svg.append(sv('text', { x: X(i).toFixed(1), y: H - 5, 'text-anchor': n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, trunc(d.label, 10)));
    });
  }
  return svg;
}
// Events evenly spaced in order (dates bunch up), labels in four lanes so none collide.
function timelineSVG(e) {
  const W = Math.max(300, e.w - 36), y = 50, ev = e.events || [];
  const svg = sv('svg', { viewBox: `0 0 ${W} 96`, width: W, height: 96, role: 'img', 'aria-label': e.title || 'Timeline', class: 'tl-svg' });
  if (!ev.length) { svg.append(sv('text', { x: W / 2, y, 'text-anchor': 'middle' }, 'No history yet')); return svg; }
  svg.append(sv('line', { x1: 8, x2: W - 8, y1: y, y2: y, class: 'tl-axis' }));
  const X = i => ev.length === 1 ? W / 2 : 8 + (W - 16) * i / (ev.length - 1);
  const lanes = [y - 14, y + 24, y - 30, y + 40], ends = lanes.map(() => -Infinity);
  ev.forEach((v, i) => {
    const x = X(i), anchor = ev.length === 1 ? 'middle' : i === 0 ? 'start' : i === ev.length - 1 ? 'end' : 'middle';
    const label = v.today ? 'Today' : (v.when ? v.when + ' · ' : '') + v.label;
    const w = label.length * 6.7, x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    let lane = ends.findIndex(end => end + 10 < x0);
    if (lane < 0) lane = ends.indexOf(Math.min(...ends));
    ends[lane] = x0 + w;
    svg.append(v.today ? sv('circle', { cx: x, cy: y, r: 6, class: 'tl-today' }) : sv('circle', { cx: x, cy: y, r: 5, class: v.memory ? 'tl-ev mem' : 'tl-ev' }));
    svg.append(sv('text', { x, y: lanes[lane], 'text-anchor': anchor }, label));
  });
  return svg;
}
function shapeSVG(e) {
  const w = Math.max(1, e.w), hh = Math.max(1, e.h), p = 1.5;
  const svg = sv('svg', { class: 'shape-bg', viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, 'aria-hidden': 'true' });
  if (e.shape === 'ellipse') svg.append(sv('ellipse', { cx: w / 2, cy: hh / 2, rx: w / 2 - p, ry: hh / 2 - p }));
  else if (e.shape === 'diamond') svg.append(sv('path', { d: `M${w / 2} ${p} L${w - p} ${hh / 2} L${w / 2} ${hh - p} L${p} ${hh / 2} Z` }));
  else svg.append(sv('rect', { x: p, y: p, width: w - 2 * p, height: hh - 2 * p, rx: e.shape === 'round' ? Math.min(18, hh / 4, w / 4) : 3 }));
  return svg;
}

/* ---------- ink ---------- */
// A smooth path through the points: quadratic curves via the midpoints between samples.
function strokePath(p) {
  const n = p.length / 2; if (!n) return '';
  const f = v => +v.toFixed(1);
  if (n === 1) return `M${f(p[0])} ${f(p[1])}L${f(p[0] + 0.05)} ${f(p[1])}`;
  let d = `M${f(p[0])} ${f(p[1])}`;
  for (let i = 1; i < n - 1; i++) d += `Q${f(p[2 * i])} ${f(p[2 * i + 1])} ${f((p[2 * i] + p[2 * i + 2]) / 2)} ${f((p[2 * i + 1] + p[2 * i + 3]) / 2)}`;
  return d + `L${f(p[2 * n - 2])} ${f(p[2 * n - 1])}`;
}
function inkSVG(e) {
  const svg = sv('svg', { class: 'ink-svg', viewBox: `0 0 ${e.vw} ${e.vh}`, width: e.w, height: e.h, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (const st of e.strokes) {
    const d = strokePath(st.p);
    svg.append(sv('path', { d, class: 'hit', 'stroke-width': Math.max(st.s, 14) }), sv('path', { d, class: 'stroke' + (st.hl ? ' hl' : ''), 'data-ink': st.c, 'stroke-width': st.s }));
  }
  return svg;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// Drop points that don't change the shape (Ramer–Douglas–Peucker), so saved drawings stay small.
function simplify(flat, eps) {
  const n = flat.length / 2; if (n <= 2) return flat.slice();
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(flat[2 * i], flat[2 * i + 1], flat[2 * a], flat[2 * a + 1], flat[2 * b], flat[2 * b + 1]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[2 * i], flat[2 * i + 1]);
  return out;
}
function strokeHit(st, x, y, r) {
  const p = st.p, n = p.length / 2;
  if (n === 1) return Math.hypot(p[0] - x, p[1] - y) <= r;
  for (let i = 0; i < n - 1; i++) if (segDist(x, y, p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]) <= r) return true;
  return false;
}

/* ---------- images ---------- */
// Images are stored outside the board: in the artifact's asset store when published in Claude,
// otherwise in this browser's IndexedDB. Boards keep only a reference, so saves stay small.
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('cueboard', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('images');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (err) { rej(err); }
  });
  return idbP;
}
async function idbPut(id, blob) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbGet(id) {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction('images').objectStore('images').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
}
const blobToDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
const Images = {
  urls: new Map(), loading: new Map(), assets: null,
  resolve(src, cb) {
    if (src.startsWith('data:')) return src;
    if (src.startsWith('asset:')) return '/_blob/' + src.slice(6);
    if (this.urls.has(src)) return this.urls.get(src);
    if (!this.loading.has(src)) {
      this.loading.set(src, idbGet(src.slice(4)).then(b => { if (!b) return null; const u = URL.createObjectURL(b); this.urls.set(src, u); return u; }).catch(() => null));
    }
    this.loading.get(src).then(u => { if (u) cb(u); });
    return '';
  },
  async put(blob) {
    if (this.assets) {
      try { const r = await this.assets.upload(blob); if (r && r.id) return 'asset:' + r.id; } catch (_) { }
    }
    try { const id = rid('i'); await idbPut(id, blob); this.urls.set('idb:' + id, URL.createObjectURL(blob)); return 'idb:' + id; } catch (_) { }
    if (blob.size < 450000) { try { return await blobToDataURL(blob); } catch (_) { } }
    return null;
  },
};
useCap('assets').then(a => { Images.assets = a; });

/* ---------- links ---------- */
function anchorOf(end, toward) {
  if (!end.id) return { x: end.x, y: end.y };
  const el = byId(end.id); if (!el) return null;
  const f = frameOf(el), dx = toward.x - f.cx, dy = toward.y - f.cy;
  if (!dx && !dy) return { x: f.cx, y: f.cy };
  const cos = Math.cos(f.a), sin = Math.sin(f.a);
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos; // direction in the item's own frame
  const pad = 6;
  const t = el.type === 'shape' && el.shape === 'ellipse'
    ? 1 / Math.sqrt((lx * lx) / ((f.hw + pad) ** 2) + (ly * ly) / ((f.hh + pad) ** 2))
    : Math.min((f.hw + pad) / Math.abs(lx || 1e-9), (f.hh + pad) / Math.abs(ly || 1e-9));
  const px = lx * t, py = ly * t;
  return { x: f.cx + px * cos - py * sin, y: f.cy + px * sin + py * cos };
}
function centerOf(end) {
  if (!end.id) return { x: end.x, y: end.y };
  const el = byId(end.id); if (!el) return null;
  const b = boxOf(el); return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
function linkGeom(l) {
  const ca = centerOf(l.from), cb = centerOf(l.to);
  if (!ca || !cb) return null;
  const a = anchorOf(l.from, cb), b = anchorOf(l.to, ca);
  return a && b ? { a, b } : null;
}
function arrowHead(tip, from) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x), len = 12, wid = 6;
  const bx = tip.x - Math.cos(ang) * len, by = tip.y - Math.sin(ang) * len;
  const px = -Math.sin(ang) * wid, py = Math.cos(ang) * wid;
  return `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L${(bx + px).toFixed(1)} ${(by + py).toFixed(1)} L${(bx - px).toFixed(1)} ${(by - py).toFixed(1)} Z`;
}
function linkGroup(l, geom, cls) {
  const { a, b } = geom, d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  const g = sv('g', { class: 'link' + (cls ? ' ' + cls : '') + (l.dashed ? ' dashed' : ''), 'data-link': l.id || null, 'data-ink': l.ink || 'ink' },
    sv('path', { d, class: 'hit' }), sv('path', { d, class: 'lk' }));
  if (l.arrow === 'end' || l.arrow === 'both') g.append(sv('path', { d: arrowHead(b, a), class: 'head' }));
  if (l.arrow === 'both') g.append(sv('path', { d: arrowHead(a, b), class: 'head' }));
  // The label sits at the midpoint; a halo in the canvas color keeps the line from crossing it.
  if (l.label) g.append(sv('text', { x: ((a.x + b.x) / 2).toFixed(1), y: ((a.y + b.y) / 2).toFixed(1), class: 'lbl-text', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, l.label));
  return g;
}
let labelEd = null;
function editLinkLabel(id) {
  const l = linkById(id); if (!l) return;
  closeLabelEditor(true);
  const g = linkGeom(l); if (!g) return;
  const cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const mx = (g.a.x + g.b.x) / 2, my = (g.a.y + g.b.y) / 2;
  const input = h('input', {
    class: 'label-ed', value: l.label || '', maxlength: 60, placeholder: 'Label this arrow', 'aria-label': 'Arrow label', autocomplete: 'off',
    style: `left:${cr.left - sr.left + S.view.x + mx * S.view.z}px;top:${cr.top - sr.top + S.view.y + my * S.view.z}px`,
  });
  stage.append(input);
  labelEd = { input, id, before: l.label || '' };
  input.focus(); input.select();
  input.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); closeLabelEditor(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeLabelEditor(false); }
  });
  input.addEventListener('blur', () => closeLabelEditor(true));
}
function closeLabelEditor(commit) {
  if (!labelEd) return;
  const { input, id, before } = labelEd;
  labelEd = null;
  const v = input.value.trim().slice(0, 60);
  input.remove();
  const l = linkById(id);
  if (commit && l && v !== before) {
    pushUndo();
    if (v) l.label = v; else delete l.label;
    renderLinks(); scheduleSave(); updateSelTools();
  }
}
function renderLinks() {
  linkLayer.textContent = '';
  if (!board()) return;
  for (const l of links()) {
    const geom = linkGeom(l); if (!geom) continue;
    const g = linkGroup(l, geom, S.selLink === l.id ? 'sel' : '');
    if (S.selLink === l.id && !S.glance) {
      const r = 7 / S.view.z;
      g.append(sv('circle', { cx: geom.a.x, cy: geom.a.y, r, class: 'lend', 'data-end': 'from' }), sv('circle', { cx: geom.b.x, cy: geom.b.y, r, class: 'lend', 'data-end': 'to' }));
    }
    linkLayer.append(g);
    // A pill in the canvas color behind the label, so the line breaks around it.
    const lt = l.label && g.querySelector('.lbl-text');
    if (lt) { const bb = lt.getBBox(); g.insertBefore(sv('rect', { x: bb.x - 7, y: bb.y - 3, width: bb.width + 14, height: bb.height + 6, rx: 7, class: 'lbl-bg' }), lt); }
  }
  if (S.tempLink) {
    const t = S.tempLink, to = S.linkHover ? { id: S.linkHover } : t.to;
    const geom = linkGeom({ from: t.from, to });
    if (geom) linkLayer.append(linkGroup({ arrow: 'end', ink: 'accent' }, geom, 'temp'));
  }
}

/* ---------- overlay: connection dots, guides, marquee ---------- */
const boxStyle = (b, pad) => `left:${b.x - pad}px;top:${b.y - pad}px;width:${b.w + 2 * pad}px;height:${b.h + 2 * pad}px`;
function updateOverlay() {
  overlay.querySelectorAll('.cdot, .selbox, .gbox').forEach(d => d.remove());
  if (S.glance || !board()) return;
  const list = selected(), pad = 10 / S.view.z, busy = drag && drag.moved;
  const whole = list.length > 1 && oneGroup(list);
  // Dashed boxes: each fully selected group, and the group you're working inside.
  const groups = new Set(list.map(e => e.group).filter(Boolean));
  if (S.inGroup) groups.add(S.inGroup);
  for (const g of groups) {
    const ms = membersOf(g);
    const all = ms.every(m => S.multi.has(m.id));
    if (ms.length < 2 || (whole && all) || (!all && g !== S.inGroup)) continue;
    overlay.append(h('div', { class: 'gbox' + (all ? '' : ' entered'), style: boxStyle(unionBox(ms.map(boxOf)), pad) }));
  }
  if (list.length > 1) {
    const sb = h('div', { class: 'selbox' + (whole ? ' is-group' : ''), style: boxStyle(unionBox(list.map(boxOf)), pad) });
    if (!busy || drag.kind === 'rotate') sb.append(h('div', { class: 'rot-handle', title: 'Drag to rotate. Shift for 15° steps' }, ic('rotate')));
    overlay.append(sb);
  }
  const el = list.length === 1 && list[0];
  if (!el || busy) return;
  const f = frameOf(el), off = 20 / S.view.z, cos = Math.cos(f.a), sin = Math.sin(f.a);
  for (const [lx, ly] of [[0, -f.hh - off], [f.hw + off, 0], [0, f.hh + off], [-f.hw - off, 0]]) {
    overlay.append(h('div', { class: 'cdot', title: 'Drag to connect', style: `left:${f.cx + lx * cos - ly * sin}px;top:${f.cy + lx * sin + ly * cos}px` }));
  }
}
let angleTag = null;
function showAngle(p, deg) {
  if (!angleTag) { angleTag = h('div', { class: 'angle-tag' }); overlay.append(angleTag); }
  angleTag.textContent = `${Math.round(deg)}°`;
  Object.assign(angleTag.style, { left: p.x + 'px', top: p.y - 18 / S.view.z + 'px' });
}
function hideAngle() { if (angleTag) { angleTag.remove(); angleTag = null; } }
function showGuides(gs) {
  overlay.querySelectorAll('.guide').forEach(g => g.remove());
  for (const g of gs) {
    overlay.append(h('div', { class: 'guide', style: g.v
      ? `left:${g.at}px;top:${g.from}px;height:${g.to - g.from}px;width:calc(1px / var(--z))`
      : `top:${g.at}px;left:${g.from}px;width:${g.to - g.from}px;height:calc(1px / var(--z))` }));
  }
}
let marqueeEl = null;
function showMarquee(r) {
  if (!marqueeEl) { marqueeEl = h('div', { class: 'marquee' }); overlay.append(marqueeEl); }
  Object.assign(marqueeEl.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
function hideMarquee() { if (marqueeEl) { marqueeEl.remove(); marqueeEl = null; } }

/* ================= selection ================= */
function blurField() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#world .el')) a.blur();
}
function setSelection(ids, primary) {
  const next = new Set(ids.filter(id => byId(id)));
  for (const id of S.multi) {
    const n = nodes.get(id); if (!n) continue;
    if (!next.has(id) || next.size > 1) {
      if (document.activeElement && n.contains(document.activeElement)) document.activeElement.blur();
      setEditable(n, false);
    }
    n.classList.remove('selected', 'solo', 'gsel');
  }
  S.multi = next; S.sel = primary && next.has(primary) ? primary : [...next].pop() || null;
  S.editEl = null; S.alignOpen = false;
  if (!next.size) S.touchAdd = false;
  if (S.inGroup && ![...next].every(id => byId(id).group === S.inGroup)) S.inGroup = null;
  if (S.selLink) { S.selLink = null; renderLinks(); }
  if (!S.glance) for (const id of next) {
    const n = nodes.get(id); if (!n) continue;
    n.classList.add('selected');
    if (wholeGroupSelected(byId(id))) n.classList.add('gsel');
    if (next.size === 1) { n.classList.add('solo'); setEditable(n, true); }
  }
  closePop(); updateSelTools(); updateCtx(); updateOverlay();
}
const select = id => setSelection(id ? [id] : [], id);
function selectLink(id) {
  setSelection([]);
  S.selLink = id; renderLinks(); updateSelTools();
}

/* ---------- selection toolbar ---------- */
function tbtn(icon, label, fn, opts) {
  const b = h('button', { class: 'btn' + (opts && opts.cls ? ' ' + opts.cls : '') + (label && !(opts && opts.showLabel) ? ' icon-only' : ''), type: 'button', 'aria-label': label, title: label }, ic(icon));
  if (opts && opts.showLabel) b.append(h('span', { class: 'lbl', text: label }));
  b.addEventListener('click', fn);
  return b;
}
const sep = () => h('span', { class: 'sep' });
function swatches(list, cur, cls, onPick) {
  return list.map(c => h('button', { class: cls + (cur === c ? ' on' : ''), type: 'button', 'data-c': c, 'aria-label': c, title: c, onclick: () => onPick(c) }));
}
function seg(options, cur, onPick) {
  const s = h('div', { class: 'seg' });
  for (const [k, label, icon] of options) {
    const b = h('button', { class: 'btn' + (cur === k ? ' on' : '') + (icon ? ' icon-only' : ''), type: 'button', title: label, 'aria-label': label, onclick: () => onPick(k) }, icon ? ic(icon) : label);
    s.append(b);
  }
  return s;
}
function change(el, fn) { pushUndo(); fn(el); rerender(el); scheduleSave(); updateSelTools(); }

function updateSelTools() {
  selbar.textContent = '';
  if (S.glance || !board()) { selbar.hidden = true; return; }
  const link = S.selLink && linkById(S.selLink);
  if (link) {
    const set = fn => { pushUndo(); fn(link); renderLinks(); scheduleSave(); updateSelTools(); };
    selbar.append(
      seg([['none', 'Line', 'lnNone'], ['end', 'Arrow', 'lnEnd'], ['both', 'Both ends', 'lnBoth']], link.arrow, k => set(l => { l.arrow = k; })),
      h('button', { class: 'btn icon-only' + (link.dashed ? ' on' : ''), type: 'button', title: 'Dashed', 'aria-label': 'Dashed', onclick: () => set(l => { l.dashed = !l.dashed; }) }, ic('dash')),
      sep(), ...swatches(INKS, link.ink, 'sw ink', c => set(l => { l.ink = c; })), sep(),
      tbtn('label', link.label ? 'Edit label' : 'Label', () => editLinkLabel(link.id), { showLabel: true }),
      tbtn('trash', 'Delete', deleteSelection, { cls: 'danger' }));
    selbar.hidden = false; positionSelTools(); return;
  }
  const list = selected();
  if (!list.length) { selbar.hidden = true; return; }
  if (S.alignOpen && list.length > 1) {
    selbar.append(
      tbtn('alignL', 'Align left', () => alignSel('l')), tbtn('alignC', 'Align centers', () => alignSel('c')), tbtn('alignR', 'Align right', () => alignSel('r')), sep(),
      tbtn('alignT', 'Align top', () => alignSel('t')), tbtn('alignM', 'Align middles', () => alignSel('m')), tbtn('alignB', 'Align bottom', () => alignSel('b')), sep(),
      tbtn('distH', 'Space evenly across', () => distribute('x')), tbtn('distV', 'Space evenly down', () => distribute('y')), sep(),
      tbtn('close', 'Done aligning', () => { S.alignOpen = false; updateSelTools(); }));
    selbar.hidden = false; positionSelTools(); return;
  }
  // On touch there's no Shift key: offer "Select more" (taps add or remove) and "Select all".
  if (S.touchUI) {
    selbar.append(h('button', { class: 'btn' + (S.touchAdd ? ' on' : ''), type: 'button', 'aria-pressed': String(!!S.touchAdd), title: 'Tap items to add or remove them', onclick: () => { S.touchAdd = !S.touchAdd; updateSelTools(); } }, ic('selectMore'), h('span', { class: 'lbl', text: 'Select more' })));
    if (S.touchAdd) selbar.append(tbtn('selectAll', 'Select all', () => setSelection(els().map(x => x.id))));
    selbar.append(sep());
  }
  if (list.length > 1) {
    const whole = oneGroup(list), units = unitsOf(list).length;
    selbar.append(h('span', { class: 'sel-count', text: whole ? `Group of ${list.length}` : `${list.length} selected` }), sep());
    if (units > 1) selbar.append(tbtn('align', 'Align', () => { S.alignOpen = true; updateSelTools(); }, { showLabel: true }));
    selbar.append(whole ? tbtn('ungroup', 'Ungroup', ungroupSel, { showLabel: true }) : tbtn('group', 'Group', groupSel, { showLabel: true }));
    if (list.some(e => e.rot)) selbar.append(tbtn('straighten', 'Straighten', straightenSel));
    const colorable = list.filter(e => e.type === 'note' || e.type === 'card' || e.type === 'person');
    if (colorable.length === list.length) {
      selbar.append(sep(), ...swatches(COLORS, null, 'sw', c => { pushUndo(); colorable.forEach(e => { e.color = c; rerender(e); }); scheduleSave(); }));
    }
    selbar.append(sep(), tbtn('front', 'Bring to front', () => reorder(true)), tbtn('back', 'Send to back', () => reorder(false)),
      tbtn('copy', 'Duplicate', duplicateSelection), tbtn('trash', 'Delete', deleteSelection, { cls: 'danger' }));
    selbar.hidden = false; positionSelTools(); return;
  }
  const el = list[0];
  if (el.type === 'note' || el.type === 'card' || el.type === 'person') {
    selbar.append(...swatches(COLORS, el.color, 'sw', c => change(el, x => { x.color = c; })), sep());
  }
  if (el.type === 'text') {
    selbar.append(seg([['h1', 'Title'], ['h2', 'Heading'], ['body', 'Body']], el.size, k => change(el, x => { x.size = k; })), sep(),
      ...swatches(INKS, el.ink, 'sw ink', c => change(el, x => { x.ink = c; })), sep());
  }
  if (el.type === 'shape') {
    selbar.append(seg(SHAPES.map(s => [s, s[0].toUpperCase() + s.slice(1), s]), el.shape, k => change(el, x => { x.shape = k; })), sep(),
      ...swatches(FILLS, el.fill, 'sw fill', c => change(el, x => { x.fill = c; })), sep());
  }
  if (el.type === 'ink') {
    selbar.append(...swatches(INKS, el.strokes.every(st => st.c === el.strokes[0].c) ? el.strokes[0].c : null, 'sw ink', c => change(el, x => { x.strokes.forEach(st => { st.c = c; }); })), sep());
  }
  if (el.type === 'image') {
    selbar.append(tbtn('image', 'Replace image', () => replaceImage(el.id)), sep());
  }
  if (el.type === 'chart') {
    selbar.append(tbtn('edit', 'Edit data', () => openChartEditor(el.id), { showLabel: true }),
      seg([['bar', 'Bar'], ['line', 'Line']], el.kind, k => { pushUndo(); el.kind = k; refreshChart(el); scheduleSave(); updateSelTools(); }), sep());
  }
  if (!AI.off) selbar.append(tbtn('spark', 'Ask', () => { setAssistant(true); asIn.focus(); }, { showLabel: true }));
  if (el.rot) selbar.append(tbtn('straighten', `Straighten (now ${Math.round(el.rot)}°)`, straightenSel));
  selbar.append(tbtn('front', 'Bring to front', () => reorder(true)), tbtn('back', 'Send to back', () => reorder(false)),
    tbtn('copy', 'Duplicate', duplicateSelection), tbtn('trash', 'Delete', deleteSelection, { cls: 'danger' }));
  selbar.hidden = false;
  positionSelTools();
}
function positionSelTools() {
  if (selbar.hidden) return;
  let r = null;
  const sr = stage.getBoundingClientRect();
  if (S.selLink) {
    const l = linkById(S.selLink), g = l && linkGeom(l);
    if (!g) return;
    const x0 = Math.min(g.a.x, g.b.x), y0 = Math.min(g.a.y, g.b.y);
    const cr = canvas.getBoundingClientRect();
    r = { left: cr.left + S.view.x + x0 * S.view.z, top: cr.top + S.view.y + y0 * S.view.z, width: Math.abs(g.a.x - g.b.x) * S.view.z, height: Math.abs(g.a.y - g.b.y) * S.view.z };
    r.bottom = r.top + r.height;
  } else {
    const list = selected(); if (!list.length) return;
    const rects = list.map(e => nodes.get(e.id)).filter(Boolean).map(n => n.getBoundingClientRect());
    if (!rects.length) return;
    const left = Math.min(...rects.map(q => q.left)), top = Math.min(...rects.map(q => q.top));
    const right = Math.max(...rects.map(q => q.right)), bottom = Math.max(...rects.map(q => q.bottom));
    r = { left, top, width: right - left, height: bottom - top, bottom };
  }
  const bw = selbar.offsetWidth, bh = selbar.offsetHeight;
  let x = r.left - sr.left + r.width / 2 - bw / 2, y = r.top - sr.top - bh - 30;
  if (y < 64) y = r.bottom - sr.top + 30;
  x = clamp(x, 8, Math.max(8, sr.width - bw - 8)); y = clamp(y, 8, Math.max(8, sr.height - bh - 8));
  selbar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/* ================= undo ================= */
const snapshot = () => JSON.stringify({ e: els(), l: links() });
function pushUndo() {
  S.undo.push(snapshot()); if (S.undo.length > 100) S.undo.shift();
  S.redo.length = 0; S.touched = true; updateUndo();
}
function restore(json) {
  let raw = { e: [], l: [] };
  try { const p = JSON.parse(json); raw = Array.isArray(p) ? { e: p, l: [] } : p; } catch (_) { }
  board().elements = (raw.e || []).map(x => normalizeEl(x, true)).filter(Boolean);
  const ids = new Set(els().map(e => e.id));
  board().links = (raw.l || []).map(l => normalizeLink(l, ids)).filter(Boolean);
  pruneGroups();
  S.multi = new Set([...S.multi].filter(id => ids.has(id)));
  S.sel = S.multi.has(S.sel) ? S.sel : null; S.selLink = null; S.editEl = null; closePop();
  renderAll(); updateCtx(); scheduleSave();
}
function undo() { if (!S.undo.length) return; blurField(); S.redo.push(snapshot()); restore(S.undo.pop()); updateUndo(); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); updateUndo(); }
function updateUndo() { $('#b-undo').disabled = !S.undo.length; $('#b-redo').disabled = !S.redo.length; }

/* ================= element ops ================= */
const MAINF = {
  note: '[data-field="text"]', text: '[data-field="text"]', card: '[data-field="title"]', list: '[data-field="item"]', stat: '[data-field="label"]',
  chart: '[data-field="title"]', person: '[data-field="name"]', timeline: '[data-field="title"]', shape: '[data-field="text"]',
};
let nudge = 0;
function addEl(type, extra, at) {
  if (type === 'arrow') { addArrow(); return null; }
  const e = normalizeEl(Object.assign({ type }, extra || {}), false);
  if (!e) return null;
  if (type === 'chart' && !e.data.length) { e.title = 'New chart'; e.data = [{ label: 'Q1', value: 12 }, { label: 'Q2', value: 18 }, { label: 'Q3', value: 15 }, { label: 'Q4', value: 24 }]; }
  if (type === 'list' && !e.items.length) e.items = [{ text: '', done: false }];
  if ((type === 'card' || type === 'person') && !e.lines.length) e.lines = [{ text: '' }];
  if (type === 'card' && !e.tag) e.tag = 'Context';
  if (at) { e.x = Math.round(at.x); e.y = Math.round(at.y); }
  else { const c = viewCenter(), off = (nudge++ % 6) * 20; e.x = Math.round(c.x - e.w / 2 + off); e.y = Math.round(c.y - e.h / 2 + off); }
  pushUndo();
  els().push(e);
  const n = build(e); n.classList.add('fresh'); world.insertBefore(n, overlay);
  select(e.id); S.editEl = e.id; scheduleSave(); updateEmpty();
  if (type === 'chart') setTimeout(() => openChartEditor(e.id), 30);
  else setTimeout(() => { const f = n.querySelector(MAINF[type]); if (f) placeCaret(null, null, f); }, 30);
  return e;
}
function replaceImage(id) {
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
  document.body.append(pick);
  pick.addEventListener('change', async () => {
    const f = pick.files && pick.files[0]; pick.remove();
    const el = byId(id); if (!f || !el) return;
    try {
      const { blob, w, h: hh } = await prepImage(f);
      const src = await Images.put(blob); if (!src) { toast('That image is too big to keep in this browser'); return; }
      change(el, x => { x.src = src; x.alt = (f.name || '').replace(/\.[^.]+$/, ''); x.h = Math.max(MIN.image.h, Math.round(x.w * hh / Math.max(1, w))); });
    } catch (_) { toast('That file couldn’t be read as an image'); }
  });
  pick.click();
}
function addArrow() {
  const c = viewCenter(), off = (nudge++ % 6) * 20;
  const l = normalizeLink({ from: { x: c.x - 90 + off, y: c.y + off }, to: { x: c.x + 90 + off, y: c.y + off }, arrow: 'end' }, new Set());
  pushUndo(); links().push(l); scheduleSave(); updateEmpty();
  selectLink(l.id);
  toast('Drag either end onto a card to connect it');
}
function deleteSelection() {
  if (S.selLink) {
    pushUndo();
    board().links = links().filter(l => l.id !== S.selLink);
    S.selLink = null; renderLinks(); updateSelTools(); scheduleSave();
    toast('Deleted', { label: 'Undo', fn: undo });
    return;
  }
  const ids = new Set(S.multi); if (!ids.size) return;
  pushUndo();
  board().elements = els().filter(e => !ids.has(e.id));
  board().links = links().filter(l => !(l.from.id && ids.has(l.from.id)) && !(l.to.id && ids.has(l.to.id)));
  for (const id of ids) { const n = nodes.get(id); if (n) n.remove(); nodes.delete(id); }
  pruneGroups();
  S.multi = new Set(); S.sel = null; closePop(); renderLinks(); updateSelTools(); updateCtx(); updateOverlay(); scheduleSave(); updateEmpty();
  toast(ids.size > 1 ? `Deleted ${ids.size} items` : 'Deleted', { label: 'Undo', fn: undo });
}
// Copies of elements (new ids) plus the links between them.
function cloneSet(list, dx, dy) {
  const map = new Map();
  const copies = list.map(el => {
    const raw = JSON.parse(JSON.stringify(el)); delete raw.id; delete raw.live;
    const c = normalizeEl(raw, false); c.x = el.x + dx; c.y = el.y + dy;
    map.set(el.id, c.id); return c;
  });
  remapGroups(copies);
  const ls = links().filter(l => l.from.id && l.to.id && map.has(l.from.id) && map.has(l.to.id))
    .map(l => Object.assign({}, l, { id: rid('l'), from: { id: map.get(l.from.id) }, to: { id: map.get(l.to.id) } }));
  return { copies, ls };
}
function insertSet(copies, ls) {
  pushUndo();
  els().push(...copies); links().push(...ls);
  for (const c of copies) { const n = build(c); n.classList.add('fresh'); world.insertBefore(n, overlay); }
  renderLinks(); setSelection(copies.map(c => c.id)); scheduleSave(); updateEmpty();
}
function duplicateSelection() {
  const list = selected(); if (!list.length) return;
  const { copies, ls } = cloneSet(list, 28, 28);
  insertSet(copies, ls);
}
function copySelection(cut) {
  const list = selected(); if (!list.length) return false;
  const ids = new Set(list.map(e => e.id));
  S.clipStale = false;
  S.clip = { els: JSON.parse(JSON.stringify(list)), links: JSON.parse(JSON.stringify(links().filter(l => l.from.id && l.to.id && ids.has(l.from.id) && ids.has(l.to.id)))) };
  S.pasteN = 0;
  S.clipText = list.map(e => textOf(e)).filter(Boolean).join('\n');
  try { navigator.clipboard && navigator.clipboard.writeText(S.clipText).catch(() => { }); } catch (_) { }
  if (cut) deleteSelection(); else toast(list.length > 1 ? `Copied ${list.length} items` : 'Copied');
  return true;
}
function pasteClip() {
  if (!S.clip || !S.clip.els.length) return false;
  S.pasteN++;
  const temp = S.clip.els.map(e => normalizeEl(e, true)).filter(Boolean);
  const map = new Map();
  const copies = temp.map(el => { const raw = JSON.parse(JSON.stringify(el)); delete raw.id; const c = normalizeEl(raw, false); c.x = el.x + 24 * S.pasteN; c.y = el.y + 24 * S.pasteN; map.set(el.id, c.id); return c; });
  remapGroups(copies);
  const ls = S.clip.links.filter(l => map.has(l.from.id) && map.has(l.to.id)).map(l => Object.assign({}, l, { id: rid('l'), from: { id: map.get(l.from.id) }, to: { id: map.get(l.to.id) } }));
  insertSet(copies, ls);
  return true;
}
function pasteText(text) {
  const t = text.trim(); if (!t) return;
  const c = viewCenter();
  if (t.length < 60 && !t.includes('\n')) addEl('text', { text: t, size: 'h2' }, { x: c.x - 200, y: c.y - 20 });
  else addEl('note', { text: t.slice(0, 600) }, { x: c.x - 110, y: c.y - 95 });
}
// Bring images onto the board: decode, scale big ones down, store, then place.
async function prepImage(file) {
  let w = 0, hh = 0, bmp = null;
  try { bmp = await createImageBitmap(file); w = bmp.width; hh = bmp.height; }
  catch (_) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      w = img.naturalWidth || 400; hh = img.naturalHeight || 300; bmp = img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const MAX = 1800;
  const keep = file.type === 'image/gif' || file.type === 'image/svg+xml' || (Math.max(w, hh) <= MAX && file.size <= 1.5e6);
  if (keep) { if (bmp && bmp.close) bmp.close(); return { blob: file, w, h: hh }; }
  const k = Math.min(1, MAX / Math.max(w, hh)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(hh * k));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
  if (bmp && bmp.close) bmp.close();
  const blob = (await new Promise(r => cv.toBlob(r, 'image/webp', 0.86))) || (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86)));
  return { blob: blob || file, w: cw, h: ch };
}
async function importImages(files, at) {
  const list = [...(files || [])].filter(f => f && /^image\//.test(f.type)).slice(0, 12);
  if (!list.length) return false;
  const boardId = S.boardId;
  toast(list.length > 1 ? `Adding ${list.length} images…` : 'Adding image…');
  const made = [];
  for (const f of list) {
    try {
      const { blob, w, h: hh } = await prepImage(f);
      const src = await Images.put(blob);
      if (!src) { toast('That image is too big to keep in this browser'); continue; }
      const k = Math.min(1, 420 / Math.max(w, hh, 1));
      const ew = Math.max(40, Math.round(w * k)), eh = Math.max(30, Math.round(hh * k));
      const c = at || viewCenter(), off = made.length * 28;
      const e = normalizeEl({ type: 'image', src, alt: (f.name || 'Image').replace(/\.[^.]+$/, ''), w: ew, h: eh, x: c.x - ew / 2 + off, y: c.y - eh / 2 + off }, false);
      if (e) made.push(e);
    } catch (_) { toast('That file couldn’t be read as an image'); }
  }
  if (made.length && S.boardId === boardId) { insertSet(made, []); hideToast(); }
  return true;
}
const filePick = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
document.body.append(filePick);
filePick.addEventListener('change', () => { importImages(filePick.files); filePick.value = ''; });

/* ---------- drawing ---------- */
const PEN_WIDTHS = [2, 4, 8];
let penPrefs = { tool: 'pen', ink: 'ink', width: 4 };
try { Object.assign(penPrefs, JSON.parse(localStorage.getItem('cueboard.pen') || '{}')); } catch (_) { }
const penbar = h('div', { id: 'penbar', class: 'group', hidden: true, role: 'toolbar', 'aria-label': 'Drawing tools' });
$('#stage').append(penbar);
const inkLayer = sv('svg', { class: 'links temp-ink', 'aria-hidden': 'true' });
let eraserDot = null;
// Remembered between sessions, except the eraser: Draw always opens ready to draw.
function savePen() { try { localStorage.setItem('cueboard.pen', JSON.stringify({ tool: S.pen.tool === 'eraser' ? 'pen' : S.pen.tool, ink: S.pen.ink, width: S.pen.width })); } catch (_) { } }
function enterPen() {
  if (S.glance) return;
  blurField(); setSelection([]); closePop();
  S.pen = Object.assign({}, penPrefs, { session: null });
  if (!['pen', 'hl'].includes(S.pen.tool)) S.pen.tool = 'pen';
  if (!INKS.includes(S.pen.ink)) S.pen.ink = 'ink';
  if (!PEN_WIDTHS.includes(S.pen.width)) S.pen.width = 4;
  app.classList.add('drawing'); app.dataset.tool = S.pen.tool;
  $('#b-draw').classList.add('on'); $('#b-draw').setAttribute('aria-pressed', 'true');
  renderPenbar();
}
function exitPen() {
  if (!S.pen) return;
  penPrefs = { tool: S.pen.tool === 'eraser' ? 'pen' : S.pen.tool, ink: S.pen.ink, width: S.pen.width };
  S.pen = null; app.classList.remove('drawing'); delete app.dataset.tool;
  $('#b-draw').classList.remove('on'); $('#b-draw').setAttribute('aria-pressed', 'false');
  penbar.hidden = true; inkLayer.textContent = '';
  if (eraserDot) { eraserDot.remove(); eraserDot = null; }
}
function renderPenbar() {
  penbar.textContent = '';
  const P = S.pen;
  const set = (k, v) => { P[k] = v; if (k === 'tool') app.dataset.tool = v; savePen(); renderPenbar(); };
  penbar.append(seg([['pen', 'Pen', 'pen'], ['hl', 'Highlighter', 'marker'], ['eraser', 'Eraser', 'eraser']], P.tool, k => set('tool', k)));
  if (P.tool !== 'eraser') {
    penbar.append(sep(), ...swatches(INKS, P.ink, 'sw ink', c => set('ink', c)), sep());
    const ws = h('div', { class: 'seg' });
    PEN_WIDTHS.forEach((w, i) => ws.append(h('button', { class: 'btn icon-only' + (P.width === w ? ' on' : ''), type: 'button', title: ['Fine', 'Medium', 'Bold'][i], 'aria-label': ['Fine', 'Medium', 'Bold'][i] + ' line', onclick: () => set('width', w) },
      h('span', { class: 'wdot', style: `width:${w + 3}px;height:${w + 3}px` }))));
    penbar.append(ws);
  } else penbar.append(h('span', { class: 'sel-count', text: 'Drag across strokes to erase them' }));
  penbar.append(sep(), h('button', { class: 'btn', type: 'button', onclick: exitPen }, 'Done'));
  penbar.hidden = false;
}
function drawWidth() {
  const base = S.pen.tool === 'hl' ? S.pen.width * 4 + 6 : S.pen.width;
  return +(base / S.view.z).toFixed(2); // the line looks the size you picked at the zoom you drew at
}
function showTempStroke(pts) {
  inkLayer.textContent = '';
  if (!pts) return;
  inkLayer.append(sv('path', { d: strokePath(pts), class: 'stroke' + (S.pen.tool === 'hl' ? ' hl' : ''), 'data-ink': S.pen.ink, 'stroke-width': drawWidth() }));
}
// A finished stroke joins the drawing you're working on if it's close to it; otherwise it starts a new one.
function finishStroke(raw) {
  const P = S.pen; if (!P || raw.length < 2) return;
  const width = drawWidth();
  const pts = simplify(raw, 0.45 / S.view.z);
  const pad = width / 2 + 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); y0 = Math.min(y0, pts[i + 1]); x1 = Math.max(x1, pts[i]); y1 = Math.max(y1, pts[i + 1]); }
  const box = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  const stroke = { c: P.ink, s: width, hl: P.tool === 'hl', p: pts };
  pushUndo();
  const cur = P.session && byId(P.session);
  const near = 60 / S.view.z;
  if (cur && cur.type === 'ink' && box.x < cur.x + cur.w + near && box.x + box.w > cur.x - near && box.y < cur.y + cur.h + near && box.y + box.h > cur.y - near) {
    const kx = cur.w / cur.vw, ky = cur.h / cur.vh;
    const all = cur.strokes.map(st => ({ c: st.c, hl: st.hl, s: st.s * Math.min(kx, ky), p: st.p.map((v, i) => (i % 2 ? cur.y + v * ky : cur.x + v * kx)) }));
    all.push(stroke);
    const nx = Math.min(cur.x, box.x), ny = Math.min(cur.y, box.y);
    const nw = Math.max(cur.x + cur.w, box.x + box.w) - nx, nh = Math.max(cur.y + cur.h, box.y + box.h) - ny;
    cur.strokes = all.map(st => ({ c: st.c, hl: st.hl, s: +st.s.toFixed(2), p: st.p.map((v, i) => +(v - (i % 2 ? ny : nx)).toFixed(1)) }));
    cur.x = Math.round(nx); cur.y = Math.round(ny); cur.w = cur.vw = Math.max(1, Math.round(nw)); cur.h = cur.vh = Math.max(1, Math.round(nh));
    cur.strokes.forEach(st => { st.p = st.p.map((v, i) => +(v + (i % 2 ? ny - cur.y : nx - cur.x)).toFixed(1)); });
    rerender(cur);
  } else {
    const x = Math.round(box.x), y = Math.round(box.y);
    const e = normalizeEl({ type: 'ink', x, y, w: Math.max(1, Math.round(box.w)), h: Math.max(1, Math.round(box.h)), vw: Math.max(1, Math.round(box.w)), vh: Math.max(1, Math.round(box.h)),
      strokes: [{ c: stroke.c, s: stroke.s, hl: stroke.hl, p: pts.map((v, i) => +(v - (i % 2 ? y : x)).toFixed(1)) }] }, false);
    if (!e) return;
    e.x = x; e.y = y; e.w = e.vw; e.h = e.vh;
    els().push(e);
    world.insertBefore(build(e), overlay);
    P.session = e.id;
  }
  scheduleSave(); updateEmpty();
}
function removeEls(ids) {
  board().elements = els().filter(e => !ids.has(e.id));
  board().links = links().filter(l => !(l.from.id && ids.has(l.from.id)) && !(l.to.id && ids.has(l.to.id)));
  for (const id of ids) { const n = nodes.get(id); if (n) n.remove(); nodes.delete(id); }
  pruneGroups(); renderLinks();
}
function eraseAt(cx, cy, d) {
  const p = toWorld(cx, cy), r = 9 / S.view.z;
  if (!eraserDot) { eraserDot = h('div', { class: 'eraser-dot' }); overlay.append(eraserDot); }
  Object.assign(eraserDot.style, { left: p.x + 'px', top: p.y + 'px', width: 2 * r + 'px', height: 2 * r + 'px' });
  const gone = new Set();
  for (const el of els()) {
    if (el.type !== 'ink' || p.x < el.x - r || p.x > el.x + el.w + r || p.y < el.y - r || p.y > el.y + el.h + r) continue;
    const kx = el.w / el.vw, ky = el.h / el.vh, rv = r / Math.min(kx, ky);
    const vx = (p.x - el.x) / kx, vy = (p.y - el.y) / ky;
    const keep = el.strokes.filter(st => !strokeHit(st, vx, vy, rv + st.s / 2));
    if (keep.length === el.strokes.length) continue;
    if (!d.pushed) { pushUndo(); d.pushed = true; }
    el.strokes = keep;
    if (keep.length) rerender(el); else gone.add(el.id);
  }
  if (gone.size) removeEls(gone);
  if (d.pushed) scheduleSave();
}

function reorder(front) {
  const ids = S.multi; if (!ids.size) return;
  pushUndo();
  const keep = els().filter(e => !ids.has(e.id)), moved = els().filter(e => ids.has(e.id));
  board().elements = front ? keep.concat(moved) : moved.concat(keep);
  renderAll(); scheduleSave();
  toast(front ? 'Brought to front' : 'Sent to back');
}
function groupSel() {
  const list = selected(); if (list.length < 2 || oneGroup(list)) return;
  pushUndo();
  const g = rid('g');
  for (const e of list) e.group = g;
  S.inGroup = null;
  setSelection(list.map(e => e.id), S.sel); scheduleSave();
  toast(`Grouped ${list.length} items. Double-click one to work on it alone.`);
}
function ungroupSel() {
  const gs = new Set(selected().map(e => e.group).filter(Boolean));
  if (S.inGroup) gs.add(S.inGroup);
  if (!gs.size) return;
  pushUndo();
  for (const e of els()) if (gs.has(e.group)) delete e.group;
  S.inGroup = null;
  setSelection([...S.multi], S.sel); scheduleSave();
  toast('Ungrouped');
}
function straightenSel() {
  const list = selected().filter(e => e.rot); if (!list.length) return;
  pushUndo();
  for (const e of list) { delete e.rot; applyRot(nodes.get(e.id), e); }
  afterMove(); updateSelTools();
}
function moveTo(el, x, y) {
  el.x = Math.round(x); el.y = Math.round(y);
  const n = nodes.get(el.id); if (n) { n.style.left = el.x + 'px'; n.style.top = el.y + 'px'; }
}
// Align and space by unit: a group moves as one block, by its outer box.
function alignSel(kind) {
  const us = unitsOf(selected()); if (us.length < 2) return;
  pushUndo();
  const r = unionBox(us.map(u => u.box));
  for (const u of us) {
    const b = u.box;
    const dx = kind === 'l' ? r.x - b.x : kind === 'c' ? r.x + (r.w - b.w) / 2 - b.x : kind === 'r' ? r.x + r.w - b.w - b.x : 0;
    const dy = kind === 't' ? r.y - b.y : kind === 'm' ? r.y + (r.h - b.h) / 2 - b.y : kind === 'b' ? r.y + r.h - b.h - b.y : 0;
    for (const e of u.members) moveTo(e, e.x + dx, e.y + dy);
  }
  afterMove();
}
function distribute(axis) {
  const us = unitsOf(selected()); if (us.length < 3) { toast('Select three or more to space them evenly'); return; }
  pushUndo();
  const pos = axis === 'x' ? 'x' : 'y', dim = axis === 'x' ? 'w' : 'h';
  us.sort((a, b) => a.box[pos] - b.box[pos]);
  const first = us[0].box, last = us[us.length - 1].box;
  const gap = (last[pos] + last[dim] - first[pos] - us.reduce((a, u) => a + u.box[dim], 0)) / (us.length - 1);
  let at = first[pos];
  for (const u of us) {
    const d = at - u.box[pos];
    for (const e of u.members) moveTo(e, pos === 'x' ? e.x + d : e.x, pos === 'y' ? e.y + d : e.y);
    at += u.box[dim] + gap;
  }
  afterMove();
}
function afterMove() { renderLinks(); positionSelTools(); updateOverlay(); scheduleSave(); }
let nudgeT = 0;
function nudgeSel(dx, dy) {
  const list = selected(); if (!list.length) return;
  if (Date.now() - nudgeT > 700) pushUndo();
  nudgeT = Date.now();
  for (const e of list) moveTo(e, e.x + dx, e.y + dy);
  afterMove();
}
function placeCaret(x, y, f) {
  if (!f) return;
  if (!f.isContentEditable) { const n = f.closest('.el'); if (n) setEditable(n, true); }
  let r = null;
  if (x != null) {
    try {
      if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); } }
      else if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
    } catch (_) { r = null; }
  }
  f.focus({ preventScroll: true });
  const s = window.getSelection(); if (!s) return;
  if (r && f.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); }
  else { const rr = document.createRange(); rr.selectNodeContents(f); rr.collapse(false); s.removeAllRanges(); s.addRange(rr); }
}
function readField(f) { return (f.innerText || '').replace(/ /g, ' ').replace(/\n+$/, ''); }
function updateFieldModel(f) {
  const node = f.closest('.el'); if (!node) return;
  const el = byId(node.dataset.id); if (!el) return;
  const name = f.dataset.field;
  let v = readField(f);
  if (f.dataset.single) v = v.replace(/\s*\n\s*/g, ' ');
  if (name === 'item') {
    const it = el.items[+f.dataset.i];
    if (it && it.text !== v) { it.text = v.slice(0, 240); delete it.cite; if (it.gap || it.memory) { delete it.gap; delete it.memory; const li = f.closest('li'); if (li) li.classList.remove('gap', 'mem'); } }
  } else if (name === 'line') {
    // A rewritten line is the user's own: it no longer claims to be from memory or unknown.
    const l = el.lines[+f.dataset.i];
    if (l && l.text !== v) {
      l.text = v.slice(0, 300);
      if (l.cite) { delete l.cite; const row = f.closest('.ln'); if (row) row.removeAttribute('title'); }
      if (l.memory || l.gap || l.tone || l.suggested) {
        delete l.memory; delete l.gap; delete l.tone; delete l.suggested;
        const row = f.closest('.ln'); if (row) { row.className = 'ln'; const tag = row.querySelector('.sug-tag'); if (tag) tag.remove(); }
      }
    }
  } else if (name in el && el[name] !== v) {
    el[name] = v.slice(0, name === 'text' && el.type === 'note' ? 600 : 300);
    if (el.type === 'note' && el.memory) { delete el.memory; node.classList.remove('mem'); }
    if ((el.type === 'note' && name === 'text') || (el.type === 'stat' && (name === 'value' || name === 'note'))) delete el.cite;
    if (el.type === 'stat' && name === 'note') { delete el.tone; delete el.memory; node.classList.remove('mem'); }
    if (el.type === 'chart' && name === 'caption') delete el.captionTone;
    if (el.type === 'person' && name === 'name') { const a = node.querySelector('.avatar'); if (a) a.textContent = initials(v); }
  }
  if (el.type === 'stat' && name === 'note') noteTone(f, v, el.tone);
  if (el.type === 'chart' && name === 'caption') noteTone(f, v, el.captionTone);
}
function focusField(id, field, i) {
  const n = nodes.get(id); if (!n) return;
  const f = n.querySelector(`.f[data-field="${field}"][data-i="${i}"]`);
  if (f) placeCaret(null, null, f);
}

/* ================= tidy / settle ================= */
const COL = 280, GAP = 24, NCOL = 4;
const spanOf = e => e.type === 'chart' || e.type === 'timeline' ? 2 : (e.w > COL * 1.5 ? 2 : 1);
function flowLayout(list, x0, y0, animate) {
  const heads = list.filter(e => e.type === 'text'), rest = list.filter(e => e.type !== 'text');
  const full = NCOL * COL + (NCOL - 1) * GAP;
  for (const e of heads) { if (e.w > full) e.w = full; const n = nodes.get(e.id); if (n) n.style.width = e.w + 'px'; }
  for (const e of rest) { if (e.type === 'shape' || e.type === 'group' || KEEP_RATIO.has(e.type)) continue; const sp = spanOf(e); e.w = sp * COL + (sp - 1) * GAP; const n = nodes.get(e.id); if (n) applySize(n, e); }
  let y = y0;
  for (const e of heads) { e.x = x0; e.y = y; y += sizeOf(e).h + (e.size === 'h1' ? 6 : 12); }
  if (heads.length) y += 22;
  const colY = Array(NCOL).fill(y);
  for (const e of rest) {
    const sp = Math.min(NCOL, Math.ceil((sizeOf(e).w + GAP) / (COL + GAP))); let best = 0, bestY = Infinity;
    for (let c = 0; c <= NCOL - sp; c++) { const yy = Math.max(...colY.slice(c, c + sp)); if (yy < bestY - 1) { bestY = yy; best = c; } }
    e.x = x0 + best * (COL + GAP); e.y = bestY;
    const hh = sizeOf(e).h; for (let c = best; c < best + sp; c++) colY[c] = bestY + hh + GAP;
  }
  if (animate && !RM) { world.classList.add('moving'); setTimeout(() => world.classList.remove('moving'), 400); }
  for (const e of list) { const n = nodes.get(e.id); if (n) { n.style.left = e.x + 'px'; n.style.top = e.y + 'px'; } }
  rest.filter(e => e.type === 'chart' || e.type === 'timeline').forEach(refreshChart);
  renderLinks();
}
const readingOrder = list => [...list].sort((a, b) => (Math.round(a.y / 110) - Math.round(b.y / 110)) || (a.x - b.x));
// Groups move as one block and keep their inside arrangement.
function tidyLayout(animate) {
  const list = els(); if (!list.length) return;
  const loose = [], groups = new Map();
  for (const e of list) { if (e.group) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); } else loose.push(e); }
  const blocks = [...groups.values()].map(ms => { const b = unionBox(ms.map(boxOf)); return { id: 'grp-' + ms[0].group, type: 'group', members: ms, box: b, x: b.x, y: b.y, w: b.w, h: b.h }; });
  const r = rectOf(list);
  flowLayout(readingOrder(loose.concat(blocks)), Math.round(r.x), Math.round(r.y), animate);
  for (const g of blocks) { const dx = g.x - g.box.x, dy = g.y - g.box.y; for (const m of g.members) moveTo(m, m.x + dx, m.y + dy); }
  renderLinks();
}
function tidy(withUndo) {
  const list = els(); if (!list.length) return;
  if (withUndo) pushUndo();
  tidyLayout(true);
  scheduleSave(); positionSelTools(); updateOverlay();
  setTimeout(() => fitAll(true), RM ? 0 : 360);
}
function placeNew(list) {
  const others = els().filter(e => !list.includes(e));
  const r = rectOf(others);
  const x0 = r ? Math.round(r.x) : 0, y0 = r ? Math.round(r.y + r.h + 72) : 0;
  flowLayout(list, x0, y0, false);
}
// The engine placed items using estimated heights. Once they're drawn, restack each column
// with real heights so nothing overlaps and gaps stay even. Runs once, before the user touches it.
// pushOnly: only move things down out of the way, never up; used after a refresh, where the
// user's arrangement stays as they left it.
function settle(pushOnly) {
  const items = els().map(e => ({ e, y0: e.y, s: sizeOf(e) })).sort((a, b) => a.y0 - b.y0 || a.e.x - b.e.x);
  const done = [];
  for (const it of items) {
    const above = done.filter(d => d.e.x < it.e.x + it.s.w && it.e.x < d.e.x + d.s.w);
    if (above.length) {
      const gap = it.e.type === 'text' ? 6 : GAP;
      const prev = above.reduce((a, d) => (d.e.y + d.s.h > a.e.y + a.s.h ? d : a));
      const want = Math.round(prev.e.y + prev.s.h + (prev.e.type === 'text' && it.e.type !== 'text' ? 28 : gap));
      if (!pushOnly || it.e.y < want) it.e.y = want;
    }
    const n = nodes.get(it.e.id); if (n) n.style.top = it.e.y + 'px';
    done.push(it);
  }
  renderLinks();
}

/* ================= persistence ================= */
const LS_KEY = 'cueboard.boards.v1';
function canLocal() { try { localStorage.setItem('__cb', '1'); localStorage.removeItem('__cb'); return true; } catch (_) { return false; } }
function readLocal() {
  try { const raw = localStorage.getItem(LS_KEY); if (!raw) return null; const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.map(normalizeBoard).filter(Boolean) : null; }
  catch (_) { return null; }
}
function writeLocalAll() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Object.values(S.boards).filter(b => b.saved).map(b => Object.assign({ id: b.id }, serialize(b))))); return true; }
  catch (_) { return false; }
}
function useCap(name) {
  try { const c = window.claude; if (c && typeof c.use === 'function') return Promise.resolve(c.use(name)).catch(() => null); } catch (_) { }
  return Promise.resolve(null);
}
const Store = {
  mode: 'memory', col: null, ready: null,
  async init() {
    try {
      const [db, user] = await Promise.all([useCap('db'), useCap('user')]);
      if (db && user) {
        const uid = await user.id();
        if (uid) {
          this.col = db.collection('data/users/' + uid);
          const snap = await this.col.get();
          const out = [];
          snap.docs.forEach(d => { if (d.exists && /^b-/.test(d.id)) { const b = normalizeBoard(Object.assign({}, d.data(), { id: d.id })); if (b) out.push(b); } });
          this.mode = 'db';
          return out;
        }
      }
    } catch (_) { this.col = null; }
    if (canLocal()) { this.mode = 'local'; return readLocal() || []; }
    this.mode = 'memory';
    return [];
  },
  async remove(id) {
    if (this.mode === 'db' && this.col) { try { await this.col.doc(id).delete(); } catch (_) { } }
    else if (this.mode === 'local') writeLocalAll();
  }
};
const STATUS = { saving: 'Saving…', saved: 'Saved', local: 'Saved in this browser', memory: 'Not saved in this view', full: 'Storage full, not saved', example: 'Changes save automatically' };
function setStatus(k) {
  statusEl.textContent = STATUS[k] || '';
  statusEl.classList.toggle('warn', k === 'full' || k === 'memory');
}
let saveT = null, saving = Promise.resolve();
const dirty = new Set();
function scheduleSave(id) {
  const b = S.boards[id || S.boardId]; if (!b) return;
  S.touched = true;
  b.updatedAt = Date.now();
  dirty.add(b.id); setStatus('saving');
  if (b.id === S.boardId) queueFloat();
  clearTimeout(saveT); saveT = setTimeout(flush, 700);
}
function flush() {
  clearTimeout(saveT);
  if (!dirty.size) return saving;
  const ids = [...dirty]; dirty.clear();
  saving = saving.then(() => Store.ready).then(async () => { for (const id of ids) await writeBoard(id); }).catch(() => { });
  return saving;
}
async function writeBoard(id) {
  const b = S.boards[id]; if (!b) return;
  b.saved = true;
  if (Store.mode === 'db' && Store.col) {
    const body = serialize(b);
    try { await Store.col.doc(id).set(body); if (!dirty.size) setStatus('saved'); return; }
    catch (e) {
      const code = e && e.code;
      if (code === 'unavailable') {
        await sleep(700 + Math.random() * 900);
        try { await Store.col.doc(id).set(body); if (!dirty.size) setStatus('saved'); return; } catch (_) { }
      } else if (code === 'quota_exceeded') { setStatus('full'); return; }
      Store.mode = canLocal() ? 'local' : 'memory';
    }
  }
  if (Store.mode === 'local') { if (writeLocalAll()) { if (!dirty.size) setStatus('local'); return; } Store.mode = 'memory'; }
  setStatus('memory');
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', () => flush());

/* ================= boards ================= */
const curChat = () => (S.chats[S.boardId] = S.chats[S.boardId] || []);
// A part of the plan is a card labelled with its minutes ("5–15 min"). Retime the label and the
// window follows; the order is left to right, as the board reads.
const PHASE_TAG = /^\s*(\d{1,3})\s*[–—-]\s*(\d{1,3})\s*min\b/i;
function phaseCards(list) {
  return (list || els()).filter(e => e.type === 'card' && PHASE_TAG.test(e.tag || ''))
    .map(e => { const m = PHASE_TAG.exec(e.tag); return { e, from: +m[1], to: +m[2] }; })
    .filter(x => x.to > x.from).sort((a, b) => a.from - b.from || a.e.x - b.e.x);
}
function switchBoard(id) {
  if (!S.boards[id]) return;
  exitPen();
  flush();
  blurField();
  S.boardId = id; S.sel = null; S.multi = new Set(); S.selLink = null; S.editEl = null; S.undo = []; S.redo = []; S.focused = null;
  closePop(); closeMenu();
  renderAll(); updateChrome(); updateUndo(); renderChat(); updateCtx();
  const b = board();
  if (S.booted && b.meetingId) track('board_opened');
  if (b.reflow) requestAnimationFrame(() => { if (S.boardId !== b.id || !b.reflow) return; delete b.reflow; settle(true); scheduleSave(b.id); });
  // The timer runs for as long as the plan does.
  if (!T.running && !tElapsed()) { const parts = phaseCards(); if (parts.length > 1) { T.len = parts.at(-1).to; tRender(); } }
  // Brought up to date while you were elsewhere: say what changed, once.
  if (b.news) { toast(b.news); delete b.news; }
  if (b.settle) {
    const run = () => { if (S.boardId !== b.id || !b.settle) return; delete b.settle; settle(); if (b.autoFit && !S.viewTouched) fitAll(false); if (!b.example) scheduleSave(b.id); };
    requestAnimationFrame(run);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { b.settle = true; run(); });
  }
  // A board with no saved view is fitted to the screen, and refitted as it settles until the user moves it.
  S.viewTouched = false;
  // A saved view is where the user left it (or the last fit): it stays put.
  if (b.view) { setView(b.view, false); delete b.autoFit; } else { fitAll(false); b.autoFit = true; }
  setStatus(b.saved ? (Store.mode === 'db' ? 'saved' : Store.mode === 'local' ? 'local' : 'memory') : (b.example ? 'example' : ''));
}
function newBoard() {
  const b = { id: rid('b-'), title: 'Untitled meeting', example: false, saved: false, updatedAt: Date.now(), elements: [], links: [], view: null };
  S.boards[b.id] = b;
  switchBoard(b.id);
  scheduleSave(b.id);
  setTimeout(() => { if (!emptyEl.hidden && !emptyIn.hidden) emptyIn.focus(); }, 60);
}
async function boardFromSample(sampleId) {
  if (!Engine) { toast('Sample meetings aren’t available in this build'); return; }
  let cb = null, note = 'Drafted from the meeting. Move, edit or delete anything.';
  // In Claude, the model reads the meeting first; elsewhere the rules engine drafts it.
  const sample = AI.sample || (await AI.ready);
  if (sample && Engine.boardForSmart) {
    toast('Reading the meeting…');
    try {
      const r = await Engine.boardForSmart(sampleId, sample);
      if (r) {
        cb = r.board;
        note = r.mode === 'model' ? `Read as: ${r.brief.step}. Hover anything to see why it’s there.` : 'Claude couldn’t read this one, so the rules drafted it.';
      }
    } catch (_) { cb = null; }
  }
  if (!cb) cb = Engine.boardFor(sampleId);
  if (!cb) { toast('That meeting isn’t available'); return; }
  const cur = board();
  // An empty board the user just made is replaced rather than left behind.
  if (cur && !cur.example && !cur.elements.length) { delete S.boards[cur.id]; dirty.delete(cur.id); Store.remove(cur.id); }
  const b = fromEngine(cb, rid('b-'));
  S.boards[b.id] = b;
  switchBoard(b.id);
  scheduleSave(b.id);
  toast(note);
}
async function deleteBoard(id) {
  if (!S.boards[id]) return;
  delete S.boards[id]; dirty.delete(id);
  await Store.remove(id);
  const rest = Object.values(S.boards).sort((a, b) => b.updatedAt - a.updatedAt);
  if (rest.length) switchBoard(rest[0].id); else newBoard();
  toast('Board deleted');
}
function updateChrome() {
  const b = board();
  if (document.activeElement !== titleIn) titleIn.value = b.title;
  exChip.hidden = !b.example;
  gTitle.textContent = b.title;
  updateNotesBtn(); updateGoalBar();
}
function relTime(t) {
  if (!t) return 'Not saved yet';
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'Just now';
  if (d < 3600) return Math.floor(d / 60) + ' min ago';
  if (d < 86400) return Math.floor(d / 3600) + ' h ago';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function openMenu(mode) {
  menu.textContent = '';
  if (mode === 'delete') {
    const b = board();
    menu.append(h('div', { class: 'menu-confirm' },
      h('p', { text: `Delete “${b.title}”? This can’t be undone.` }),
      h('div', { class: 'row' },
        h('button', { class: 'btn solid-danger', type: 'button', onclick: () => { closeMenu(); deleteBoard(b.id); } }, 'Delete board'),
        h('button', { class: 'btn', type: 'button', onclick: () => openMenu() }, 'Cancel'))));
  } else if (mode === 'samples') {
    menu.append(h('div', { class: 'menu-label', text: 'Start from a meeting' }));
    for (const s of Engine ? Engine.samples() : []) {
      menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); boardFromSample(s.id); } },
        ic('calendar'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: s.name }), h('span', { class: 'mi-sub', text: s.sub }))));
    }
    menu.append(h('hr'), h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openMenu() }, ic('undo'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Back to your boards' }))));
  } else {
    menu.append(h('div', { class: 'menu-label', text: 'Your boards' }));
    Object.values(S.boards).sort((a, b) => b.updatedAt - a.updatedAt).forEach(b => {
      menu.append(h('button', { class: 'menu-item' + (b.id === S.boardId ? ' cur' : ''), type: 'button', role: 'menuitem', onclick: () => { closeMenu(); if (b.id !== S.boardId) switchBoard(b.id); } },
        ic(b.example ? 'spark' : 'card'),
        h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: b.title }), h('span', { class: 'mi-sub', text: (b.example ? 'Example · ' : '') + b.elements.length + ' items · ' + relTime(b.saved ? b.updatedAt : 0) }))));
    });
    menu.append(h('hr'));
    menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); newBoard(); } }, ic('plus'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'New blank board' }))));
    if (Engine && Engine.todayModel) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openToday() }, ic('calendar'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Today' }), h('span', { class: 'mi-sub', text: 'Your meetings and what’s ready' }))));
    if (DEMO.on) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openDemo() }, ic('spark'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Load the demo week…' }), h('span', { class: 'mi-sub', text: 'A founder’s week of meetings to explore' }))));
    if (Engine && Engine.granolaToDoc && granolaOffered()) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openGranolaImport() }, ic('note'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Import from Granola…' }), h('span', { class: 'mi-sub', text: 'Your past meeting notes, into memory' }))));
    if (Engine && Engine.readDocuments) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openSheet('prep') }, ic('note'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Prep from emails and notes…' }), h('span', { class: 'mi-sub', text: 'Paste the invite, emails, your notes' }))));
    const ahead = Mem.data && Engine && Engine.upcoming ? Engine.upcoming(Mem.data, new Date().toISOString()).filter(m => !Object.values(S.boards).some(b => b.meetingId === m.id)).slice(0, 5) : [];
    if (ahead.length) {
      menu.append(h('div', { class: 'menu-label', text: 'Coming up, from your memory' }));
      for (const m of ahead) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); boardFromMemory(m.id); } }, ic('calendar'),
        h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: m.title }), h('span', { class: 'mi-sub', text: new Date(m.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }))));
    }
    if (Engine) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openMenu('samples') }, ic('calendar'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'New board from a meeting…' }), h('span', { class: 'mi-sub', text: 'Sample meetings until your calendar is connected' }))));
    if (!S.boards['b-example']) menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); const ex = makeExample(); S.boards[ex.id] = ex; switchBoard(ex.id); } }, ic('spark'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Open the example board' }))));
    menu.append(h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => openMenu('delete') }, ic('trash'), h('span', { class: 'mi-main' }, h('span', { class: 'mi-title', text: 'Delete this board…' }))));
    // AGPL-3.0: whoever runs Cueboard for others offers them its source. Point this at your fork if you change it.
    menu.append(h('a', { class: 'menu-src', href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Source code · AGPL-3.0'));
  }
  menu.hidden = false; $('#b-menu').setAttribute('aria-expanded', 'true');
}
function closeMenu() { if (!menu.hidden) { menu.hidden = true; $('#b-menu').setAttribute('aria-expanded', 'false'); } }

/* ================= chart data editor ================= */
function openChartEditor(id) {
  const el = byId(id); if (!el || el.type !== 'chart') return;
  S.pop = id; pushUndo();
  pop.textContent = '';
  const redraw = () => { refreshChart(el); scheduleSave(); };
  const rows = h('div', { class: 'cd-rows' });
  const drawRows = () => {
    rows.textContent = '';
    el.data.forEach((d, i) => {
      const li = h('input', { id: 'cd-l-' + i, class: 'in', 'aria-label': 'Label ' + (i + 1), value: d.label, maxlength: 24, placeholder: 'Label' });
      const vi = h('input', { id: 'cd-v-' + i, class: 'in num', 'aria-label': 'Value ' + (i + 1), value: String(d.value), inputmode: 'decimal', placeholder: '0' });
      li.addEventListener('input', () => { d.label = li.value; redraw(); });
      vi.addEventListener('input', () => { const n = num(vi.value); vi.classList.toggle('bad', vi.value.trim() !== '' && !isFinite(n)); if (isFinite(n)) { d.value = n; redraw(); } });
      rows.append(h('div', { class: 'cd-row' }, li, vi, h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Remove row ' + (i + 1), onclick: () => { el.data.splice(i, 1); drawRows(); redraw(); } }, ic('close'))));
    });
  };
  drawRows();
  const segEl = h('div', { class: 'seg' });
  const segBtns = [['bar', 'Bar'], ['line', 'Line']].map(([k, l]) => h('button', { class: 'btn' + (el.kind === k ? ' on' : ''), type: 'button', onclick: () => { el.kind = k; segBtns.forEach(b => b.classList.toggle('on', b.textContent === l)); redraw(); updateSelTools(); } }, l));
  segEl.append(...segBtns);
  const pre = h('input', { id: 'cd-pre', class: 'in', value: el.prefix, maxlength: 4, placeholder: '$' });
  const suf = h('input', { id: 'cd-suf', class: 'in', value: el.suffix, maxlength: 6, placeholder: 'k, %' });
  pre.addEventListener('input', () => { el.prefix = pre.value; redraw(); });
  suf.addEventListener('input', () => { el.suffix = suf.value; redraw(); });
  pop.append(
    h('div', { class: 'pop-head' }, h('strong', { text: 'Chart data' }), h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Close', onclick: closePop }, ic('close'))),
    segEl,
    h('div', { class: 'cd-affix' }, h('label', { for: 'cd-pre' }, 'Before each value', pre), h('label', { for: 'cd-suf' }, 'After each value', suf)),
    h('div', { class: 'cd-cols' }, h('span', { text: 'Label' }), h('span', { text: 'Value' }), h('span')),
    rows,
    h('div', { class: 'cd-foot' },
      h('button', { class: 'btn', type: 'button', onclick: () => { if (el.data.length >= 24) return; el.data.push({ label: '', value: 0 }); drawRows(); redraw(); const l = rows.querySelector('.cd-row:last-child input'); if (l) l.focus(); } }, ic('plus'), 'Add row'),
      h('button', { class: 'btn primary', type: 'button', onclick: closePop }, 'Done'))
  );
  pop.hidden = false; positionPop();
}
function positionPop() {
  if (!S.pop || pop.hidden) return;
  if (narrow()) { pop.style.transform = ''; return; }
  const n = nodes.get(S.pop); if (!n) return;
  const r = n.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = r.right - sr.left + 16;
  if (x + pw > sr.width - 8) x = r.left - sr.left - pw - 16;
  x = clamp(x, 8, Math.max(8, sr.width - pw - 8));
  const y = clamp(r.top - sr.top, 70, Math.max(70, sr.height - ph - 8));
  pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
function closePop() {
  if (!S.pop) return;
  const el = byId(S.pop);
  S.pop = null; pop.hidden = true;
  if (el) { el.data = el.data.filter(d => isFinite(d.value)); refreshChart(el); }
  scheduleSave();
}

/* ================= empty state ================= */
function updateEmpty() {
  const b = board();
  const show = !!b && !S.glance && b.elements.length === 0 && links().length === 0 && !b.skipPrompt;
  emptyEl.hidden = !show;
  if (!show) return;
  const off = AI.off;
  emptyIn.hidden = off; emptyGo.hidden = off;
  emptyGo.disabled = AI.busy;
  $('#empty-sample').hidden = !Engine;
  $('#empty-paste').hidden = !(Engine && Engine.readDocuments);
  emptyP.textContent = off
    ? 'Start from a meeting and the board drafts itself, or add notes, cards and shapes from the toolbar and arrange them however you think.'
    : 'Who you’re meeting, what you want out of it, and anything you already know. Claude lays out a first draft you can move around.';
}

/* ================= glance ================= */
function textOf(e) {
  return [e.text, e.tag, e.title, e.name, e.label, e.value, e.note, e.caption, e.alt]
    .concat((e.items || []).map(i => i.text), (e.lines || []).map(l => l.text), (e.events || []).map(v => v.label), (e.data || []).map(d => d.label))
    .filter(Boolean).join(' ');
}
function labelOf(e) { return String(e.title || e.name || e.label || e.text || e.tag || '').split('\n')[0].trim(); }
function buildChips() {
  gChips.textContent = '';
  for (const e of readingOrder(els())) {
    if (e.type === 'text') continue;
    const l = labelOf(e); if (!l) continue;
    gChips.append(h('button', { class: 'gchip' + (S.focused === e.id ? ' on' : ''), type: 'button', 'data-id': e.id, onclick: () => focusEl(e.id) },
      h('span', { class: 'gdot', 'data-t': e.type, 'data-color': e.color || '' }), l.length > 30 ? l.slice(0, 29) + '…' : l));
  }
}
function applySearch() {
  const q = gQ.value.trim().toLowerCase(); let first = null;
  for (const e of readingOrder(els())) {
    const n = nodes.get(e.id); if (!n) continue;
    const hit = !q || textOf(e).toLowerCase().includes(q);
    n.classList.toggle('dim', !!q && !hit);
    if (q && hit && !first) first = e.id;
  }
  linkLayer.classList.toggle('dim', !!q);
  return first;
}
function focusEl(id) {
  const e = byId(id), n = nodes.get(id); if (!e || !n) return;
  S.focused = id;
  nodes.forEach(x => x.classList.remove('lit')); n.classList.add('lit');
  gChips.querySelectorAll('.gchip').forEach(c => c.classList.toggle('on', c.dataset.id === id));
  const b = boxOf(e);
  fitRect({ x: b.x - 16, y: b.y - 16, w: b.w + 32, h: b.h + 32 }, 2.4, true);
  const chip = gChips.querySelector(`[data-id="${id}"]`); if (chip && chip.scrollIntoView) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function unfocus() { S.focused = null; nodes.forEach(x => x.classList.remove('lit')); gChips.querySelectorAll('.gchip').forEach(c => c.classList.remove('on')); fitAll(true); }
let asWasOpen = false;
function enterGlance() {
  blurField();
  setSelection([]); closePop(); closeMenu();
  S.glance = true; app.classList.add('glance');
  asWasOpen = S.asOpen; if (S.asOpen) setAssistant(false, true);
  ['#topbar', '#dock', '#zoombar'].forEach(q => { $(q).hidden = true; });
  gbar.hidden = false; gnote.hidden = false; updateChrome();
  renderAll(); tRender();
  requestAnimationFrame(() => fitAll(true));
}
function exitGlance() {
  S.glance = false; S.focused = null; app.classList.remove('glance');
  gQ.value = '';
  ['#topbar', '#dock', '#zoombar'].forEach(q => { $(q).hidden = false; });
  gbar.hidden = true; gnote.hidden = true;
  renderAll();
  if (asWasOpen) setAssistant(true, true);
  requestAnimationFrame(() => fitAll(true));
}
const T = { running: false, start: 0, acc: 0, len: 45, iv: null };
const tElapsed = () => T.acc + (T.running ? Date.now() - T.start : 0);
function tToggle() {
  if (T.running) { T.acc += Date.now() - T.start; T.running = false; clearInterval(T.iv); }
  else { T.start = Date.now(); T.running = true; clearInterval(T.iv); T.iv = setInterval(tRender, 1000); }
  tRender();
}
function tRender() {
  const s = Math.floor(tElapsed() / 1000), over = s > T.len * 60;
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  $('#g-time-l').textContent = (T.running || s) ? `${mm}:${ss}` : 'Start';
  $('#g-time').classList.toggle('over', over);
  $('#g-time').setAttribute('aria-label', T.running ? 'Pause timer' : 'Start timer');
  $('#g-prog').style.width = Math.min(100, s / (T.len * 60) * 100) + '%';
  $('#g-prog').classList.toggle('over', over);
  $('#g-reset').hidden = T.running || !s;
  $('#g-len').textContent = `of ${T.len} min`;
  floatTimer();
}
function addLiveNote(text) {
  let card = els().find(e => e.type === 'card' && e.live);
  pushUndo();
  if (!card) {
    const r = rectOf(els());
    card = normalizeEl({ type: 'card', tag: 'Live notes', title: 'From the meeting', color: 'yellow', lines: [], w: 300, x: r ? r.x + r.w + 48 : 0, y: r ? r.y : 0 }, false);
    card.live = true;
    els().push(card);
  }
  const d = new Date(), stamp = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  card.lines.push({ text: stamp + '  ' + text });
  const n = rerender(card); n.classList.add('fresh');
  scheduleSave(); buildChips();
  toast('Added to “From the meeting”', { label: 'Show', fn: () => focusEl(card.id) });
}

/* ================= memory: reading what people paste ================= */
// What Cueboard knows across meetings lives in one memory, saved next to the boards. People paste
// what they have (the invite, emails, their notes, someone's profile); a model reads each one, the
// engine checks every item against the text, and nothing is saved until the person has looked.
const MEM_KEY = 'cueboard.memory.v1';
const Mem = { data: null, ready: null, llm: undefined };
const DOC_LABEL = { invite: 'Calendar invite', email: 'Email', notes: 'My notes', transcript: 'Call transcript', profile: 'Their profile', deck: 'Deck or doc', other: 'Something else' };
const DOC_HINT = {
  invite: 'Paste the invite: title, time, guests and description',
  email: 'Paste the email, with who it’s from and to',
  notes: 'Your notes: what was said, numbers you shared, who promised what',
  transcript: 'Paste the transcript or the notetaker’s summary',
  profile: 'Paste what you know about them: a bio, their LinkedIn About, a team page',
  deck: 'Paste the text of a deck or document',
  other: 'Paste anything else worth remembering, like your latest metrics',
};
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function loadMemory() {
  await Store.ready;
  let raw = null;
  if (Store.mode === 'db' && Store.col) { try { const d = await Store.col.doc('memory').get(); if (d.exists) raw = d.data(); } catch (_) { } }
  if (!raw) { try { const t = localStorage.getItem(MEM_KEY); if (t) raw = JSON.parse(t); } catch (_) { } }
  Mem.data = Engine && Engine.reviveMemory ? Engine.reviveMemory(raw, 'me') : null;
  if (S.boardId) updateGoalBar(); // the board on screen may be a meeting's, now that memory says so
  return Mem.data;
}
async function saveMemory() {
  queueToday(); queuePrep();
  if (Store.mode === 'db' && Store.col) { try { await Store.col.doc('memory').set(JSON.parse(JSON.stringify(Mem.data))); return true; } catch (_) { } }
  try { localStorage.setItem(MEM_KEY, JSON.stringify(Mem.data)); return true; }
  catch (_) { toast('Memory is full in this browser, so this wasn’t saved'); return false; }
}
// Claude inside a published artifact, or the model of the local server; null means rules only.
async function memoryModel() {
  if (Mem.llm !== undefined) return Mem.llm;
  const sample = AI.sample || (await AI.ready);
  if (sample) return (Mem.llm = sample.local ? Engine.localModel() : Engine.modelFor(sample));
  const st = await Engine.serverStatus();
  return (Mem.llm = st.available ? Engine.localModel() : null);
}

const sheet = h('div', { id: 'sheet', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-h' });
app.append(sheet);
sheet.addEventListener('keydown', e => { if (e.key === 'Escape' && !R.busy) { e.preventDefault(); closeSheet(); } });
sheet.addEventListener('pointerdown', e => { if (e.target === sheet && !R.busy) closeSheet(); });
let R = {};

// opts.meetingId: notes for that meeting. opts.text: what was pasted elsewhere (Today), read
// straight away when opts.go is set, since its pieces were already shown there.
async function openSheet(mode, opts) {
  if (!Engine || !Engine.readDocuments) { toast('Reading documents isn’t available in this build'); return; }
  opts = opts || {};
  exitPen(); closeMenu(); blurField();
  await (Mem.ready || (Mem.ready = loadMemory()));
  Mem.llm = undefined;
  const b = board();
  const mid = opts.meetingId || (mode === 'notes' && b && b.meetingId);
  const m = mid ? Mem.data.meetings.find(x => x.id === mid) : null;
  R = { mode, meeting: m, busy: false, text: opts.text || '', fix: {} };
  sheet.hidden = false;
  if (!Mem.data.user) { sheetYou(); return; }
  if (opts.go && R.text.trim()) {
    const llm = await memoryModel();
    if (llm) { R.docs = pieces(); sheetReading(llm); return; }
  }
  sheetPaste();
}

// What the pasted text splits into, with any kind or date the person changed by hand. After a
// call, undated notes are about that call.
const fixKey = c => c.text.slice(0, 80);
function pieces() {
  const day = today();
  return Engine.splitPaste(R.text, day).map(c => {
    const d = Object.assign({}, c, R.fix[fixKey(c)] || {});
    if (R.mode === 'notes' && R.meeting && d.date === day && (d.kind === 'notes' || d.kind === 'transcript') && !(R.fix[fixKey(c)] || {}).date) d.date = R.meeting.startsAt.slice(0, 10);
    return d;
  });
}
// Pasting onto something already there keeps the two apart, so one box takes several documents.
function pasteApart(ta, after) {
  ta.addEventListener('paste', e => {
    const txt = e.clipboardData && e.clipboardData.getData('text/plain');
    const before = ta.value.slice(0, ta.selectionStart), rest = ta.value.slice(ta.selectionEnd);
    if (!txt || !before.trim() || rest.trim()) return;
    e.preventDefault();
    ta.value = before.replace(/\s+$/, '') + Engine.PASTE_BREAK + txt.trim();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    after();
  });
}
function closeSheet() { sheet.hidden = true; sheet.textContent = ''; R = {}; }
const sheetOpen = () => !sheet.hidden;
function sheetFrame(title, sub, body, foot) {
  sheet.textContent = '';
  sheet.append(h('div', { class: 'sh-card' },
    h('header', { class: 'sh-head' },
      h('div', {}, h('h2', { id: 'sheet-h', text: title }), sub ? h('p', { class: 'sh-sub' }, sub) : null),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Close', onclick: () => { if (!R.busy) closeSheet(); } }, ic('close'))),
    h('div', { class: 'sh-body' }, body),
    foot ? h('footer', { class: 'sh-foot' }, foot) : null));
}

// Who the user is decides whose side everything is on, so it's asked once, up front.
function sheetYou() {
  const u = Mem.data.user || {};
  const f = (id, label, val, ph, type) => h('label', { class: 'sh-field', for: id }, h('span', { text: label }), h('input', { id, class: 'in', value: val || '', placeholder: ph, type: type || 'text', autocomplete: 'off' }));
  const goals = h('textarea', { id: 'you-goals', class: 'in sh-ta', rows: 3, placeholder: 'Raise a $3M seed by December\nSign 3 reseller partners in EMEA' });
  goals.value = (u.objectives || []).join('\n');
  const err = h('p', { class: 'sh-err', hidden: true });
  const save = () => {
    const val = id => $('#' + id, sheet).value.trim();
    if (!val('you-role') || !val('you-company')) { err.textContent = 'Add your role and company, so it knows whose side you’re on.'; err.hidden = false; return; }
    Mem.data.user = Object.assign({ role: val('you-role'), company: val('you-company') },
      val('you-name') ? { name: val('you-name') } : {}, val('you-email') ? { email: val('you-email') } : {},
      goals.value.trim() ? { objectives: goals.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6) } : {});
    saveMemory(); (R.afterYou || sheetPaste)();
  };
  sheetFrame('About you', 'Asked once. It decides whose numbers are whose and what a good outcome looks like for you.',
    h('div', { class: 'sh-grid' },
      f('you-name', 'Your name', u.name, 'Alex Rivera'), f('you-email', 'Your email', u.email, 'alex@company.example', 'email'),
      f('you-role', 'Your role', u.role, 'Founder & CEO'), f('you-company', 'Company', u.company, 'Cueboard'),
      h('label', { class: 'sh-field wide', for: 'you-goals' }, h('span', { text: 'What you’re working toward, one per line' }), goals), err),
    [h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Continue')]);
  setTimeout(() => { const i = $('#you-name', sheet); if (i) i.focus(); }, 30);
}

function sheetPaste(note) {
  const ta = h('textarea', { class: 'in sh-ta sh-one', rows: 11, 'aria-label': 'Everything about the meeting',
    placeholder: R.mode === 'notes' ? 'Paste your notes, the notetaker’s summary, or the follow-up email' : 'Paste the invite, the email thread, your notes. Paste each one in turn; they’re kept apart.' });
  ta.value = R.text;
  const found = h('div', { class: 'sh-found' });
  const draw = () => {
    const ps = R.text.trim() ? pieces() : [];
    found.textContent = '';
    if (!ps.length) return;
    found.append(h('div', { class: 'sh-found-h', text: ps.length === 1 ? 'Found one document' : `Found ${ps.length} documents` }),
      ...ps.map(c => {
        const kind = h('select', { class: 'in sh-kind', 'aria-label': `What this is: ${c.title}` }, Object.keys(DOC_LABEL).map(k => h('option', { value: k, selected: c.kind === k }, DOC_LABEL[k])));
        const date = h('input', { class: 'in sh-date', type: 'date', value: c.date, 'aria-label': `Date of ${c.title}` });
        kind.addEventListener('change', () => { R.fix[fixKey(c)] = Object.assign({}, R.fix[fixKey(c)], { kind: kind.value }); });
        date.addEventListener('change', () => { R.fix[fixKey(c)] = Object.assign({}, R.fix[fixKey(c)], { date: date.value || today() }); });
        return h('div', { class: 'sh-piece' }, kind, date, h('span', { class: 'sh-piece-t', text: c.title }));
      }));
  };
  let t = 0;
  ta.addEventListener('input', () => { R.text = ta.value; clearTimeout(t); t = setTimeout(draw, 200); });
  pasteApart(ta, () => { R.text = ta.value; draw(); });
  draw();
  const status = h('p', { class: 'sh-model' }, 'Checking for a model…');
  const err = h('p', { class: 'sh-err', hidden: !note, text: note || '' });
  memoryModel().then(llm => {
    status.textContent = llm ? '' : 'Reading needs a model. Run node scripts/serve.ts in a terminal where ANTHROPIC_API_KEY is set, or open the published version in Claude.';
    status.hidden = !!llm;
  });
  const go = async () => {
    const docs = R.text.trim() ? pieces() : [];
    if (!docs.length) { err.textContent = 'Paste something first.'; err.hidden = false; return; }
    const llm = await memoryModel();
    if (!llm) { err.textContent = 'There’s no model to read with yet (see above).'; err.hidden = false; return; }
    R.docs = docs;
    sheetReading(llm);
  };
  const u = Mem.data.user;
  sheetFrame(R.mode === 'notes' ? 'What happened?' : 'Prep from what you have',
    [R.mode === 'notes' && R.meeting ? `After “${R.meeting.title}”. ` : '', 'Everything is checked against your text, and nothing is saved until you’ve looked. ',
      h('button', { class: 'linkish', type: 'button', onclick: sheetYou }, `You: ${u.role} at ${u.company}`)],
    [ta, found, status, err],
    [h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: go }, ic('spark'), 'Read them')]);
  setTimeout(() => ta.focus(), 30);
}

async function sheetReading(llm) {
  R.busy = true;
  const line = h('p', { class: 'sh-progress' });
  sheetFrame('Reading…', 'Every item has to quote your text word for word, or it’s left out.', [line], null);
  const docs = R.docs.map(d => Object.assign({ id: d.id || rid('d'), kind: d.kind, text: d.text.trim(), date: d.date || today() },
    d.title && !/^(Invite|Email)\b/.test(d.title) ? { title: d.title } : {}, d.url ? { url: d.url } : {}));
  const read = await Engine.readDocuments(Mem.data, docs, llm, i => { line.textContent = `Reading ${i + 1} of ${docs.length}: ${DOC_LABEL[docs[i].kind].toLowerCase()}`; });
  R.busy = false;
  if (!read.some(r => r.proposal)) {
    const why = `Couldn’t read that: ${read[0] && read[0].error ? read[0].error : 'no answer came back'}. Try again in a moment.`;
    if (R.back) sheetFrame('Couldn’t read those', null, [h('p', { class: 'sh-err', text: why })], [h('button', { class: 'btn', type: 'button', onclick: R.back }, 'Back')]);
    else sheetPaste(why);
    return;
  }
  R.read = read;
  sheetReview();
}

// Everything found, each with the words it came from. People the user leaves unchecked take
// everything about them along; the meeting can be fixed up before the board is made.
function sheetReview() {
  const mem = Mem.data, read = R.read;
  const knownBefore = new Set(mem.people.map(p => p.id));
  const sessionPeople = new Map(); // id -> { name, email, company, isNew }
  const companyName = (r, ref) => { const c = r.proposal.companies.find(x => x.ref === ref); if (!c) return ''; const k = c.knownId && mem.companies.find(x => x.id === c.knownId); return k ? k.name : c.name; };
  const pid = (r, p) => p.knownId || r.personIds[p.ref];
  read.forEach(r => { if (!r.proposal) return; for (const p of r.proposal.people) {
    const id = pid(r, p); if (!id || sessionPeople.has(id)) continue;
    const k = mem.people.find(x => x.id === id);
    sessionPeople.set(id, { name: k ? k.name : p.name, email: p.email || (k && k.email) || '', company: companyName(r, p.companyRef) || '', isNew: !knownBefore.has(id) });
  } });
  const accepted = new Set([...sessionPeople.keys()]);
  const nameOf = (r, ref) => {
    if (ref === 'self') return 'Your side';
    const p = r.proposal.people.find(x => x.ref === ref);
    if (p) { const id = pid(r, p); return (sessionPeople.get(id) || p).name; }
    return companyName(r, ref) || ref;
  };
  const refIds = (r, refs) => refs.map(ref => { const p = r.proposal.people.find(x => x.ref === ref); return p ? pid(r, p) : null; }).filter(Boolean);

  const body = [];
  // People
  const newPeople = [...sessionPeople].filter(([, p]) => p.isNew), oldPeople = [...sessionPeople].filter(([, p]) => !p.isNew);
  if (sessionPeople.size) {
    const rows = newPeople.map(([id, p]) => {
      const cb = h('input', { type: 'checkbox', checked: true, 'data-person': id });
      cb.addEventListener('change', () => { if (cb.checked) accepted.add(id); else accepted.delete(id); syncPeople(); });
      return h('label', { class: 'rv-row rv-person' }, cb, h('span', { class: 'rv-main' }, h('b', { text: p.name }), h('span', { class: 'rv-meta', text: [p.company, p.email].filter(Boolean).join(' · ') || 'New' })));
    });
    body.push(h('section', { class: 'rv-sec' }, h('h3', { text: 'People' }),
      newPeople.length ? h('p', { class: 'rv-note', text: 'Confirm who these are. Anything about someone you uncheck isn’t saved.' }) : null, rows,
      oldPeople.length ? h('p', { class: 'rv-known' }, 'Already known: ', oldPeople.map(([, p]) => p.name).join(', ')) : null));
  }
  // Meeting
  let mf = null;
  if (R.mode === 'prep') {
    // The meeting being prepped: the next one ahead among the invites pasted, else the latest.
    const invites = read.filter(r => r.proposal && r.proposal.meeting).sort((a, b) => new Date(a.proposal.meeting.startsAt) - new Date(b.proposal.meeting.startsAt));
    const found = invites.find(r => new Date(r.proposal.meeting.startsAt) > Date.now()) || invites[invites.length - 1];
    R.fromDoc = found ? found.doc.id : undefined;
    const pm = found && found.proposal.meeting;
    const d = pm ? new Date(pm.startsAt) : new Date(Date.now() + 864e5);
    if (!pm) d.setHours(10, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const coming = new Set(pm ? refIds(found, pm.attendeeRefs) : [...sessionPeople.keys()]);
    mf = {
      title: h('input', { class: 'in', value: pm ? pm.title : '', placeholder: 'Call with Maya, Larkspur', 'aria-label': 'Meeting title' }),
      when: h('input', { class: 'in', type: 'datetime-local', value: local, 'aria-label': 'When' }),
      len: h('input', { class: 'in sh-len', type: 'number', min: 5, max: 600, step: 5, value: pm ? pm.durationMin : 30, 'aria-label': 'Minutes' }),
      who: [...sessionPeople].map(([id, p]) => { const cb = h('input', { type: 'checkbox', checked: coming.has(id), 'data-who': id }); return h('label', { class: 'rv-chip' }, cb, p.name); }),
      goal: h('input', { class: 'in', value: pm && pm.goal ? pm.goal : '', placeholder: 'Optional: what you want out of it', 'aria-label': 'Goal' }),
    };
    const form = h('div', { class: 'rv-form' },
      h('div', { class: 'rv-meeting' }, mf.title, h('div', { class: 'rv-when' }, mf.when, mf.len, h('span', { class: 'rv-meta', text: 'min' })), mf.goal),
      mf.who.length ? h('div', { class: 'rv-coming' }, h('span', { class: 'rv-meta', text: 'Who’s coming' }), mf.who) : null);
    // No invite in the paste: the meetings memory already has with these people come first.
    const ids = new Set(sessionPeople.keys());
    const ahead = pm ? [] : Engine.upcoming(Mem.data, new Date().toISOString()).filter(m => m.attendeeIds.some(id => ids.has(id))).slice(0, 4);
    R.target = ahead.length ? ahead[0].id : 'new';
    let choose = null;
    if (ahead.length) {
      const pick = v => { R.target = v; form.hidden = v !== 'new'; };
      const opt = (v, label, meta) => {
        const r = h('input', { type: 'radio', name: 'rv-target', value: v, checked: R.target === v });
        r.addEventListener('change', () => pick(v));
        return h('label', { class: 'rv-row rv-pick' }, r, h('span', { class: 'rv-main' }, h('span', { class: 'rv-text', text: label }), meta ? h('span', { class: 'rv-meta', text: meta }) : null));
      };
      const when = m => new Date(m.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      choose = h('div', { class: 'rv-picks' },
        ahead.map(m => opt(m.id, m.title, when(m))),
        opt('new', 'A different meeting…'), opt('none', 'No meeting: just remember it'));
      form.hidden = true;
    }
    body.push(h('section', { class: 'rv-sec' }, h('h3', { text: pm ? 'The meeting' : 'Which meeting is this for?' }), choose, form));
  }
  // What each document said
  read.forEach((r, i) => {
    if (!r.proposal) { body.push(h('section', { class: 'rv-sec' }, h('h3', { text: DOC_LABEL[r.doc.kind] }), h('p', { class: 'sh-err', text: `Couldn’t read this one: ${r.error}` }))); return; }
    const pr = r.proposal;
    const rows = pr.items.map(it => {
      const who = it.kind === 'fact' ? nameOf(r, it.about) : it.kind === 'number' ? (it.owner === 'self' ? 'Your number' : `${nameOf(r, it.owner)}’s number`)
        : it.kind === 'promise' ? (it.by === 'self' ? `Your promise${it.personRef ? ' to ' + nameOf(r, it.personRef) : ''}` : `${it.personRef ? nameOf(r, it.personRef) + '’s' : 'Their'} promise`)
        : it.kind === 'objection' ? `${it.raisedByRef ? nameOf(r, it.raisedByRef) + '’s' : 'Their'} concern` : it.kind === 'kept' ? 'Done' : it.kind === 'settled' ? 'No longer a concern' : 'What happened';
      const extra = it.kind === 'number' && it.sharedWith.length ? `You told ${it.sharedWith.map(ref => nameOf(r, ref)).join(', ')}` : it.kind === 'objection' && it.answer ? `Your answer: ${it.answer}` : it.kind === 'promise' && it.due ? `Due ${new Date(it.due + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
      const people = it.kind === 'fact' ? [it.about] : it.kind === 'number' ? [it.owner] : it.kind === 'promise' ? [it.personRef] : it.kind === 'objection' ? [it.raisedByRef] : [];
      const cb = h('input', { type: 'checkbox', checked: true, 'data-item': it.id });
      return h('label', { class: 'rv-row', 'data-people': refIds(r, people.filter(Boolean)).join(' ') }, cb,
        h('span', { class: 'rv-main' }, h('span', { class: 'rv-who', text: who }), h('span', { class: 'rv-text', text: it.text }), extra ? h('span', { class: 'rv-meta', text: extra }) : null,
          h('q', { class: 'rv-quote', text: it.quote })));
    });
    const made = pr.dropped.filter(d => d.why === 'not_in_document' || d.why === 'number_not_in_quote');
    const known = pr.dropped.filter(d => d.why === 'already_known').length;
    body.push(h('section', { class: 'rv-sec' },
      h('h3', {}, pr.summary, h('span', { class: 'rv-meta', text: ` · ${DOC_LABEL[r.doc.kind]}, ${new Date(r.doc.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` })),
      rows.length ? rows : h('p', { class: 'rv-note', text: pr.meeting ? 'Just the meeting details.' : 'Nothing new worth remembering in this one.' }),
      made.length ? h('details', { class: 'rv-dropped' }, h('summary', {}, `Left out ${made.length} ${made.length === 1 ? 'thing' : 'things'} your text doesn’t actually say`), h('ul', {}, made.map(d => h('li', { text: d.what.replace(/^./, c => c.toUpperCase()) })))) : null,
      known ? h('p', { class: 'rv-known', text: `${known} ${known === 1 ? 'thing was' : 'things were'} already in memory.` }) : null));
  });
  const syncPeople = () => sheet.querySelectorAll('.rv-row[data-people]').forEach(row => {
    const off = (row.dataset.people || '').split(' ').filter(Boolean).some(id => !accepted.has(id));
    row.classList.toggle('off', off);
  });
  const err = h('p', { class: 'sh-err', hidden: true });
  const save = async () => {
    const items = new Set([...sheet.querySelectorAll('[data-item]')].filter(c => c.checked).map(c => c.dataset.item));
    const choices = read.map(r => r.proposal ? { people: r.proposal.people.filter(p => accepted.has(pid(r, p))).map(p => p.ref), items: r.proposal.items.map(x => x.id).filter(id => items.has(id)) } : { people: [], items: [] });
    let meeting = null;
    const target = mf && R.target && R.target !== 'new' ? R.target : null;
    if (mf && !target) {
      const t = mf.title.value.trim(), when = new Date(mf.when.value);
      if (!t || isNaN(when)) { err.textContent = 'Give the meeting a title and a time, so the board knows when it is.'; err.hidden = false; return; }
      meeting = Object.assign({ title: t, startsAt: when.toISOString(), durationMin: clamp(Math.round(+mf.len.value || 30), 5, 600),
        attendeeIds: mf.who.map(l => l.querySelector('input')).filter(c => c.checked && accepted.has(c.dataset.who)).map(c => c.dataset.who) },
        mf.goal.value.trim() ? { goal: mf.goal.value.trim() } : {});
    }
    const s = Engine.saveDocuments(Mem.data, read, choices, meeting, R.fromDoc);
    Mem.data = s.memory;
    await saveMemory();
    track('memory_saved', { kind: R.mode, n: s.added });
    closeSheet();
    if (s.meetingId) boardFromMemory(s.meetingId, s.added);
    else if (target && target !== 'none') boardFromMemory(target, s.added);
    else {
      const names = [...accepted].map(id => (sessionPeople.get(id) || {}).name).filter(Boolean).slice(0, 2);
      toast(s.added ? `Saved ${s.added} ${s.added === 1 ? 'thing' : 'things'} to memory${names.length ? `. They’ll be on your next board with ${names.join(' and ')}` : ''}.` : 'Nothing new was saved.');
    }
  };
  const total = read.reduce((n, r) => n + (r.proposal ? r.proposal.items.length : 0), 0);
  sheetFrame('Check what it found', `${total} ${total === 1 ? 'thing' : 'things'} from ${read.length} ${read.length === 1 ? 'document' : 'documents'}. Uncheck anything that’s wrong; the quote under each is where it came from.`,
    [...body, err],
    [h('button', { class: 'btn', type: 'button', onclick: () => (R.back ? R.back() : sheetPaste()) }, 'Back'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, R.mode === 'prep' ? 'Save and make the board' : 'Save to memory')]);
}

// opts.open false: make it and keep it for later (Today shows it as ready). opts.auto: drafted
// without anyone asking. A meeting that already has a drafted board gets that board brought up
// to date instead of a second one.
async function boardFromMemory(meetingId, added, opts) {
  opts = opts || {};
  const open = opts.open !== false;
  await (Mem.ready || (Mem.ready = loadMemory()));
  const llm = await memoryModel();
  // Before the board: look up who's coming, if they haven't been lately.
  if (llm && llm.research && researchOn() && Engine.researchMeeting && Engine.researchPlan && Engine.researchPlan(Mem.data, meetingId, new Date().toISOString())) {
    if (open) toast('Looking up who you’re meeting…');
    try {
      const rr = await Engine.researchMeeting(Mem.data, meetingId, new Date().toISOString(), llm);
      if (rr) { Mem.data = rr.memory; await saveMemory(); if (rr.added) track('researched', { n: rr.added }); }
    } catch (_) { }
  }
  if (llm && open) toast('Reading the meeting…');
  const inputs = Engine.meetingInputs ? Engine.meetingInputs(Mem.data, meetingId, Date.now()) : '';
  let r = null;
  try { r = await Engine.boardForMemory(Mem.data, meetingId, new Date().toISOString(), llm); } catch (_) { r = null; }
  if (!r) { if (!opts.auto) toast('That meeting isn’t in memory'); return null; }
  const prior = boardFor(meetingId);
  if (prior && prior.gen && Engine.mergeRefresh) {
    const res = refreshBoard(prior, r, inputs, !!opts.auto);
    track('board_refreshed', { kind: opts.auto ? 'auto' : 'asked', n: res.updated + res.added + res.removed });
    if (!open) return prior.id;
    closeToday();
    if (S.boardId !== prior.id) switchBoard(prior.id);
    updateGoalBar();
    toast((added ? `Saved ${added} things to memory. ` : '') + (opts.goal ? refreshNote(res).replace(/^Brought up to date: /, 'Shaped around your goal: ').replace('The board was already up to date.', 'The board already fits that goal.') : refreshNote(res)));
    return prior.id;
  }
  const b = fromEngine(r.board, rid('b-'), { meetingId });
  b.gen = genOf(b, r, inputs, !!opts.auto);
  S.boards[b.id] = b;
  scheduleSave(b.id);
  track(opts.auto ? 'board_drafted' : 'board_made', { kind: r.mode === 'model' ? 'model' : 'rules' });
  if (!open) return b.id;
  const cur = board();
  if (cur && cur.id !== b.id && !cur.example && !cur.elements.length) { delete S.boards[cur.id]; dirty.delete(cur.id); Store.remove(cur.id); }
  closeToday();
  switchBoard(b.id);
  const saved = added ? `Saved ${added} things to memory. ` : '';
  toast(saved + (r.mode === 'model' ? `Read as: ${r.brief.step}. Hover anything to see why it’s there.`
    : r.stage === 'followup' ? 'What you know from last time is marked in green.' : 'Drafted from what you pasted. Move, edit or delete anything.'));
  return b.id;
}
function updateNotesBtn() { const b = board(), btn = $('#b-notes'); if (btn) btn.hidden = !(b && b.meetingId); }

// Goals offered before the user set theirs stay on offer afterwards, so they can change their mind.
const genOf = (b, r, inputs, auto, was) => ({
  inputs: inputs || '', at: Date.now(), mode: r.mode === 'model' ? 'model' : 'rules', title: b.title, auto,
  goals: r.goals && r.goals.length ? r.goals : (was && was.goals) || [], goalHint: r.goalHint || (was && was.goalHint) || '',
  els: JSON.parse(JSON.stringify(b.elements)),
});

// New content for the cards still as drafted; everything the user touched stays theirs.
function refreshBoard(b, r, inputs, auto) {
  const next = fromEngine(r.board, b.id, {});
  const res = Engine.mergeRefresh(b.elements, b.gen.els, next.elements);
  const here = S.boardId === b.id;
  if (here) { blurField(); pushUndo(); }
  b.elements = res.elements;
  const ids = new Set(b.elements.map(e => e.id));
  b.links = (b.links || []).filter(l => (!l.from.id || ids.has(l.from.id)) && (!l.to.id || ids.has(l.to.id)));
  if (b.title === b.gen.title) b.title = next.title;
  b.gen = genOf(next, r, inputs, auto || b.gen.auto, b.gen);
  b.updatedAt = Date.now();
  if (res.updated || res.added) b.reflow = true;
  if (!here && (res.updated || res.added || res.removed)) b.news = `Updated ${hm(new Date())} with what’s new. ` + refreshNote(res).replace(/^Brought up to date: /, '');
  scheduleSave(b.id);
  if (here) {
    renderAll(); updateChrome();
    if (b.reflow) requestAnimationFrame(() => { if (S.boardId !== b.id || !b.reflow) return; delete b.reflow; settle(true); scheduleSave(b.id); });
  }
  return res;
}
function refreshNote(res) {
  const n = (k, one, many) => (k ? `${k} ${k === 1 ? one : many}` : '');
  const parts = [n(res.updated, 'card updated', 'cards updated'), n(res.added, 'new card', 'new cards'), n(res.removed, 'card no longer relevant', 'cards no longer relevant')].filter(Boolean);
  if (!parts.length) return 'The board was already up to date.';
  return `Brought up to date: ${parts.join(', ')}.${res.kept ? ' Your edits are kept.' : ''}`;
}

/* ================= the goal ================= */
// Every meeting is for something different, and one line from the person says it better than
// any guess. A board drafts itself with the best reading of the goal; this bar asks for theirs
// (the readings are one tap), and the board is redrawn around it, keeping their edits.
const meetingById = id => (Mem.data ? Mem.data.meetings.find(m => m.id === id) : null);
async function setMeetingGoal(meetingId, text, open) {
  await (Mem.ready || (Mem.ready = loadMemory()));
  const m = meetingById(meetingId); if (!m || GOAL.busy.has(meetingId)) return;
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  if ((m.goal || '') === t) { GOAL.edit = null; updateGoalBar(); return; }
  if (t) m.goal = t; else delete m.goal;
  GOAL.busy.add(meetingId); AP.hold.add(meetingId); TD.busy.add(meetingId);
  GOAL.edit = null; GOAL.draft = '';
  updateGoalBar(); queueToday();
  try {
    await saveMemory();
    track('goal_set', { kind: t ? 'set' : 'cleared' });
    const bid = await boardFromMemory(meetingId, 0, { open: open !== false, goal: true });
    if (bid && open === false) toast(t ? 'Board shaped around your goal' : 'Board redrawn', { label: 'Open', fn: () => openFromToday(meetingId) });
  } finally {
    GOAL.busy.delete(meetingId); AP.hold.delete(meetingId); TD.busy.delete(meetingId);
    updateGoalBar(); queueToday();
  }
}
function updateGoalBar() {
  if (!GOAL.el) { GOAL.el = h('div', { id: 'goalbar', hidden: true }); stage.append(GOAL.el); }
  const was = GOAL.el.hidden ? 0 : GOAL.el.offsetHeight;
  drawGoalBar();
  // A board still fitted to the screen stays clear of the bar as it grows or shrinks.
  const b = board();
  if (b && b.autoFit && !S.viewTouched && (GOAL.el.hidden ? 0 : GOAL.el.offsetHeight) !== was && els().length) fitAll(false);
}
function drawGoalBar() {
  const bar = GOAL.el, b = board();
  const m = b && b.meetingId ? meetingById(b.meetingId) : null;
  if (!m || b.goalSkip) { bar.hidden = true; bar.textContent = ''; return; }
  // Typing in it: leave it alone, whatever else just changed.
  if (!bar.hidden && bar.dataset.for === m.id && bar.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  bar.hidden = false; bar.dataset.for = m.id;
  const busy = GOAL.busy.has(m.id);
  if (busy) { bar.replaceChildren(h('div', { class: 'gb-row' }, ic('spark'), h('span', { class: 'gb-k', text: 'Shaping the board around your goal…' }))); return; }
  if (m.goal && GOAL.edit !== m.id) {
    bar.replaceChildren(h('div', { class: 'gb-row' }, h('span', { class: 'gb-k', text: 'Goal' }), h('span', { class: 'gb-goal', text: m.goal, title: m.goal }),
      h('button', { class: 'btn', type: 'button', onclick: () => { GOAL.edit = m.id; GOAL.draft = m.goal; updateGoalBar(); const i = $('input', bar); if (i) { i.focus(); i.select(); } } }, 'Change')));
    return;
  }
  const gen = b.gen || {};
  const input = h('input', { class: 'in', value: GOAL.edit === m.id ? GOAL.draft : '', maxlength: 280, autocomplete: 'off', 'aria-label': 'The goal of this meeting',
    placeholder: gen.goalHint ? 'In a line: ' + gen.goalHint : 'In a line: what do you want out of it?' });
  input.addEventListener('input', () => { GOAL.draft = input.value; });
  const go = () => { if (input.value.trim() || m.goal) { input.blur(); setMeetingGoal(m.id, input.value, true); } else input.focus(); };
  const form = h('form', { class: 'gb-row', onsubmit: ev => { ev.preventDefault(); go(); } },
    h('label', { class: 'gb-k', text: 'What’s this meeting for?' }), input,
    h('button', { class: 'btn primary', type: 'submit' }, ic('spark'), 'Shape the board'),
    h('button', { class: 'btn icon-only', type: 'button', title: m.goal ? 'Keep the goal as it is' : 'Not now', 'aria-label': 'Close', onclick: () => { if (m.goal) GOAL.edit = null; else b.goalSkip = true; updateGoalBar(); } }, ic('close')));
  input.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); input.blur(); if (m.goal) { GOAL.edit = null; updateGoalBar(); } } });
  const picks = (gen.goals || []).filter(t => t !== m.goal);
  bar.replaceChildren(form, picks.length ? h('div', { class: 'gb-picks' }, h('span', { class: 'gb-k', text: 'Or one of these' }),
    picks.map(t => h('button', { class: 'gb-pick', type: 'button', title: 'Use this as the goal', onclick: () => setMeetingGoal(m.id, t, true) }, t))) : null);
}

/* ================= Granola import ================= */
// Notes people already have in Granola come into memory the same way a paste does: each note is
// read, every item checked against it, and nothing is saved until the person has looked. The
// local server holds the Granola key; without that server (a published artifact) this is hidden.
const GR = { status: null };
const grHeaders = { headers: { 'x-cueboard': '1' } };
const granolaOffered = () => !!(GR.status && GR.status.server && !GR.status.hosted);
async function granolaStatus() {
  if (GR.status) return GR.status;
  try {
    const r = await fetch('/api/granola', grHeaders);
    GR.status = r.ok ? Object.assign({ server: true }, await r.json()) : { server: false, available: false };
  } catch (_) { GR.status = { server: false, available: false }; }
  queueToday();
  return GR.status;
}
// The hosted test counts what people do (never what's in it), to see whether they come back.
// Only Cueboard's own server listens; a local one ignores it.
function track(ev, extra) {
  if (!GR.status || !GR.status.server) return;
  try { fetch('/api/event', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cueboard': '1' }, body: JSON.stringify(Object.assign({ ev }, extra)), keepalive: true }).catch(() => { }); } catch (_) { }
}
const isoDay = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function openGranolaImport() {
  if (!Engine || !Engine.granolaToDoc) return;
  closeMenu(); blurField(); exitPen();
  await (Mem.ready || (Mem.ready = loadMemory()));
  Mem.llm = undefined;
  R = { mode: 'import', busy: false, back: granolaPick };
  sheet.hidden = false;
  // Setup first if there's no key: no point asking about you before Granola can answer.
  if (!Mem.data.user && (await granolaStatus()).available) { R.afterYou = granolaPick; sheetYou(); return; }
  granolaPick();
}

async function granolaPick() {
  const st = await granolaStatus();
  if (!st.available) {
    sheetFrame('Bring in your Granola notes', 'Cueboard reads your notes through Granola’s API, with a key that stays in your terminal.',
      [h('ol', { class: 'gr-setup' },
        h('li', {}, 'In Granola, open Settings → Connectors → API keys and create a key. It needs a Business plan.'),
        h('li', {}, 'Stop Cueboard in your terminal and start it again with the key set:', h('code', { text: 'GRANOLA_API_KEY=grn_… node scripts/serve.ts' })),
        h('li', {}, 'Reload this page and choose Import from Granola again.'))],
      [h('button', { class: 'btn primary', type: 'button', onclick: closeSheet }, 'Close')]);
    return;
  }
  R.busy = true;
  sheetFrame('Bring in your Granola notes', null, [h('p', { class: 'sh-progress', text: 'Loading your notes from Granola…' })], null);
  const notes = [];
  let cursor = null, error = null;
  try {
    for (let page = 0; page < 4; page++) {
      const r = await fetch(`/api/granola/notes?after=${isoDay(Date.now() - 60 * 864e5)}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, grHeaders);
      const b = await r.json().catch(() => null);
      if (!r.ok || !b) { error = (b && b.error && b.error.message) || 'Granola didn’t answer.'; break; }
      notes.push(...b.notes);
      if (!b.hasMore || !b.cursor) break;
      cursor = b.cursor;
    }
  } catch (_) { error = 'Couldn’t reach Cueboard’s server.'; }
  R.busy = false;
  if (error && !notes.length) { sheetFrame('Bring in your Granola notes', null, [h('p', { class: 'sh-err', text: error })], [h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Close')]); return; }
  notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const have = new Set(Mem.data.docs.map(d => d.id));
  const recent = Date.now() - 30 * 864e5;
  // Ticked to start with: recent notes that mention someone or some company memory knows, so an
  // internal stand-up isn't read by default. With nothing in memory yet, every recent one.
  const words = new Set([...Mem.data.people.map(p => p.name.split(/\s+/)[0]), ...Mem.data.companies.map(c => c.name.split(/\s+/)[0])]
    .map(w => w.toLowerCase()).filter(w => w.length >= 3));
  const mentionsKnown = t => !words.size || (t || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).some(w => words.has(w));
  let picked = 0;
  const count = h('span');
  const rows = notes.map(n => {
    const inMemory = have.has('granola-' + n.id);
    const on = !inMemory && new Date(n.created_at).getTime() > recent && mentionsKnown(n.title) && picked < 8;
    if (on) picked++;
    const cb = h('input', { type: 'checkbox', checked: on, 'data-note': n.id });
    cb.addEventListener('change', updateCount);
    return h('label', { class: 'rv-row' }, cb, h('span', { class: 'rv-main' },
      h('span', { class: 'rv-text', text: n.title || 'Untitled meeting' }),
      h('span', { class: 'rv-meta', text: new Date(n.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + (inMemory ? ' · already in memory' : '') })));
  });
  const readBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => readGranola([...sheet.querySelectorAll('[data-note]')].filter(c => c.checked).map(c => c.dataset.note)) }, ic('spark'), count);
  function updateCount() { const n = sheet.querySelectorAll('[data-note]:checked').length; count.textContent = n === 1 ? 'Read 1 note' : `Read ${n} notes`; readBtn.disabled = !n; }
  sheetFrame('Bring in your Granola notes',
    'Pick the meetings worth remembering, usually the ones with people outside your company. The ones ticked mention people you already know. Each is read by the model, 10–20 seconds a note, and nothing is saved until you’ve checked it.',
    notes.length ? [error ? h('p', { class: 'sh-err', text: error }) : null, h('div', { class: 'gr-list' }, rows)] : [h('p', { class: 'rv-note', text: 'No Granola notes from the last 60 days.' })],
    [h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Cancel'), readBtn]);
  updateCount();
}

async function readGranola(ids) {
  if (!ids.length) return;
  const llm = await memoryModel();
  if (!llm) { sheetFrame('Bring in your Granola notes', null, [h('p', { class: 'sh-err', text: 'Reading needs a model. Start Cueboard with ANTHROPIC_API_KEY set as well.' })], [h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Close')]); return; }
  R.busy = true;
  const line = h('p', { class: 'sh-progress' });
  sheetFrame('Fetching from Granola…', null, [line], null);
  const docs = [], failed = [];
  for (const [i, id] of ids.entries()) {
    line.textContent = `Fetching ${i + 1} of ${ids.length}`;
    try {
      const r = await fetch('/api/granola/notes/' + id, grHeaders);
      const note = await r.json().catch(() => null);
      if (!r.ok || !note) { failed.push((note && note.error && note.error.message) || id); continue; }
      // Your own Granola account says who "me" is, if About you didn't.
      if (note.owner && Mem.data.user && !Mem.data.user.email) { Mem.data.user.email = note.owner.email; if (!Mem.data.user.name && note.owner.name) Mem.data.user.name = note.owner.name; }
      docs.push(Engine.granolaToDoc(note));
    } catch (_) { failed.push(id); }
  }
  R.busy = false;
  if (!docs.length) { sheetFrame('Bring in your Granola notes', null, [h('p', { class: 'sh-err', text: `Couldn’t fetch those notes: ${failed.join('; ')}` })], [h('button', { class: 'btn', type: 'button', onclick: granolaPick }, 'Back')]); return; }
  if (failed.length) toast(`${failed.length} ${failed.length === 1 ? 'note' : 'notes'} couldn’t be fetched and were skipped.`);
  R.docs = docs;
  sheetReading(llm);
}

/* ================= calendar ================= */
// Meetings arrive from Google Calendar by themselves: read when Cueboard opens, every ten minutes
// while it's open, and when you come back to the tab. Every meeting today and tomorrow then gets
// its board drafted without anyone asking, and a board whose meeting or memory changed is brought
// up to date. The server holds no one's calendar: the grant lives in this browser's cookie.
const CAL = { status: null, busy: false, last: 0, error: null, email: null, draft: '' };
async function calendarStatus() {
  try { const r = await fetch('/api/calendar', grHeaders); CAL.status = r.ok ? await r.json() : null; } catch (_) { CAL.status = null; }
  queueToday();
  return CAL.status;
}
async function syncCalendar(force) {
  if (CAL.busy || !CAL.status || !CAL.status.connected || !Engine || !Engine.syncCalendar) return;
  if (!force && Date.now() - CAL.last < 4 * 60000) return;
  CAL.busy = true; queueToday();
  try {
    const r = await fetch('/api/calendar/events', grHeaders);
    const b = await r.json().catch(() => null);
    if (!r.ok || !b || !Array.isArray(b.events)) {
      const e = b && b.error;
      if (r.status === 401) CAL.status.connected = false;
      CAL.error = (e && e.message) || 'Couldn’t reach your calendar.';
      return;
    }
    await (Mem.ready || (Mem.ready = loadMemory()));
    if (!Mem.data) return;
    const s = Engine.syncCalendar(Mem.data, b.events, { now: new Date().toISOString(), from: b.from, to: b.to, selfEmail: b.email });
    if (b.email) CAL.email = b.email;
    if (JSON.stringify(s.memory) !== JSON.stringify(Mem.data)) { Mem.data = s.memory; await saveMemory(); }
    CAL.last = Date.now(); CAL.error = null;
  } catch (_) { CAL.error = 'Couldn’t reach your calendar.'; }
  finally { CAL.busy = false; queueToday(); queuePrep(); }
}
async function disconnectCalendar() {
  try { await fetch('/api/calendar/disconnect', { method: 'POST', headers: { 'x-cueboard': '1' } }); } catch (_) { }
  if (CAL.status) CAL.status.connected = false;
  CAL.email = null; CAL.last = 0;
  toast('Calendar disconnected. Meetings already read stay in memory.');
  queueToday();
}
async function calendarBoot() {
  // Back from Google's sign-in: the answer is in the address, which is tidied straight away.
  const q = new URLSearchParams(location.search), said = q.get('calendar');
  if (said) { q.delete('calendar'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  const st = await calendarStatus();
  if (said === 'connected' && st && st.connected) {
    track('calendar_connected');
    await (Mem.ready || (Mem.ready = loadMemory()));
    openToday();
    toast('Calendar connected. Drafting boards for today and tomorrow…');
  } else if (said === 'denied') toast('Google didn’t give Cueboard your calendar. Connect again and leave the calendar box ticked.');
  else if (said === 'failed') toast('Connecting your calendar didn’t work. Try again in a moment.');
  if (st && st.connected) await syncCalendar(true);
  else queuePrep();
  setInterval(() => syncCalendar(false), 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { syncCalendar(false); queuePrep(); } });
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
function calendarCard() {
  const st = CAL.status;
  if (!st) return null;
  const pitch = 'Connect your calendar and every meeting with someone from outside your company gets its board drafted before you ask. Cueboard only reads it.';
  if (!st.connected) {
    // Any calendar app can share a private link; signing in with Google is the other way in, where
    // this server has a Google client set up.
    const link = h('input', { class: 'in', type: 'url', 'data-keep': 'cal-link', value: CAL.draft, placeholder: 'Paste your calendar’s private link', 'aria-label': 'Your calendar’s private link', autocomplete: 'off', spellcheck: 'false' });
    link.addEventListener('input', () => { CAL.draft = link.value; });
    const form = h('form', { class: 'td-cal-link', onsubmit: ev => { ev.preventDefault(); connectLink(link.value); } },
      link, h('button', { class: 'btn primary', type: 'submit', disabled: CAL.busy }, CAL.busy ? 'Reading…' : 'Connect'));
    const where = h('details', { class: 'td-setup' }, h('summary', { text: 'Where to find the link' }),
      h('ol', { class: 'gr-setup' },
        h('li', {}, h('b', { text: 'Google Calendar: ' }), 'Settings, then your calendar under “Settings for my calendars”, then Integrate calendar: copy “Secret address in iCal format”.'),
        h('li', {}, h('b', { text: 'Outlook: ' }), 'Settings, Calendar, Shared calendars, then Publish a calendar with “Can view all details”: copy the ICS link.'),
        h('li', {}, h('b', { text: 'Apple Calendar: ' }), 'share the calendar as a Public Calendar and copy its link.')),
      h('p', { class: 'td-muted', text: 'Anyone with the link can read your calendar, so Cueboard keeps it sealed in this browser and never logs it. You can reset it in your calendar’s settings at any time.' }));
    const google = st.configured ? h('button', { class: 'btn', type: 'button', onclick: () => location.assign('/oauth/google/start') }, ic('calendar'), 'Or sign in with Google') : null;
    const setup = !st.configured && !st.hosted ? h('details', { class: 'td-setup' }, h('summary', { text: 'Or sign in with Google (set up on this machine)' }),
      h('ol', { class: 'gr-setup' },
        h('li', {}, 'In Google Cloud, create an OAuth client (type: Web application) with this redirect address:', h('code', { text: `${location.origin}/oauth/google/callback` })),
        h('li', {}, 'Turn on the Google Calendar API, and add your Google account as a test user.'),
        h('li', {}, 'Start Cueboard again with the client’s ID and secret set:', h('code', { text: 'GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… node scripts/serve.ts' })))) : null;
    return h('div', { class: 'td-owed td-cal' }, h('h2', { text: 'Your meetings, by themselves' }),
      h('p', { class: 'td-muted' + (CAL.error ? ' td-bad' : ''), text: CAL.error || pitch }), form, where, google, setup);
  }
  const line = CAL.busy ? 'Reading your calendar…' : CAL.error ? CAL.error : CAL.last ? `Synced ${ago(CAL.last)}` : 'Connected';
  return h('div', { class: 'td-owed td-cal' }, h('h2', { text: st.via === 'link' ? 'Your calendar' : st.via === 'sample' ? 'Sample calendar' : 'Google Calendar' }),
    h('p', { class: 'td-muted' }, CAL.email ? h('span', { class: 'td-cal-who', text: CAL.email }) : null, line),
    h('div', { class: 'td-cal-act' },
      h('button', { class: 'btn', type: 'button', disabled: CAL.busy, onclick: () => syncCalendar(true) }, 'Sync now'),
      h('button', { class: 'btn', type: 'button', onclick: disconnectCalendar }, 'Disconnect')));
}
// Looking people up on the web is on unless switched off here; it's this browser's choice.
const researchOn = () => { try { return localStorage.getItem('cueboard.research') !== 'off'; } catch (_) { return true; } };
function researchCard() {
  if (!Engine || !Engine.researchMeeting || !(GR.status && GR.status.server)) return null;
  const on = researchOn();
  const box = h('input', { type: 'checkbox', id: 'td-research', checked: on });
  box.addEventListener('change', () => { try { localStorage.setItem('cueboard.research', box.checked ? 'on' : 'off'); } catch (_) { } renderToday(); if (box.checked) queuePrep(); });
  return h('div', { class: 'td-owed td-research' }, h('h2', { text: 'Who you’re meeting' }),
    h('label', { class: 'td-check', for: 'td-research' }, box, h('span', { text: 'Look them up on the web before each meeting' })),
    h('p', { class: 'td-muted', text: on
      ? 'Their role, background and company news, once a month per person. Only what a page says, with the page linked. Their names and companies are sent to Claude’s web search.'
      : 'Off. Boards use only what you’ve pasted, imported or have in your calendar.' }));
}
async function connectLink(url) {
  if (!url.trim() || CAL.busy) return;
  CAL.busy = true; CAL.error = null; queueToday();
  try {
    const r = await fetch('/api/calendar/link', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cueboard': '1' }, body: JSON.stringify({ url }) });
    const b = await r.json().catch(() => null);
    if (!r.ok || !b || !b.ok) { CAL.error = (b && b.error && b.error.message) || 'Couldn’t read that calendar.'; return; }
    CAL.draft = ''; CAL.status = Object.assign({}, CAL.status, { connected: true, via: 'link' });
    if (b.email) CAL.email = b.email;
    track('calendar_connected', { kind: 'link' });
    toast('Calendar connected. Drafting boards for today and tomorrow…');
  } catch (_) { CAL.error = 'Couldn’t reach Cueboard’s server.'; }
  finally { CAL.busy = false; queueToday(); }
  if (CAL.status && CAL.status.connected) await syncCalendar(true);
}

// An invite file, dropped or pasted: its meetings go into memory the way the calendar's do. An
// invite only adds; it never takes other meetings away.
async function importInvites(text) {
  await (Mem.ready || (Mem.ready = loadMemory()));
  if (!Mem.data) return;
  const self = (Mem.data.user && Mem.data.user.email) || CAL.email;
  if (!self) {
    // Without knowing which guest is you, you'd end up as a guest at your own meeting.
    R = { mode: 'prep', afterYou: () => { closeSheet(); importInvites(text); } };
    sheet.hidden = false; sheetYou();
    toast('Add your email first, so Cueboard can tell you from the guests.');
    return;
  }
  let cal;
  const now = Date.now(), at = new Date(now).toISOString();
  try { cal = Engine.parseIcs(text, { from: new Date(now - 864e5).toISOString(), to: new Date(now + 366 * 864e5).toISOString() }); }
  catch (e) { toast((e && e.message) || 'That isn’t a calendar file.'); return; }
  if (!cal.events.length) { toast('There’s no meeting ahead in that invite.'); return; }
  const s = Engine.syncCalendar(Mem.data, cal.events, { now: at, from: at, to: at, selfEmail: self });
  const fresh = [...s.added, ...s.changed];
  if (!fresh.length) { toast('Nothing new: it’s already in your meetings, or it’s only with people from your company.'); return; }
  Mem.data = s.memory; await saveMemory();
  const titles = fresh.map(id => (Mem.data.meetings.find(m => m.id === id) || {}).title).filter(Boolean);
  toast(`Added ${titles.slice(0, 2).join(' and ')}${titles.length > 2 ? ` and ${titles.length - 2} more` : ''}. Drafting the board…`);
  for (const id of s.added) makeFromToday(id);
}
const isInvite = t => /BEGIN:VCALENDAR/i.test(t) && /BEGIN:VEVENT/i.test(t);

// Drafting without being asked: one board at a time, soonest meeting first. A board that's on
// screen isn't changed under the person looking at it; it offers the update instead.
const AP = { running: false, t: 0, skip: new Set(), offered: new Set(), hold: new Set() };
function queuePrep() { clearTimeout(AP.t); AP.t = setTimeout(autoPrep, 1200); }
async function autoPrep() {
  if (AP.running || !Engine || !Engine.prepPlan || !Mem.data) return;
  AP.running = true;
  try {
    for (let guard = 0; guard < 16; guard++) {
      const states = Object.values(S.boards).filter(b => b.meetingId).map(b => ({ meetingId: b.meetingId, inputs: b.gen ? b.gen.inputs : undefined, refreshable: !!b.gen }));
      const plan = Engine.prepPlan(Mem.data, states, new Date().toISOString());
      const here = !TD.open && !sheetOpen() && board() && board().meetingId;
      // A meeting whose goal was just set is already being redrawn around it.
      const free = x => !AP.skip.has(x) && !AP.hold.has(x);
      const id = plan.make.find(free) || plan.refresh.find(x => free(x) && x !== here);
      if (here && plan.refresh.includes(here) && !AP.hold.has(here)) {
        const key = here + ':' + (board().gen ? board().gen.inputs : '');
        if (!AP.offered.has(key)) { AP.offered.add(key); toast('There’s new information for this board.', { label: 'Update it', fn: () => boardFromMemory(here, 0, { open: true }) }); }
      }
      if (!id) break;
      TD.busy.add(id); queueToday();
      const bid = await boardFromMemory(id, 0, { open: false, auto: true });
      TD.busy.delete(id); queueToday();
      if (!bid) AP.skip.add(id);
    }
  } finally { AP.running = false; queueToday(); }
}

/* ================= demo ================= */
// With the server started with --demo, a whole founder's week to explore: memory to start from,
// a calendar, Granola notes, and documents to paste at the right moments, with a guide on Today.
const DEMO = { on: false, samples: [], calendar: {} };
async function demoStatus() {
  try {
    const r = await fetch('/api/demo', grHeaders);
    if (!r.ok) return;
    const b = await r.json();
    Object.assign(DEMO, { on: true, samples: b.samples || [], calendar: b.calendar || {} });
    queueToday();
  } catch (_) { }
}
const demoLoaded = () => DEMO.on && Mem.data && Mem.data.user && Mem.data.user.email === 'alex@cueboard.example';
function openDemo() {
  closeMenu(); blurField(); exitPen();
  R = { mode: 'demo' };
  sheet.hidden = false;
  sheetFrame('Load the demo week', 'Alex Rivera is a founder raising a seed round and selling at the same time. This week:',
    [h('ul', { class: 'demo-list' },
      h('li', {}, h('b', { text: 'Brightline Health' }), ' · a customer renewal at risk, check-in in about 90 minutes'),
      h('li', {}, h('b', { text: 'Loomwise' }), ' · coffee with Lena that just ended, waiting for your notes'),
      h('li', {}, h('b', { text: 'Larkspur Ventures' }), ' · the partner meeting tomorrow; the first call’s notes are in Granola'),
      h('li', {}, h('b', { text: 'Northwind Logistics' }), ' · a first sales call tomorrow, from an intro email'),
      h('li', {}, h('b', { text: 'Fieldstone CRM' }), ' · a partnership, technical follow-up in three days')),
      h('p', { class: 'rv-note', text: 'It replaces the memory and boards in this browser, then connects the sample calendar so the boards draft themselves.' })],
    [h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: loadDemo }, ic('spark'), 'Load it')]);
}
async function loadDemo() {
  let b = null;
  try { const r = await fetch('/api/demo', grHeaders); b = r.ok ? await r.json() : null; } catch (_) { }
  if (!b || !b.memory) { toast('Couldn’t load the demo week'); return; }
  await (Mem.ready || (Mem.ready = loadMemory()));
  Mem.data = Engine.reviveMemory(b.memory, 'me');
  await saveMemory();
  for (const x of Object.values(S.boards)) if (!x.example) { delete S.boards[x.id]; dirty.delete(x.id); await Store.remove(x.id); }
  try { localStorage.removeItem('cueboard.demo.done'); } catch (_) { }
  // The sample calendar connects without Google and comes back to Today, where boards draft.
  location.assign('/oauth/google/start');
}
const meetingOf = calId => Mem.data && Mem.data.meetings.find(m => m.calendar && m.calendar.id === calId);
const sampleText = id => (DEMO.samples.find(x => x.id === id) || {}).text || '';
function pasteSample(id) {
  const t = sampleText(id); if (!t) return;
  TD.draft = (TD.draft.trim() ? TD.draft.replace(/\s+$/, '') + Engine.PASTE_BREAK : '') + t;
  renderToday();
  const ta = $('#td-paste', todayEl); if (ta) { ta.focus(); ta.scrollTop = ta.scrollHeight; }
}
function openMeeting(calId, float) {
  const m = meetingOf(calId); if (!m) { toast('Connect the calendar first'); return; }
  if (boardFor(m.id)) openFromToday(m.id, float);
  else boardFromMemory(m.id).then(id => { if (id && float) toggleFloat(); });
}
// Things to try, in an order that shows each part working. Ticks are this browser's convenience.
function demoDone() { try { return JSON.parse(localStorage.getItem('cueboard.demo.done') || '[]'); } catch (_) { return []; } }
function markDemo(k) { try { const d = new Set(demoDone()); d.add(k); localStorage.setItem('cueboard.demo.done', JSON.stringify([...d])); } catch (_) { } }
function demoGuide() {
  if (!demoLoaded()) return null;
  const done = new Set(demoDone());
  const step = (k, title, hint, label, fn) => h('li', { class: done.has(k) ? 'done' : '' },
    h('div', { class: 'demo-t', text: title }), h('div', { class: 'td-muted', text: hint }),
    label ? h('button', { class: 'btn', type: 'button', onclick: () => { markDemo(k); fn(); } }, label) : null);
  const lena = meetingOf('demo_loomwise_coffee');
  return h('div', { class: 'td-owed demo-guide' }, h('h2', { text: 'Things to try' }),
    h('ol', {},
      step('brightline', 'Open the Brightline board', 'A renewal at risk: the promise you’re late on, seats falling, their price objection and your answer. Hover any line to see where it came from.', 'Open it', () => openMeeting('demo_brightline_renewal')),
      step('sofia', 'New terms arrive before the call', 'Paste Sofia’s email and read it. The Brightline board updates itself and keeps anything you changed.', 'Paste Sofia’s email', () => pasteSample('sofia')),
      step('lena', 'Coffee with Lena just ended', 'Add what happened. What Lena says about Maya ends up on tomorrow’s Larkspur board too.', 'Add the notes', () => { if (lena) openSheet('notes', { meetingId: lena.id, text: sampleText('lena') }); }),
      step('granola', 'Bring in the call with Maya from Granola', 'The partner meeting board learns where you left off: the cohort table, churn, the Zoom question.', granolaOffered() ? 'Import from Granola' : null, () => openGranolaImport()),
      step('cohort', 'Keep a promise', 'Paste the email where you sent Maya the cohort table. The promise drops off what you owe.', 'Paste the email', () => pasteSample('cohort')),
      step('float', 'Float a board beside the call', 'A small window over Zoom or Meet in Chrome. H hides it, S shows sources, F finds anything.', 'Float the Larkspur board', () => openMeeting('demo_larkspur_partner', true)),
      step('edit', 'Make a board yours', 'Fill in a Goal or add a note, then paste something new about that meeting. Your changes stay; the rest updates.', null)));
}

/* ================= today ================= */
// The front page when meetings are coming up: each one with whether its board is ready, what
// changed since you last spoke and what's owed, and one box to paste a new meeting into.
const todayEl = h('section', { id: 'today', hidden: true, 'aria-label': 'Today' });
app.append(todayEl);
const TD = { open: false, busy: new Set(), draft: '', t: 0, iv: 0, goals: {}, goalEdit: null };
const NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const STATUS_CHIP = {
  ready: ['Board ready', 'ok'], not_prepped: ['Not prepped yet', 'plain'], needs_notes: ['Needs your notes', 'warn'],
  add_notes: ['How did it go?', 'warn'], reading: ['Preparing the board', 'busy'],
};
const madeFor = () => Object.values(S.boards).filter(b => b.meetingId).map(b => b.meetingId);
const boardFor = id => Object.values(S.boards).filter(b => b.meetingId === id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function openToday() {
  if (!Engine || !Engine.todayModel) return;
  closeMenu(); blurField(); exitPen();
  if (S.glance) exitGlance();
  TD.open = true; todayEl.hidden = false; app.classList.add('today-open');
  renderToday();
  track('today_opened');
  clearInterval(TD.iv); TD.iv = setInterval(renderToday, 60000);
}
function closeToday() {
  if (!TD.open) return;
  TD.open = false; todayEl.hidden = true; app.classList.remove('today-open');
  clearInterval(TD.iv);
}
function queueToday() { if (!TD.open || TD.t) return; TD.t = setTimeout(() => { TD.t = 0; renderToday(); }, 60); }
todayEl.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.hidden) { e.preventDefault(); closeToday(); } });

async function makeFromToday(id) {
  TD.busy.add(id); renderToday();
  const bid = await boardFromMemory(id, 0, { open: false });
  TD.busy.delete(id); renderToday();
  if (bid) toast('Board ready', { label: 'Open', fn: () => openFromToday(id) });
}
function openFromToday(id, float) {
  const b = boardFor(id); if (!b) return;
  closeToday(); switchBoard(b.id);
  if (float) toggleFloat();
}

function renderToday() {
  if (!TD.open) return;
  // A goal being typed keeps its place through a redraw.
  const ds = document.activeElement && document.activeElement.dataset;
  const typing = ds && (ds.goal ? `[data-goal="${ds.goal}"]` : ds.keep ? `[data-keep="${ds.keep}"]` : null);
  const caret = typing ? document.activeElement.selectionStart : 0;
  if (typing) setTimeout(() => { const i = todayEl.querySelector(typing); if (i && document.activeElement !== i) { i.focus(); try { i.setSelectionRange(caret, caret); } catch (_) { } } }, 0);
  const now = new Date();
  const model = Mem.data ? Engine.todayModel(Mem.data, now.toISOString(), madeFor()) : { sections: [], owed: [], upcoming: 0 };
  const todays = (model.sections.find(x => x.key === 'today') || { meetings: [] }).meetings.length;
  const top = h('header', { class: 'td-top' },
    h('div', { class: 'group td-brand' }, h('span', { class: 'td-badge', 'aria-hidden': 'true', text: 'C' }), h('b', { text: 'Today' }),
      h('span', { class: 'td-date', text: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) })),
    h('div', { class: 'group' },
      h('button', { class: 'btn', type: 'button', onclick: closeToday }, ic('boards'), h('span', { class: 'lbl', text: 'Your boards' })),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { const ta = $('#td-paste', todayEl); if (ta) ta.focus(); } }, ic('note'), h('span', { class: 'lbl', text: 'Paste for a meeting' }))));

  const list = h('div', { class: 'td-list' },
    h('h1', { class: 'td-h1', text: todays ? `${NUMBERS[todays] || todays} ${todays === 1 ? 'meeting' : 'meetings'} today` : 'Nothing on today' }));
  if (!model.sections.length) {
    list.append(h('div', { class: 'td-empty' },
      h('p', { text: CAL.status && CAL.status.connected
        ? (CAL.busy ? 'Reading your calendar…' : 'No meetings with people from outside your company in the next two weeks.')
        : 'No meetings in memory yet. Connect your calendar, or paste an invite and anything else you have about it, and the board drafts itself.' })));
  }
  for (const sec of model.sections) {
    if (sec.key !== 'today') list.append(h('h2', { class: 'td-sec', text: sec.label }));
    for (const m of sec.meetings) list.append(meetingCard(m, sec.key, now));
  }

  const ta = h('textarea', { id: 'td-paste', class: 'in td-ta', rows: 7, placeholder: 'Paste or drop anything about the meeting' });
  ta.value = TD.draft;
  const chips = h('div', { class: 'td-chips' });
  const drawChips = () => {
    chips.textContent = '';
    const ps = TD.draft.trim() ? Engine.splitPaste(TD.draft, today()) : [];
    for (const c of ps) chips.append(h('span', { class: 'td-chip k-' + c.kind, title: c.title, text: DOC_LABEL[c.kind] }));
  };
  let tt = 0;
  ta.addEventListener('input', () => { TD.draft = ta.value; clearTimeout(tt); tt = setTimeout(drawChips, 200); });
  pasteApart(ta, () => { TD.draft = ta.value; drawChips(); });
  drawChips();
  // Files dropped here: invites become meetings, text files (a notetaker's export) join the paste.
  ta.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', async e => {
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    for (const f of files.slice(0, 10)) {
      if (f.size > 2e6) { toast(`${f.name} is too big to read here`); continue; }
      const t = await f.text().catch(() => '');
      if (isInvite(t)) { importInvites(t); continue; }
      if (!/^text\/|\.(txt|md|vtt|srt|eml)$/i.test(f.type || f.name) || !t.trim()) { toast(`${f.name}: drop invites (.ics) or text files`); continue; }
      TD.draft = (TD.draft.trim() ? TD.draft.replace(/\s+$/, '') + Engine.PASTE_BREAK : '') + t.trim();
    }
    renderToday();
  });
  const readBtn = h('button', { class: 'btn primary td-read', type: 'button', onclick: () => {
    if (!TD.draft.trim()) { ta.focus(); return; }
    const text = TD.draft; TD.draft = '';
    if (isInvite(text)) { renderToday(); importInvites(text); return; }
    openSheet('prep', { text, go: true });
  } }, ic('spark'), 'Read them');
  const samples = DEMO.on && DEMO.samples.length ? h('div', { class: 'demo-samples' }, h('span', { class: 'td-muted', text: 'Demo documents:' }),
    DEMO.samples.map(x => h('button', { class: 'btn', type: 'button', title: x.hint, onclick: () => pasteSample(x.id) }, x.label))) : null;
  const paste = h('div', { class: 'td-paste' },
    h('h2', { text: 'Paste for a meeting' }),
    h('label', { for: 'td-paste', text: 'The invite, the email thread, your notes: paste them one after another. Cueboard sorts out which is which.' }),
    ta, chips, samples, readBtn);

  const owed = h('div', { class: 'td-owed' }, h('h2', { text: 'Owed this week' }),
    model.owed.length ? h('ul', {}, model.owed.map(o => h('li', {},
      h('span', { class: 'td-tag ' + (o.overdue ? 'bad' : o.theirs ? 'ok' : 'plain'), text: o.overdue ? 'Overdue' : o.theirs ? 'Theirs' : o.due ? new Date(o.due + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }) : 'Open' }),
      h('span', { text: o.text }))))
      : h('p', { class: 'td-muted', text: 'Nothing owed either way.' }));

  const gr = granolaOffered() ? h('div', { class: 'td-owed' }, h('h2', { text: 'Notes you already have' }),
    h('p', { class: 'td-muted', text: 'Bring in past meetings from Granola, so follow-ups know where you left off.' }),
    h('button', { class: 'btn td-gr', type: 'button', onclick: openGranolaImport }, ic('note'), 'Import from Granola')) : null;
  todayEl.replaceChildren(top, h('div', { class: 'td-main' }, list, h('aside', { class: 'td-side' }, demoGuide(), calendarCard(), researchCard(), paste, gr, owed)));
}

function meetingCard(m, key, now) {
  const start = new Date(m.startsAt), end = new Date(start.getTime() + m.durationMin * 60000);
  const when = (key === 'today' ? '' : start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ') + `${hm(start)} – ${hm(end)}`;
  const status = TD.busy.has(m.id) ? 'reading' : m.status;
  const [chip, tone] = STATUS_CHIP[status];
  const info = [
    m.people.length ? h('div', {}, h('span', { class: 'td-k', text: 'With ' }), m.people.join(', ')) : null,
    m.since ? h('div', {}, h('span', { class: 'td-k', text: 'Since last time ' }), m.since) : null,
    ...m.owed.map(o => h('div', { class: o.overdue ? 'td-bad' : '' }, o.text)),
  ].filter(Boolean);
  const act = [];
  const has = !!boardFor(m.id);
  if (status === 'reading') act.push(h('div', { class: 'td-progress', role: 'progressbar', 'aria-label': 'Reading the meeting' }, h('i')));
  else if (status === 'needs_notes' || status === 'add_notes') {
    act.push(h('button', { class: 'btn primary', type: 'button', onclick: () => openSheet('notes', { meetingId: m.notesFor || m.id }) }, status === 'add_notes' ? 'Add what happened' : 'Add last call’s notes'));
    if (status === 'needs_notes') act.push(has ? h('button', { class: 'btn', type: 'button', onclick: () => openFromToday(m.id) }, 'Open board anyway') : h('button', { class: 'btn', type: 'button', onclick: () => makeFromToday(m.id) }, 'Make the board anyway'));
  } else if (status === 'ready') {
    act.push(h('button', { class: 'btn primary', type: 'button', onclick: () => openFromToday(m.id) }, 'Open board'),
      h('button', { class: 'btn', type: 'button', onclick: () => openFromToday(m.id, true) }, ic('popout'), 'Float beside the call'));
    if (m.notesFor) act.push(h('button', { class: 'btn', type: 'button', onclick: () => openSheet('notes', { meetingId: m.notesFor }) }, 'Add last call’s notes'));
  } else act.push(h('button', { class: 'btn primary', type: 'button', onclick: () => makeFromToday(m.id) }, ic('spark'), 'Make the board'));
  if (m.joinUrl && key === 'today' && status !== 'add_notes') act.push(h('a', { class: 'btn', href: m.joinUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Join the call'));
  const note = m.notesFor && status !== 'add_notes' ? h('p', { class: 'td-muted', text: 'Notes from your last call with them aren’t in yet, so the board won’t know where you left off.' }) : null;
  const made = has && status === 'ready' ? boardFor(m.id).gen : null;
  // One line on what it's for shapes the board. Asked for until it's given; changeable after.
  let goal = null;
  if (status !== 'add_notes' && status !== 'reading') {
    if (m.goal && TD.goalEdit !== m.id) {
      goal = h('div', { class: 'td-goal' }, h('span', { class: 'td-k', text: 'Goal ' }), h('span', { text: m.goal }),
        h('button', { class: 'td-link', type: 'button', onclick: () => { TD.goalEdit = m.id; TD.goals[m.id] = m.goal; renderToday(); const i = todayEl.querySelector(`[data-goal="${m.id}"]`); if (i) { i.focus(); i.select(); } } }, 'Change'));
    } else {
      const input = h('input', { class: 'in', 'data-goal': m.id, value: TD.goals[m.id] || '', maxlength: 280, autocomplete: 'off', 'aria-label': `Goal for ${m.title}`,
        placeholder: 'What’s it for? One line shapes the board' });
      input.addEventListener('input', () => { TD.goals[m.id] = input.value; });
      goal = h('form', { class: 'td-goal', onsubmit: ev => {
        ev.preventDefault();
        const v = input.value.trim(); if (!v && !m.goal) { input.focus(); return; }
        delete TD.goals[m.id]; TD.goalEdit = null; input.blur();
        setMeetingGoal(m.id, v, false);
      } }, input, h('button', { class: 'btn', type: 'submit' }, m.goal ? 'Save' : 'Set goal'));
    }
  }
  return h('article', { class: 'td-card' },
    h('div', { class: 'td-meta' }, h('span', { class: 'td-time', text: when }), h('span', { class: 'td-tag ' + tone, text: chip }),
      h('span', { class: 'td-muted', text: m.stage === 'followup' ? `Follow-up · meeting ${m.meetingNo}` : 'First meeting' }),
      made && made.auto ? h('span', { class: 'td-muted', text: `Drafted for you · ${hm(new Date(made.at))}` }) : null),
    h('h3', { class: 'td-title', text: m.title }),
    info.length ? h('div', { class: 'td-info' }, info) : null,
    goal,
    note,
    h('div', { class: 'td-actions' }, act));
}

/* ================= float: the in-call window ================= */
// During the call the board floats in a small window beside the meeting. Chrome and Edge keep it
// on top of every app, the Zoom desktop app included (Document Picture-in-Picture); other browsers
// get an ordinary small window, and where neither is allowed (an embedded viewer) it docks in the
// page corner. It shows the board's own cards, read-only, in one column, so it looks like a piece
// of the board; questions ticked and notes jotted here land on the board. The other side only sees
// it if the user shares their whole screen, which it warns about once, and H blanks it in one key.
const FL = { win: null, doc: null, ui: null, dock: null, pip: false, strip: false, hidden: false, cites: false, finding: false, noting: false, t: 0, iv: 0, fullH: 0, w: 0 };
const FL_W = 380, FL_H = 640, FL_ZOOM = 0.86;
const FLOAT_SKIP = new Set(['text', 'image', 'ink', 'shape']);
const floatOpen = () => !!(FL.win && !FL.win.closed && FL.ui);
// Mid-meeting the board's tab sits behind the call, where the browser slows its timers, so the
// window does its own timing: its timer ticks and updates run on the window that's on screen.
const flLater = (fn, ms) => (FL.win ? FL.win.setTimeout(fn, ms) : setTimeout(fn, ms));
const isKeyCard = e => e.type === 'card' && e.lines.some(l => /^goal$/i.test(l.label || '') && l.text.trim());
// The board as the meeting runs: each part, then what sits under it; whatever belongs to no
// part (wide charts, things added off to the side) after.
function planOrder(all) {
  const parts = phaseCards(all); if (parts.length < 2) return null;
  const mid = e => e.x + sizeOf(e).w / 2;
  const taken = new Set(parts.map(x => x.e)), out = [];
  for (const x of parts) {
    const top = x.e.y, l = x.e.x - 12, r = x.e.x + sizeOf(x.e).w + 12;
    const under = all.filter(e => !taken.has(e) && !e.live && e.y > top && mid(e) >= l && mid(e) <= r && sizeOf(e).w <= sizeOf(x.e).w * 1.6).sort((a, b) => a.y - b.y);
    out.push(x.e, ...under); under.forEach(e => taken.add(e));
  }
  return out.concat(all.filter(e => !taken.has(e) && !e.live));
}

async function toggleFloat() {
  if (floatOpen()) { closeFloat(); return; }
  if (!board()) return;
  blurField();
  let w = null, pip = false;
  if ('documentPictureInPicture' in window) {
    try { w = await window.documentPictureInPicture.requestWindow({ width: FL_W, height: FL_H }); pip = true; } catch (_) { w = null; }
  }
  if (!w) { try { w = window.open('', 'cueboard-float', `popup,width=${FL_W},height=${FL_H}`); } catch (_) { w = null; } }
  let dock = null;
  if (!w) {
    dock = h('iframe', { id: 'float-dock', title: 'Cueboard, compact view' });
    app.append(dock);
    w = dock.contentWindow;
  }
  Object.assign(FL, { win: w, doc: w.document, dock, pip, strip: false, hidden: false, finding: false, noting: false, fullH: 0 });
  buildFloat();
  renderFloat();
  FL.iv = w.setInterval(floatTimer, 1000);
  w.addEventListener('pagehide', () => { if (FL.win === w) Object.assign(FL, { win: null, doc: null, ui: null, dock: null }); updateFloatBtn(); });
  w.addEventListener('resize', () => { if (floatOpen() && !FL.strip && Math.abs(w.innerWidth - FL.w) > 8) queueFloat(); });
  updateFloatBtn();
  track('float_opened', { kind: dock ? 'dock' : pip ? 'pip' : 'popup' });
  if (dock) toast('This browser won’t open a floating window, so it’s docked here. In Chrome or Edge it floats over your meeting.');
  else if (!pip) toast('In this browser the window won’t stay on top. In Chrome or Edge it floats over your meeting.');
}
function closeFloat() {
  const w = FL.win, dock = FL.dock;
  Object.assign(FL, { win: null, doc: null, ui: null, dock: null });
  if (dock) dock.remove(); else { try { if (w && !w.closed) w.close(); } catch (_) { } }
  updateFloatBtn();
}
function updateFloatBtn() {
  for (const q of ['#b-float', '#g-float']) { const b = $(q); if (b) { b.setAttribute('aria-pressed', String(floatOpen())); b.classList.toggle('on', floatOpen()); } }
}
// The docked panel has no window frame, so its size is the iframe's; a real window is resized.
const floatHeight = () => (FL.dock ? FL.dock.offsetHeight : FL.win.innerHeight);
const floatWidth = () => (FL.dock ? FL.dock.offsetWidth : FL.win.innerWidth);
function setFloatSize(width, height) {
  if (FL.dock) { FL.dock.style.width = width + 'px'; FL.dock.style.height = height + 'px'; return; }
  const w = FL.win;
  try { w.resizeTo(width + (w.outerWidth - w.innerWidth), height + (w.outerHeight - w.innerHeight)); } catch (_) { }
}
const setFloatHeight = height => setFloatSize(floatWidth(), height);

function buildFloat() {
  const d = FL.doc;
  d.head.replaceChildren(); d.body.replaceChildren();
  const meta = d.createElement('meta'); meta.setAttribute('charset', 'utf-8');
  const ttl = d.createElement('title'); ttl.textContent = 'Cueboard';
  // The board's own stylesheet, so the cards look exactly as they do on the board, then the window's.
  const css = [$('#board-css'), $('#float-css')].map(s => { const n = d.createElement('style'); n.textContent = s.textContent; return n; });
  d.head.append(meta, ttl, ...[...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.cloneNode()), ...css);
  let tipSeen = false; try { tipSeen = localStorage.getItem('cueboard.floatTip') === '1'; } catch (_) { }
  const U = FL.ui = { tipDone: tipSeen };
  const btn = (icon, label, key, fn, cls) => h('button', { class: 'fl-btn' + (cls ? ' ' + cls : ''), type: 'button', title: `${label} (${key})`, 'aria-label': label, onclick: fn }, ic(icon));
  U.time = h('button', { class: 'fl-time', type: 'button', title: 'Start or pause the timer (T)', onclick: () => tToggle() });
  U.prog = h('div', { class: 'fl-prog' }, h('i'));
  U.src = btn('info', 'Show sources', 'S', () => setFloatCites(!FL.cites));
  U.mode = btn('compact', 'Just the essentials', 'C', () => setFloatStrip(!FL.strip));
  U.hide = btn('hide', 'Hide', 'H', () => setFloatHidden(true));
  U.ctl = h('div', { class: 'fl-ctl' }, btn('search', 'Find', '/', openFind), btn('note', 'Jot a note', 'N', openNote), U.src, U.mode, U.hide,
    FL.dock ? btn('close', 'Close', 'F', closeFloat) : null);
  U.show = h('button', { class: 'fl-show', type: 'button', title: 'Show the board (H)', onclick: () => setFloatHidden(false) }, ic('expand'), 'Show');
  U.tip = h('div', { class: 'fl-tip', role: 'note' },
    h('span', { text: 'Sharing your screen? Share a window or a tab, not your entire screen, or this window shows up too. H hides it instantly.' }),
    h('button', { type: 'button', onclick: () => { U.tipDone = true; try { localStorage.setItem('cueboard.floatTip', '1'); } catch (_) { } renderFloat(); } }, 'Got it'));
  U.q = h('input', { type: 'search', placeholder: 'Find a name, number or note', 'aria-label': 'Find', autocomplete: 'off', spellcheck: 'false' });
  U.findBar = h('label', { class: 'fl-findbar' }, ic('search'), U.q);
  U.stack = h('div', { class: 'fl-stack' });
  U.scroll = h('div', { class: 'fl-scroll' }, U.stack);
  U.compact = h('div', { class: 'fl-compact' });
  U.noteIn = h('input', { placeholder: 'Jot a note. Enter adds it to the board', 'aria-label': 'Meeting note', autocomplete: 'off' });
  U.noteOk = h('span', { class: 'fl-ok', text: 'Added', hidden: true });
  U.note = h('form', { class: 'fl-note', onsubmit: ev => {
    ev.preventDefault(); const t = U.noteIn.value.trim(); if (!t) return;
    addLiveNote(t); U.noteIn.value = ''; U.noteOk.hidden = false; clearTimeout(U.okT); U.okT = setTimeout(() => { U.noteOk.hidden = true; }, 1400);
  } }, U.noteIn, U.noteOk);
  U.top = h('header', { class: 'fl-top' }, U.time, U.ctl, U.show);
  U.root = h('div', { id: 'fl' }, U.prog, U.top, U.tip, U.findBar, U.scroll, U.compact, U.note);
  d.body.append(U.root);
  U.q.addEventListener('input', applyFloatFind);
  U.q.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); const c = U.stack.querySelector(':scope > .el:not(.miss)'); if (c) jumpFloat(c.dataset.id); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeFind(); }
  });
  U.noteIn.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeNote(); } });
  U.stack.addEventListener('click', ev => {
    const chk = ev.target.closest('.check');
    if (chk) { const card = chk.closest('.el'); if (card) toggleFloatItem(card.dataset.id, +chk.dataset.i); return; }
    if (ev.target.closest('a, button')) return;
    const card = ev.target.closest('.fl-stack > .el');
    if (card && card.querySelector('.fl-src')) card.classList.toggle('fl-open');
  });
  d.addEventListener('keydown', floatKey);
}

function queueFloat() {
  if (!floatOpen() || FL.t) return;
  FL.t = flLater(() => { FL.t = 0; renderFloat(); }, 100);
}
function renderFloat() {
  if (!floatOpen()) return;
  const U = FL.ui, b = board(); if (!b) return;
  const R = U.root;
  R.classList.toggle('strip', FL.strip); R.classList.toggle('cites', FL.cites); R.classList.toggle('veiled', FL.hidden);
  U.mode.replaceChildren(ic(FL.strip ? 'expand' : 'compact'));
  const ml = FL.strip ? 'Show everything' : 'Just the essentials';
  U.mode.title = ml + ' (C)'; U.mode.setAttribute('aria-label', ml);
  U.src.setAttribute('aria-pressed', String(FL.cites));
  U.tip.hidden = U.tipDone || FL.hidden;
  U.findBar.hidden = FL.hidden || FL.strip || !FL.finding;
  U.note.hidden = FL.hidden || FL.strip || !FL.noting;
  U.scroll.hidden = FL.hidden || FL.strip;
  U.compact.hidden = FL.hidden || !FL.strip;
  U.ctl.hidden = FL.hidden; U.show.hidden = !FL.hidden;
  FL.doc.title = FL.hidden ? 'Cueboard' : b.title;
  floatTimer();
  // The run of show first, then the board in its reading order, with notes jotted in the call last.
  const all = readingOrder(els()).filter(e => !FLOAT_SKIP.has(e.type) && textOf(e).trim());
  const key = all.find(isKeyCard);
  const body = all.filter(e => e !== key);
  const items = (key ? [key] : []).concat(planOrder(body) || body.filter(e => !e.live), body.filter(e => e.live));
  const qs = all.find(e => e.type === 'list' && /question/i.test(e.title || '')) || all.find(e => e.type === 'list');
  renderCompact(key, qs, all);
  if (!FL.strip && !FL.hidden) {
    FL.w = FL.win.innerWidth;
    const open = new Set([...U.stack.querySelectorAll('.fl-open')].map(n => n.dataset.id));
    const top = U.scroll.scrollTop;
    const W = Math.max(260, Math.round((U.scroll.clientWidth - 24) / FL_ZOOM));
    U.stack.replaceChildren(...(items.length ? items.map(e => floatNode(e, W, open.has(e.id))) : [h('div', { class: 'fl-empty', text: 'Nothing on this board yet.' })]));
    U.scroll.scrollTop = top;
    applyFloatFind();
    FL.part = null; floatTimer();
  }
  if (FL.strip) fitStrip();
}

// A board card as it looks on the board, read-only, with its sources ready underneath.
function floatNode(e, W, open) {
  const id = 'fl_' + e.id;
  const sized = e.type === 'chart' ? { w: W, h: Math.min(e.h, 240) } : e.type === 'timeline' ? { w: W } : {};
  const n = build(Object.assign({}, e, { id }, sized));
  nodes.delete(id);
  n.dataset.id = e.id;
  if (open) n.classList.add('fl-open');
  n.querySelectorAll('.handle, .rot-handle, .add-item').forEach(x => x.remove());
  const rows = n.querySelectorAll('.lines > .ln');
  (e.lines || []).forEach((l, i) => { const c = rows[i] && floatCite(l.cite, false, l); if (c) rows[i].append(c); });
  if (e.type === 'list') n.querySelectorAll('.items > li').forEach((li, i) => {
    const it = e.items[i], c = it && floatCite(it.cite); if (!c) return;
    const f = li.querySelector('.f'), wrap = h('div', { class: 'fl-qb' });
    f.replaceWith(wrap); wrap.append(f, c);
  });
  // A number is what gets said out loud, so its source always shows.
  if (e.type === 'stat') { const c = floatCite(e.cite, true); if (c) n.append(c); }
  if (e.type === 'note') { const c = floatCite(e.cite); if (c) n.append(c); }
  return n;
}
function floatCite(cite, always, l) {
  let kids;
  if (cite) kids = ['From ', cite.map((c, i) => [i ? '; ' : '', c.url ? h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer', text: c.label }) : c.label, c.date ? ' · ' + c.date : ''])];
  else if (l && l.suggested) kids = ['Suggested from what’s known, not from a source'];
  else if (l && l.gap) kids = ['Not known yet'];
  else return null;
  return h('div', { class: 'fl-src' + (always ? ' on' : '') }, kids);
}

// Compact: one card with the goal, and the next question large enough to read mid-sentence.
function renderCompact(key, qs, all) {
  const U = FL.ui;
  // The goal is on the key card; the ask may sit there or at the end of the plan.
  const pick = re => [key].concat(all || []).filter(e => e && e.type === 'card').map(e => e.lines.find(l => re.test(l.label || '') && l.text.trim())).find(Boolean);
  const goal = pick(/^goal$/i), ask = pick(/^ask$/i);
  const live = qs ? qs.items.map((it, i) => ({ it, i })).filter(x => x.it.text.trim()) : [];
  const left = live.filter(x => !x.it.done), next = left[0];
  const kids = [];
  if (goal) kids.push(h('div', { class: 'fl-cgoal' + (goal.suggested ? ' sug' : '') }, h('span', { class: 'fl-k', text: 'Goal' }), h('span', { class: 'v', text: goal.text })));
  if (next) {
    kids.push(h('div', { class: 'fl-k', text: `Next question · ${live.length - left.length + 1} of ${live.length}` }),
      h('div', { class: 'fl-cq' + (next.it.gap ? ' gap' : '') }, next.it.text),
      h('div', { class: 'fl-crow' },
        h('button', { class: 'fl-asked', type: 'button', onclick: () => toggleFloatItem(qs.id, next.i) }, ic('check'), 'Asked it'),
        ask ? h('span', { class: 'fl-cask' }, h('span', { class: 'fl-k', text: 'Ask' }), ' ', ask.text) : null));
  } else if (ask) {
    kids.push(h('div', { class: 'fl-k', text: live.length ? 'Every question asked. Now the ask' : 'The ask' }), h('div', { class: 'fl-cq' }, ask.text));
  }
  if (!kids.length) kids.push(h('div', { class: 'fl-empty', text: 'Add Goal and Ask lines to a card, and a questions checklist, to see them here.' }));
  U.compact.replaceChildren(...kids);
}

function toggleFloatItem(id, i) {
  const e = byId(id), it = e && e.items && e.items[i]; if (!it) return;
  pushUndo(); it.done = !it.done;
  rerender(e); scheduleSave();
  renderFloat();
}
function jumpFloat(id) {
  if (FL.strip) setFloatStrip(false);
  const c = FL.ui.stack.querySelector(`:scope > .el[data-id="${id}"]`); if (!c) return;
  c.scrollIntoView({ block: 'start' });
  c.classList.remove('fl-flash'); void c.offsetWidth; c.classList.add('fl-flash');
}
function stepFloat(dir) {
  const U = FL.ui, cards = [...U.stack.querySelectorAll(':scope > .el:not(.miss)')]; if (!cards.length) return;
  const top = U.scroll.getBoundingClientRect().top;
  let i = cards.findIndex(c => c.getBoundingClientRect().bottom > top + 12);
  if (i < 0) i = cards.length - 1;
  const atTop = Math.abs(cards[i].getBoundingClientRect().top - top) < 16;
  const next = dir > 0 ? (atTop ? i + 1 : i) : (atTop ? i - 1 : i);
  jumpFloat(cards[clamp(next, 0, cards.length - 1)].dataset.id);
}
function applyFloatFind() {
  const U = FL.ui; if (!U) return;
  const q = FL.finding ? U.q.value.trim().toLowerCase() : '';
  U.stack.querySelectorAll(':scope > .el').forEach(n => { const e = byId(n.dataset.id); n.classList.toggle('miss', !!q && !(e && textOf(e).toLowerCase().includes(q))); });
  // Mark the matching lines too, so the eye lands on the number, not just the card.
  U.stack.querySelectorAll('.f').forEach(f => f.classList.toggle('hit', !!q && f.textContent.toLowerCase().includes(q)));
}
function openFind() { if (FL.hidden) return; if (FL.strip) setFloatStrip(false); FL.finding = true; renderFloat(); FL.ui.q.focus(); FL.ui.q.select(); }
function closeFind() { FL.finding = false; FL.ui.q.value = ''; FL.ui.q.blur(); renderFloat(); }
function openNote() { if (FL.hidden) return; if (FL.strip) setFloatStrip(false); FL.noting = true; renderFloat(); FL.ui.noteIn.focus(); }
function closeNote() { FL.noting = false; FL.ui.noteIn.blur(); renderFloat(); }
function setFloatStrip(on) {
  if (on && !FL.strip) FL.fullH = floatHeight();
  FL.strip = on; renderFloat();
  if (!on) setFloatHeight(Math.max(FL.fullH || 0, 420));
}
// Compact is only as tall as its card.
function fitStrip() {
  if (!floatOpen() || !FL.strip || FL.hidden) return;
  const need = Math.ceil(FL.ui.compact.getBoundingClientRect().bottom + 12);
  if (Math.abs(floatHeight() - need) > 4) setFloatHeight(need);
}
// Hidden, the window shrinks to a pill with the timer and Show: nothing readable, nothing in the way.
const FL_PILL_W = 248;
function setFloatHidden(on) {
  if (!floatOpen() || on === FL.hidden) return;
  if (on) FL.pre = { w: floatWidth(), h: floatHeight() };
  FL.hidden = on; renderFloat();
  if (on) setFloatSize(Math.min(FL_PILL_W, FL.pre.w), Math.ceil(FL.ui.top.getBoundingClientRect().bottom));
  else if (FL.pre) { setFloatSize(FL.pre.w, FL.pre.h); if (FL.strip) fitStrip(); }
}
function setFloatCites(on) { FL.cites = on; FL.ui.root.classList.toggle('cites', on); FL.ui.src.setAttribute('aria-pressed', String(on)); }
function floatTimer() {
  if (!floatOpen()) return;
  const U = FL.ui, s = Math.floor(tElapsed() / 1000), over = s > T.len * 60;
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  // With the timer running, the part of the plan the clock is in is named and marked, and the
  // window moves to it once as it begins.
  const parts = phaseCards(), min = s / 60;
  const cur = (T.running || s) ? (parts.find(x => min >= x.from && min < x.to) || (parts.length && min >= parts.at(-1).to ? parts.at(-1) : null)) : null;
  const name = cur ? (cur.e.title || '').trim() : '';
  U.time.textContent = (T.running || s) ? `${mm}:${ss} of ${T.len} min${name ? ' · ' + name : ''}` : `Start timer · ${T.len} min`;
  const curId = cur ? cur.e.id : null;
  if (curId !== FL.part) {
    const moved = FL.part !== null && FL.part !== undefined;
    FL.part = curId;
    U.stack.querySelectorAll(':scope > .el').forEach(n => n.classList.toggle('fl-now', n.dataset.id === curId));
    if (curId && moved && T.running && !FL.strip && !FL.hidden && !FL.finding) { const c = U.stack.querySelector(`:scope > .el[data-id="${curId}"]`); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }
  U.time.classList.toggle('run', T.running); U.time.classList.toggle('over', over);
  U.prog.firstChild.style.width = Math.min(100, s / (T.len * 60) * 100) + '%';
  U.prog.classList.toggle('over', over);
}
function floatKey(ev) {
  const U = FL.ui; if (!U) return;
  const t = ev.target;
  if ((t && t.closest && t.closest('input, textarea')) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = (ev.key || '').toLowerCase();
  if (k === 'h') { ev.preventDefault(); setFloatHidden(!FL.hidden); return; }
  if (FL.hidden) return;
  if (ev.key === '/') { ev.preventDefault(); openFind(); }
  else if (k === 'n') { ev.preventDefault(); openNote(); }
  else if (k === 'c') { ev.preventDefault(); setFloatStrip(!FL.strip); }
  else if (k === 's') { ev.preventDefault(); setFloatCites(!FL.cites); }
  else if (k === 't') { ev.preventDefault(); tToggle(); }
  else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || k === 'j' || k === 'k') { ev.preventDefault(); if (!FL.strip) stepFloat(ev.key === 'ArrowDown' || k === 'j' ? 1 : -1); }
  else if (ev.key === 'Escape') { if (FL.finding) closeFind(); else if (FL.noting) closeNote(); }
}

/* ================= assistant ================= */
const AI = { sample: null, ready: null, busy: false, ctl: null, deep: false, off: false };
// Run locally, the page uses the model of the server it came from (scripts/serve.ts), through a
// stand-in with the same shape as Claude's in-page sampling, so the assistant works the same way.
function localSample() {
  const tier = t => (t === 'quick' ? 'low' : t === 'complex' ? 'high' : 'medium');
  const call = async (input, opts) => {
    opts = opts || {};
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    let res;
    try {
      res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cueboard': '1' }, body: JSON.stringify({ messages, effort: tier(opts.modelTier) }), signal: opts.signal });
    } catch (e) { throw Object.assign(new Error('Not sent'), { code: e && e.name === 'AbortError' ? 'cancelled' : 'unavailable' }); }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
      const c = body && body.error && body.error.code;
      // The hosted version's own refusals (the daily limit, an expired invite) say what to do.
      throw Object.assign(new Error((body && body.error && body.error.message) || 'No answer'), { code: c === 'refusal' ? 'refused' : c === 'rate_limited' ? 'rate_limited' : 'unavailable', plain: res.status === 429 || res.status === 401 });
    }
    if (opts.onText) opts.onText({ text: body.text, delta: body.text });
    return { text: body.text, truncated: false };
  };
  const fn = (input, opts) => call(input, opts);
  fn.json = async (input, opts) => {
    const { text } = await call(input, opts);
    const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { throw Object.assign(new Error('Not JSON'), { code: 'invalid_json', text }); }
  };
  fn.local = true;
  return fn;
}
AI.ready = useCap('sample').then(async s => {
  if (s || !Engine || !Engine.serverStatus) return s;
  const st = await Engine.serverStatus();
  return st.available && st.chat ? localSample() : null;
}).then(s => { AI.sample = s; AI.off = !s; if (!s && S.asAuto && S.asOpen && !S.glance) setAssistant(false, true); renderChat(); updateEmpty(); updateSelTools(); return s; });
try { AI.deep = localStorage.getItem('cueboard.deep') === '1'; } catch (_) { }
asDeep.checked = AI.deep;
asDeep.addEventListener('change', () => { AI.deep = asDeep.checked; try { localStorage.setItem('cueboard.deep', AI.deep ? '1' : '0'); } catch (_) { } });

const RULES = `You are the assistant inside Cueboard, a freeform canvas where someone prepares for an important meeting and glances at it during the call. You read their board and change it by returning actions.

Reply with ONLY one JSON object, with "reply" first:
{"reply": "1-3 short plain sentences to the user", "actions": [ ... ]}
Use "actions": [] when the message only needs an answer.

ACTIONS
{"op":"add","element":{...}}                 add an element. Leave out x and y so the board places it neatly, unless the user asks for a specific spot.
{"op":"update","id":"<id>","changes":{...}}  change fields of an existing element
{"op":"delete","id":"<id>"}                  remove an element
{"op":"link","from":"<id>","to":"<id>","label":"optional, a few words"}   draw an arrow between two elements (who-decides maps, flows)
{"op":"tidy"}                                re-arrange the whole board into neat columns. Only when the user asks to tidy or rearrange.

ELEMENT TYPES (canvas pixels; x grows right, y grows down). Images and drawings on the board are the user's; you can move or delete them when asked but can't create them.
note    {"type":"note","title":"topic","text":"...","color":"yellow|mint|sky|rose|lilac"}   a quick note about one topic, 1-3 short lines
text    {"type":"text","text":"...","size":"h1|h2|body"}   headings and section labels
person  {"type":"person","name":"...","lines":[{"text":"Partner at ..."}]}   someone in the meeting
card    {"type":"card","tag":"Goal|Context|Objection|Risk|Pitch|Agenda|...","title":"...","lines":[{"label":"optional","text":"..."}],"color":"yellow|mint|sky|rose|lilac"}
list    {"type":"list","title":"...","items":[{"text":"...","done":false}]}   questions to ask, agenda, follow-ups
chart   {"type":"chart","title":"...","kind":"bar|line","prefix":"$","suffix":"k","data":[{"label":"Jan","value":12}],"caption":"one-line takeaway"}
stat    {"type":"stat","label":"...","value":"$48k","note":"+18% MoM"}   one key number
shape   {"type":"shape","shape":"rect|round|ellipse|diamond","fill":"yellow|mint|sky|rose|lilac|white|none","text":"..."}

HOW TO WRITE
- The board is glanced at mid-conversation. Keep lines short (about 10 words or fewer), cards to 2-5 lines, titles to a few words.
- Write in the user's own voice, as their prep notes.
- Never invent facts about real people, companies or numbers. When you don't know something, write a placeholder in square brackets, like "[check their last fund size]", and say in your reply what to look up.
- Only chart numbers the user gave you or that are already on the board. If a chart needs data you don't have, ask for it.
- The user arranged this board. Never move, rewrite or delete their content unless they ask. When they say "this" or "it", they mean the SELECTED element.
- Drafting a whole board: one h1 text header, a person for each attendee, a Key notes card with Goal / Open with / Ask lines, a list of questions to ask, notes for likely objections with short answers, and stats or charts only for numbers you were given. 6-12 elements is plenty.
- Colors: sky = people and context, mint = goals and good news, rose = risks and objections, yellow = reminders, lilac = pitch and talk track.`;

function boardJSON() {
  const out = els().map(e => {
    const o = { id: e.id, type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w) };
    for (const k of ALLOWED[e.type]) if (!['x', 'y', 'w', 'h'].includes(k) && e[k] !== undefined) o[k] = e[k];
    if (e.type === 'ink') o.strokes = e.strokes.length;
    if (e.group) o.group = e.group;
    if (e.rot) o.rot = e.rot;
    return o;
  });
  const ls = links().filter(l => l.from.id && l.to.id).map(l => Object.assign({ from: l.from.id, to: l.to.id }, l.label ? { label: l.label } : {}));
  let s = JSON.stringify({ elements: out, arrows: ls }, (k, v) => (k === 'cite' ? undefined : v));
  if (s.length > 90000) s = s.slice(0, 90000) + '…';
  return s;
}
function receiptText(rc) {
  const p = [];
  if (rc.added) p.push('Added ' + rc.added);
  if (rc.updated) p.push('Changed ' + rc.updated);
  if (rc.removed) p.push('Removed ' + rc.removed);
  if (rc.linked) p.push('Connected ' + rc.linked);
  if (rc.tidied) p.push('Tidied');
  return p.join(' · ');
}
function buildTurns(text, history) {
  const hist = [];
  for (const m of history.slice(-12)) {
    if (m.role === 'user' && m.text) hist.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant' && m.text && !m.error) hist.push({ role: 'assistant', content: m.text + (m.receipt ? `\n(Applied to the board: ${receiptText(m.receipt)})` : '') });
  }
  const ctx = `BOARD TITLE: ${board().title}\nBOARD (JSON):\n${boardJSON()}\n\nSELECTED ELEMENT: ${S.sel || 'none'}\n\nUSER MESSAGE:\n${text}`;
  return [{ role: 'user', content: RULES }].concat(hist, [{ role: 'user', content: ctx }]);
}
function extractReply(t) {
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(t || '');
  if (!m) return '';
  let g = m[1]; if (/\\$/.test(g)) g = g.slice(0, -1);
  try { return JSON.parse('"' + g + '"'); } catch (_) { return g.replace(/\\n/g, '\n').replace(/\\"/g, '"'); }
}
const OFF_CODES = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
function errCopy(code) {
  switch (code) {
    case 'not_granted': return 'Claude wasn’t allowed for this page, so the assistant is off for now. Reload to be asked again.';
    case 'sampling_disabled': case 'not_declared': case 'capability_disabled': case 'capability_removed': return 'The assistant isn’t available in this view.';
    case 'rate_limited': return 'Claude is busy or you’ve reached a usage limit. Try again in a little while.';
    case 'session_expired': return 'Your Claude session expired. Sign in again, then retry.';
    case 'refused': return 'Claude declined that request. Try asking it a different way.';
    case 'invalid_json': return 'The answer came back in a shape the board couldn’t use. Try again.';
    case 'empty_completion': return 'No answer came back. Try asking for less at once.';
    case 'prompt_too_large': return 'This board is too large to send in one go. Remove a few items and try again.';
    default: return 'Something went wrong reaching Claude. Try again.';
  }
}
// The assistant can rewrite a card but can't vouch for a source: a source stays only on text it left alone.
function keepCites(cur, e) {
  const was = new Map((cur.lines || []).filter(l => l.cite).map(l => [l.text, l.cite]));
  for (const l of e.lines || []) { const c = was.get(l.text); if (c) l.cite = c; else delete l.cite; }
  const wasItem = new Map((cur.items || []).filter(i => i.cite).map(i => [i.text, i.cite]));
  for (const it of e.items || []) { const c = wasItem.get(it.text); if (c) it.cite = c; else delete it.cite; }
  const same = e.type === 'stat' ? cur.value === e.value && cur.note === e.note : cur.text === e.text;
  if (cur.cite && same) e.cite = cur.cite; else delete e.cite;
}
function applyActions(acts, opts) {
  if (!Array.isArray(acts) || !acts.length) return null;
  const snap = snapshot();
  const list = els(), wasEmpty = list.length === 0;
  const added = [], toPlace = [];
  let updated = 0, removed = 0, linked = 0, tidied = false;
  for (const a of acts.slice(0, 60)) {
    if (!a || typeof a !== 'object') continue;
    if (a.op === 'add') {
      if (list.length >= 400) break;
      const e = normalizeEl(a.element || a, false); if (!e || e.type === 'image' || e.type === 'ink') continue;
      if (e.type === 'list' && !e.items.length) e.items = [{ text: '', done: false }];
      list.push(e); added.push(e);
      if (e.x == null || e.y == null) { toPlace.push(e); e.x = 0; e.y = 0; }
    } else if (a.op === 'update') {
      const i = list.findIndex(e => e.id === a.id); if (i < 0) continue;
      const cur = list[i], ch = a.changes && typeof a.changes === 'object' ? a.changes : {};
      const merged = Object.assign({}, cur);
      for (const k of ALLOWED[cur.type]) if (k in ch) merged[k] = ch[k];
      if ((cur.type === 'card' || cur.type === 'person') && typeof ch.body === 'string') merged.lines = linesFrom({ body: ch.body });
      const e = normalizeEl(merged, true); if (!e) continue;
      if (cur.live) e.live = true;
      keepCites(cur, e);
      list[i] = e; updated++;
    } else if (a.op === 'delete') {
      const ids = Array.isArray(a.ids) ? a.ids : [a.id];
      for (const id of ids) { const i = list.findIndex(e => e.id === id); if (i >= 0) { list.splice(i, 1); removed++; } }
    } else if (a.op === 'link') {
      const l = normalizeLink({ from: { id: a.from }, to: { id: a.to }, arrow: a.arrow, label: a.label }, new Set(list.map(e => e.id)));
      if (l) { links().push(l); linked++; }
    } else if (a.op === 'tidy') tidied = true;
  }
  if (!added.length && !updated && !removed && !linked && !tidied) return null;
  pruneGroups();
  const ids = new Set(list.map(e => e.id));
  board().links = links().filter(l => (!l.from.id || ids.has(l.from.id)) && (!l.to.id || ids.has(l.to.id)));
  S.undo.push(snap); if (S.undo.length > 100) S.undo.shift(); S.redo.length = 0; S.touched = true; updateUndo();
  S.multi = new Set([...S.multi].filter(id => ids.has(id))); if (S.sel && !ids.has(S.sel)) S.sel = null;
  const b = board();
  const h1 = added.find(e => e.type === 'text' && e.size === 'h1' && e.text);
  if (h1 && (b.title === 'Untitled meeting' || !b.title)) { b.title = h1.text.slice(0, 120); updateChrome(); }
  if (b.example && opts && opts.draft) { b.example = false; updateChrome(); }
  renderAll();
  if (toPlace.length) placeNew(toPlace);
  if (tidied) tidyLayout(true);
  added.forEach(e => { const n = nodes.get(e.id); if (n) n.classList.add('fresh'); });
  renderLinks(); scheduleSave(); updateEmpty(); positionSelTools();
  if (S.glance) buildChips();
  requestAnimationFrame(() => {
    if (added.length && !wasEmpty && !tidied) fitRect(rectOf(added), 1, true);
    else fitAll(true);
  });
  return { added: added.length, updated, removed, linked, tidied, snap, boardId: b.id, undone: false };
}
async function ask(text, opts) {
  text = String(text || '').trim();
  if (!text || AI.busy) return;
  opts = opts || {};
  setAssistant(true);
  const chat = curChat();
  chat.push({ role: 'user', text });
  const m = { role: 'assistant', text: '', status: 'thinking' };
  chat.push(m);
  renderChat();
  const s = await AI.ready;
  if (!s) { m.status = 'done'; m.error = 'The assistant needs a model: open this page in Claude, or run Cueboard with your API key.'; renderChat(); if (opts.draft) { board().skipPrompt = false; updateEmpty(); } return; }
  AI.busy = true; setBusy(true); updateEmpty();
  const ctl = new AbortController(); AI.ctl = ctl;
  const startBoard = S.boardId;
  let changed = false;
  try {
    const turns = buildTurns(text, chat.slice(0, -2));
    const res = await s.json(turns, {
      signal: ctl.signal, cache: false, modelTier: AI.deep ? 'default' : 'quick',
      onText: ({ text: t }) => { const r = extractReply(t); if (r && r !== m.text) { m.text = r; m.status = 'streaming'; paintMsg(m); } }
    });
    let reply = '', acts = [];
    if (Array.isArray(res)) acts = res;
    else if (res && typeof res === 'object') { reply = typeof res.reply === 'string' ? res.reply : ''; acts = Array.isArray(res.actions) ? res.actions : []; }
    if (S.boardId !== startBoard) { m.text = reply; m.error = 'You switched boards while I was working, so nothing was changed.'; }
    else {
      const rc = applyActions(acts, opts);
      if (rc) { m.receipt = rc; changed = true; }
      m.text = reply || (rc ? 'Done.' : 'I didn’t change anything.');
      if (rc && opts.draft && narrow()) setTimeout(() => setAssistant(false, true), 900);
    }
  } catch (e) {
    const code = e && e.code;
    if (code === 'cancelled') { m.text = e.text ? extractReply(e.text) : ''; m.error = 'Stopped.'; }
    else {
      m.text = (code !== 'refused' && e && e.text) ? extractReply(e.text) : '';
      m.error = e && e.plain && e.message ? e.message : errCopy(code);
      if (OFF_CODES.includes(code)) AI.off = true; else if (!(e && e.plain)) m.retry = text;
    }
  } finally {
    m.status = 'done';
    AI.busy = false; AI.ctl = null; setBusy(false);
    if (opts.draft && !changed && board() && !board().elements.length) board().skipPrompt = false;
    renderChat(); updateEmpty();
  }
}
function setBusy(b) {
  asSend.textContent = '';
  asSend.append(ic(b ? 'stop' : 'send'), h('span', { class: 'lbl', text: b ? 'Stop' : 'Send' }));
  asSend.type = b ? 'button' : 'submit';
  asSend.classList.toggle('primary', !b);
}
asSend.addEventListener('click', e => { if (AI.busy) { e.preventDefault(); if (AI.ctl) AI.ctl.abort(); } });
function renderText(el, text) {
  el.textContent = '';
  let ul = null;
  for (const line of String(text || '').split('\n')) {
    const t = line.trim();
    if (/^[-•*]\s+/.test(t)) { if (!ul) { ul = h('ul'); el.append(ul); } ul.append(h('li', { text: t.replace(/^[-•*]\s+/, '') })); }
    else { ul = null; if (t) el.append(h('p', { text: t })); }
  }
}
function paintMsg(m) {
  if (!m.node) return;
  if (m.status === 'thinking') { m.node.textContent = ''; m.node.append(h('span', { class: 'thinking', text: 'Thinking' })); }
  else renderText(m.node, m.text);
  asMsgs.scrollTop = asMsgs.scrollHeight;
}
function sugBtn(label, fn) { return h('button', { class: 'sug', type: 'button', onclick: fn }, ic('spark'), h('span', { text: label })); }
function renderChat() {
  asMsgs.textContent = '';
  const chat = board() ? curChat() : [];
  asIn.disabled = AI.off; asSend.disabled = AI.off && !AI.busy;
  if (!chat.length) {
    const intro = h('div', { class: 'as-intro' });
    if (AI.off) {
      intro.append(h('p', {}, h('strong', { text: 'Your prep partner' })),
        h('div', { class: 'as-off' }, h('p', { text: 'The assistant needs a model. Open this page in Claude, or start Cueboard from a terminal where your API key is set:' }), h('code', { text: 'node scripts/serve.ts' }), h('p', { text: 'Everything else on the board works without it.' })));
    } else {
      const empty = !els().length;
      intro.append(h('p', {}, h('strong', { text: 'Your prep partner' }), 'It reads this board. Ask it to draft cards, turn rough notes into questions, chart numbers you give it, or poke holes before the call.'));
      const sugs = h('div', { class: 'sugs' });
      if (empty) sugs.append(sugBtn('Draft a board for my meeting…', () => { asIn.value = 'Draft a prep board for my meeting with '; asIn.focus(); autoGrow(); }));
      else {
        sugs.append(
          sugBtn('What questions am I missing?', () => ask('What important questions am I missing? Add the best ones to my questions list.')),
          sugBtn('Find the weak spots before the call', () => ask('Pressure-test this board. Where would a skeptical listener push back? Add rose notes for the objections with short answers.')),
          sugBtn('Write a 30-second opener from this board', () => ask('Write a 30-second opener from what is on this board and add it as a lilac Pitch card.')),
          sugBtn('Map who decides', () => ask('From the people on this board, add shapes for who decides and draw arrows for who influences whom. Use [placeholders] for anyone unknown.'))
        );
      }
      intro.append(sugs);
    }
    asMsgs.append(intro);
    return;
  }
  for (const m of chat) {
    if (m.role === 'user') { asMsgs.append(h('div', { class: 'msg user' }, h('div', { class: 'bubble', text: m.text }))); continue; }
    const body = h('div', { class: 'ai-text' }); m.node = body;
    const wrap = h('div', { class: 'msg ai' }, body);
    paintMsg(m);
    if (m.error) {
      const err = h('div', { class: 'ai-err', text: m.error + ' ' });
      if (m.retry && !AI.busy) err.append(h('button', { class: 'linkbtn', type: 'button', onclick: () => ask(m.retry) }, 'Try again'));
      wrap.append(err);
    }
    if (m.receipt) {
      const rc = m.receipt;
      const row = h('div', { class: 'receipt' }, ic('check'), h('span', { text: receiptText(rc) }));
      if (!rc.undone) row.append(h('button', { class: 'linkbtn', type: 'button', onclick: () => {
        if (S.boardId !== rc.boardId) { toast('Open that board to undo this change'); return; }
        pushUndo(); restore(rc.snap); rc.undone = true; renderChat();
      } }, 'Undo'));
      else row.append(h('span', { text: '· Undone' }));
      wrap.append(row);
    }
    asMsgs.append(wrap);
  }
  asMsgs.scrollTop = asMsgs.scrollHeight;
}
function updateCtx() {
  const el = S.multi.size === 1 && board() && byId(S.sel);
  if (!el || S.glance) { asCtx.hidden = true; return; }
  asCtx.textContent = '';
  asCtx.append(h('span', { text: 'About' }), h('b', { text: labelOf(el) || ({ note: 'this note', text: 'this text', card: 'this card', list: 'this checklist', chart: 'this chart', stat: 'this number', person: 'this person', timeline: 'this timeline', shape: 'this shape', image: 'this image', ink: 'this drawing' })[el.type] }),
    h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Ask about the whole board instead', title: 'Ask about the whole board', onclick: () => select(null) }, ic('close')));
  asCtx.hidden = false;
}
function setAssistant(open, quiet) {
  if (!quiet) S.asAuto = false;
  S.asOpen = open; asEl.hidden = !open;
  app.classList.toggle('as-open', open);
  $('#b-ai').classList.toggle('on', open); $('#b-ai').setAttribute('aria-pressed', String(open));
  if (!quiet) { try { localStorage.setItem('cueboard.as', open ? '1' : '0'); } catch (_) { } }
  if (open) { renderChat(); updateCtx(); }
  requestAnimationFrame(() => { positionSelTools(); positionPop(); if (open) clearOfPanel(); });
}
// The panel floats over the board, so opening it slides the board out from under it, or zooms
// out when the board is too wide to fit beside it.
function clearOfPanel() {
  if (narrow() || S.glance || !board() || !els().length) return;
  const r = rectOf(els()); if (!r) return;
  const z = S.view.z, left = r.x * z + S.view.x, right = (r.x + r.w) * z + S.view.x;
  const limit = canvas.clientWidth - 396 - 28;
  if (right <= limit) return;
  if (right - limit <= left - 28) setView({ x: S.view.x - (right - limit), y: S.view.y, z }, true);
  else fitAll(true);
}
function autoGrow() { asIn.style.height = 'auto'; asIn.style.height = Math.min(180, asIn.scrollHeight + 2) + 'px'; }
asIn.addEventListener('input', autoGrow);
asIn.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#as-form').requestSubmit ? $('#as-form').requestSubmit() : submitAsk(); } });
function submitAsk() { const t = asIn.value.trim(); if (!t || AI.busy) return; asIn.value = ''; autoGrow(); ask(t); }
$('#as-form').addEventListener('submit', e => { e.preventDefault(); submitAsk(); });
$('#as-close').addEventListener('click', () => setAssistant(false));
$('#b-ai').addEventListener('click', () => setAssistant(!S.asOpen));

/* ================= toast ================= */
let toastT = null;
function toast(msg, action) {
  toastEl.textContent = '';
  toastEl.append(h('span', { text: msg }));
  if (action) toastEl.append(h('button', { class: 'btn', type: 'button', onclick: () => { hideToast(); action.fn(); } }, action.label));
  toastEl.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(hideToast, 4200);
}
function hideToast() { toastEl.hidden = true; }

/* ================= pointer input ================= */
let drag = null, pinch = null;
const pointers = new Map();
const SNAP = 6;
const HOLD_MS = 450;
const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { } };
function clearHold() { clearTimeout(S.holdTimer); S.holdTimer = 0; }
function pressRing(p) {
  const r = h('div', { class: 'press-ring', style: `left:${p.x}px;top:${p.y}px` });
  overlay.append(r); setTimeout(() => r.remove(), 600);
}
// On touch, a quick drag on empty canvas pans; press and hold first, then drag, to draw a selection box.
function holdToMarquee() {
  if (!drag || drag.kind !== 'pan' || drag.moved) return;
  const p = toWorld(drag.sx, drag.sy);
  drag = { kind: 'marquee', sx: drag.sx, sy: drag.sy, wx: p.x, wy: p.y, base: drag.base || new Set(), moved: false, last: '' };
  canvas.classList.remove('panning');
  pressRing(p); buzz();
}

// Line up edges and centers with nearby items while dragging. Hold Option/Alt to place freely.
function snapFor(starts, ddx, ddy) {
  const moving = starts.map(s => ({ x: s.bx + ddx, y: s.by + ddy, w: s.bw, h: s.bh }));
  const bb = { x: Math.min(...moving.map(m => m.x)), y: Math.min(...moving.map(m => m.y)) };
  bb.w = Math.max(...moving.map(m => m.x + m.w)) - bb.x; bb.h = Math.max(...moving.map(m => m.y + m.h)) - bb.y;
  const ids = new Set(starts.map(s => s.id));
  const vr = { x: -S.view.x / S.view.z, y: -S.view.y / S.view.z, w: canvas.clientWidth / S.view.z, h: canvas.clientHeight / S.view.z };
  const others = els().filter(e => !ids.has(e.id)).map(boxOf)
    .filter(o => o.x < vr.x + vr.w && o.x + o.w > vr.x && o.y < vr.y + vr.h && o.y + o.h > vr.y);
  const tol = SNAP / S.view.z;
  let bx = null, by = null;
  const mx = [bb.x, bb.x + bb.w / 2, bb.x + bb.w], my = [bb.y, bb.y + bb.h / 2, bb.y + bb.h];
  for (const o of others) {
    for (const t of [o.x, o.x + o.w / 2, o.x + o.w]) for (const c of mx) { const d = t - c; if (Math.abs(d) <= tol && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: t }; }
    for (const t of [o.y, o.y + o.h / 2, o.y + o.h]) for (const c of my) { const d = t - c; if (Math.abs(d) <= tol && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: t }; }
  }
  const dx = bx ? bx.d : 0, dy = by ? by.d : 0;
  const fb = { x: bb.x + dx, y: bb.y + dy, w: bb.w, h: bb.h };
  const guides = [];
  const near = (a, b) => Math.abs(a - b) < 0.5;
  if (bx) {
    const hits = others.filter(o => [o.x, o.x + o.w / 2, o.x + o.w].some(t => near(t, bx.at)));
    guides.push({ v: true, at: bx.at, from: Math.min(fb.y, ...hits.map(o => o.y)) - 8, to: Math.max(fb.y + fb.h, ...hits.map(o => o.y + o.h)) + 8 });
  }
  if (by) {
    const hits = others.filter(o => [o.y, o.y + o.h / 2, o.y + o.h].some(t => near(t, by.at)));
    guides.push({ v: false, at: by.at, from: Math.min(fb.x, ...hits.map(o => o.x)) - 8, to: Math.max(fb.x + fb.w, ...hits.map(o => o.x + o.w)) + 8 });
  }
  return { dx, dy, guides };
}
function elementAt(cx, cy, except) {
  const stack = document.elementsFromPoint(cx, cy);
  for (const n of stack) {
    const node = n.closest && n.closest('#world .el');
    if (node && node.dataset.id !== except) return node.dataset.id;
  }
  return null;
}
function markLinkTarget(id) {
  if (S.linkHover === id) return;
  if (S.linkHover) { const n = nodes.get(S.linkHover); if (n) n.classList.remove('link-target'); }
  S.linkHover = id;
  if (id) { const n = nodes.get(id); if (n) n.classList.add('link-target'); }
}
// Capture can fail if the pointer has already gone (a pen lifted mid-event); the drag still works without it.
function capture(id) { try { canvas.setPointerCapture(id); } catch (_) { } }
function startPan(e, tap) {
  drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, moved: false, tap };
  capture(e.pointerId); canvas.classList.add('panning');
}
function startRotate(e) {
  const list = selected(); if (!list.length) return;
  const c = list.length === 1 ? (f => ({ x: f.cx, y: f.cy }))(frameOf(list[0])) : (b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }))(unionBox(list.map(boxOf)));
  const p = toWorld(e.clientX, e.clientY);
  drag = {
    kind: 'rotate', c, a0: Math.atan2(p.y - c.y, p.x - c.x), sx: e.clientX, sy: e.clientY, moved: false,
    starts: list.map(x => { const s = sizeOf(x); return { id: x.id, cx: x.x + s.w / 2, cy: x.y + s.h / 2, w: s.w, h: s.h, rot: x.rot || 0 }; }),
  };
  capture(e.pointerId);
}
// Catch at 0°, 45° and 90° within 3°; Shift turns in 15° steps.
const snapAngle = (a, shift) => (shift ? Math.round(a / 15) * 15 : Math.abs(a - Math.round(a / 45) * 45) < 3 ? Math.round(a / 45) * 45 : a);
function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeMenu();
  if (pointers.size === 2) { clearHold(); const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: Object.assign({}, S.view) }; drag = null; hideMarquee(); inkLayer.textContent = ''; return; }
  if (pointers.size > 2) return;
  S.allowNative = false;
  clearHold();
  const touch = e.pointerType === 'touch';
  if (touch !== !!S.touchUI) { S.touchUI = touch; if (!touch) S.touchAdd = false; updateSelTools(); }
  const t = e.target;
  if (e.button === 1 || S.space) { e.preventDefault(); startPan(e, null); return; }

  if (S.pen && !S.glance) {
    e.preventDefault();
    if (S.pen.tool === 'eraser') { drag = { kind: 'erase', pushed: false, moved: true }; eraseAt(e.clientX, e.clientY, drag); }
    else { const q = toWorld(e.clientX, e.clientY); drag = { kind: 'draw', pts: [+q.x.toFixed(1), +q.y.toFixed(1)], moved: true }; showTempStroke(drag.pts); }
    capture(e.pointerId); return;
  }

  if (!S.glance) {
    if (t.closest && t.closest('.cdot') && S.sel) {
      e.preventDefault();
      drag = { kind: 'link', from: S.sel, sx: e.clientX, sy: e.clientY, moved: false };
      S.tempLink = { from: { id: S.sel }, to: toWorld(e.clientX, e.clientY) };
      capture(e.pointerId); return;
    }
    const lend = t.closest && t.closest('.lend');
    if (lend && S.selLink) {
      e.preventDefault(); pushUndo();
      drag = { kind: 'lend', link: S.selLink, end: lend.getAttribute('data-end'), sx: e.clientX, sy: e.clientY, moved: false };
      capture(e.pointerId); return;
    }
    const lg = t.closest && t.closest('[data-link]');
    if (lg) { e.preventDefault(); blurField(); selectLink(lg.getAttribute('data-link')); drag = null; return; }
    if (t.closest && t.closest('.rot-handle') && S.multi.size) { e.preventDefault(); blurField(); startRotate(e); return; }
  }

  const node = t.closest && t.closest('.el');
  if (node) {
    const el = byId(node.dataset.id); if (!el) return;
    if (S.glance) {
      if (t.closest('.check')) { S.allowNative = true; return; }
      e.preventDefault();
      startPan(e, el.id); canvas.classList.remove('panning'); return;
    }
    if (t.closest('button, input, textarea')) { S.allowNative = true; return; }
    const handle = t.closest('.handle');
    if (handle) {
      e.preventDefault(); select(el.id);
      // ⌘-drag a corner to rotate, as in Freeform.
      if (e.metaKey && handle.dataset.dir.length === 2) { startRotate(e); return; }
      pushUndo();
      const s = sizeOf(el), hh = FIXED_H.has(el.type) ? el.h : Math.max(el.h, s.h);
      drag = { kind: 'resize', dir: handle.dataset.dir, id: el.id, node, sx: e.clientX, sy: e.clientY, w: el.w, h: hh, cx: el.x + el.w / 2, cy: el.y + hh / 2, moved: false };
      capture(e.pointerId); return;
    }
    const f = t.closest('.f');
    if (f && document.activeElement === f) { S.allowNative = true; return; }
    e.preventDefault();
    const wasSolo = S.multi.size === 1 && S.sel === el.id;
    blurField();
    // "Select more" (touch) turns taps into Shift-clicks.
    const additive = e.shiftKey || e.metaKey || e.ctrlKey || (S.touchAdd && touch);
    // Clicking any member of a group picks up the whole group.
    const unit = el.group && el.group !== S.inGroup ? membersOf(el.group).map(m => m.id) : [el.id];
    if (additive) {
      const all = unit.every(id => S.multi.has(id));
      const next = new Set(S.multi);
      for (const id of unit) { if (all) next.delete(id); else next.add(id); }
      setSelection([...next], all ? null : el.id);
      if (all) return;
    } else if (!S.multi.has(el.id)) setSelection(unit, el.id);
    else S.sel = el.id;
    // Pressing on part of a bigger selection keeps it, so the whole lot can be dragged;
    // a click that doesn't move narrows the selection to what was clicked.
    const narrowTo = !additive && S.multi.size > unit.length ? unit : null;
    const starts = selected().map(x => { const b = boxOf(x); return { id: x.id, x: x.x, y: x.y, bx: b.x, by: b.y, bw: b.w, bh: b.h }; });
    drag = { kind: 'move', starts, sx: e.clientX, sy: e.clientY, moved: false, edit: wasSolo && !additive && f ? f : null, narrowTo, target: el.id };
    // On touch, press and hold an item to start selecting several; then tap more to add them.
    if (touch && !S.touchAdd) {
      S.holdTimer = setTimeout(() => {
        if (!drag || drag.kind !== 'move' || drag.moved) return;
        S.touchAdd = true; drag.narrowTo = null; drag.edit = null;
        buzz(); updateSelTools(); toast('Tap more items to add them. Tap empty canvas when you’re done.');
      }, HOLD_MS);
    }
    capture(e.pointerId); return;
  }

  e.preventDefault();
  if (S.glance) { startPan(e, null); return; }
  blurField(); closePop();
  if (!touch) {
    const base = e.shiftKey ? new Set(S.multi) : new Set();
    if (!e.shiftKey) setSelection([]);
    const p = toWorld(e.clientX, e.clientY);
    drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY, wx: p.x, wy: p.y, base, moved: false, last: '' };
    capture(e.pointerId); return;
  }
  // Touch: keep the selection while deciding between a pan, a tap (clears it) and press-and-hold (selection box).
  startPan(e, null);
  drag.touchTap = true;
  drag.base = S.touchAdd ? new Set(S.multi) : new Set();
  S.holdTimer = setTimeout(holdToMarquee, HOLD_MS);
}
function onMove(e) {
  const p = pointers.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    S.viewTouched = true;
    const r = canvas.getBoundingClientRect(), z = clamp(pinch.v.z * d / pinch.d, ZMIN, ZMAX), k = z / pinch.v.z;
    setView({ z, x: (mx - r.left) - (pinch.mx - r.left - pinch.v.x) * k, y: (my - r.top) - (pinch.my - r.top - pinch.v.y) * k });
    return;
  }
  if (!drag) return;
  if (drag.kind === 'draw') {
    const minStep = 0.8 / S.view.z, pts = drag.pts;
    const batch = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of batch.length ? batch : [e]) {
      const q = toWorld(ev.clientX, ev.clientY);
      if (Math.hypot(q.x - pts[pts.length - 2], q.y - pts[pts.length - 1]) >= minStep) pts.push(+q.x.toFixed(1), +q.y.toFixed(1));
    }
    if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag && drag.kind === 'draw') { drag.raf = 0; showTempStroke(drag.pts); } });
    return;
  }
  if (drag.kind === 'erase') { eraseAt(e.clientX, e.clientY, drag); return; }
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  // Fingers wobble: touch needs a bigger move before it counts as a drag.
  if (!drag.moved && Math.hypot(dx, dy) < (e.pointerType === 'touch' ? 9 : 4)) return;
  if (!drag.moved) {
    drag.moved = true;
    clearHold();
    if (drag.kind === 'move') { pushUndo(); drag.edit = null; document.body.classList.add('dragging'); updateOverlay(); }
    if (drag.kind === 'rotate') { pushUndo(); document.body.classList.add('rotating'); }
    if (drag.kind === 'resize') updateOverlay();
  }
  const z = S.view.z;
  if (drag.kind === 'move') {
    let mx = dx / z, my = dy / z;
    if (!e.altKey) { const s = snapFor(drag.starts, mx, my); mx += s.dx; my += s.dy; showGuides(s.guides); } else showGuides([]);
    for (const s of drag.starts) { const el = byId(s.id); if (el) moveTo(el, s.x + mx, s.y + my); }
    renderLinks(); positionSelTools(); updateOverlay();
  } else if (drag.kind === 'rotate') {
    const q = toWorld(e.clientX, e.clientY), c = drag.c, one = drag.starts.length === 1;
    let d = (Math.atan2(q.y - c.y, q.x - c.x) - drag.a0) / RAD;
    d = one ? snapAngle(drag.starts[0].rot + d, e.shiftKey) - drag.starts[0].rot : snapAngle(d, e.shiftKey);
    const cos = Math.cos(d * RAD), sin = Math.sin(d * RAD);
    for (const s of drag.starts) {
      const el = byId(s.id); if (!el) continue;
      const rx = s.cx - c.x, ry = s.cy - c.y;
      const r = normAngle(s.rot + d); if (r) el.rot = r; else delete el.rot;
      moveTo(el, c.x + rx * cos - ry * sin - s.w / 2, c.y + rx * sin + ry * cos - s.h / 2);
      applyRot(nodes.get(el.id), el);
    }
    showAngle(q, one ? normAngle(drag.starts[0].rot + d) : normAngle(d));
    renderLinks(); positionSelTools(); updateOverlay();
  } else if (drag.kind === 'resize') {
    const el = byId(drag.id); if (!el) return;
    const m = MIN[el.type], d = drag.dir, a = (el.rot || 0) * RAD, cos = Math.cos(a), sin = Math.sin(a);
    // Pointer movement in the item's own (possibly rotated) frame.
    const lx = (dx / z) * cos + (dy / z) * sin, ly = -(dx / z) * sin + (dy / z) * cos;
    let w = drag.w, hh = drag.h;
    if (d.includes('e')) w = Math.max(m.w, drag.w + lx);
    if (d.includes('w')) w = Math.max(m.w, drag.w - lx);
    if (d.includes('s')) hh = Math.max(m.h, drag.h + ly);
    if (d.includes('n')) hh = Math.max(m.h, drag.h - ly);
    // Images and drawings keep their proportions; Shift frees them. Other items: Shift keeps them.
    if (d.length === 2 && (KEEP_RATIO.has(el.type) ? !e.shiftKey : e.shiftKey)) { const k = Math.max(w / drag.w, hh / drag.h); w = Math.max(m.w, drag.w * k); hh = Math.max(m.h, drag.h * k); }
    if (el.type === 'text') hh = drag.h;
    // The opposite side stays put: the center moves half the change, along the item's own axes.
    const ox = (d.includes('e') ? 1 : d.includes('w') ? -1 : 0) * (w - drag.w) / 2;
    const oy = (d.includes('s') ? 1 : d.includes('n') ? -1 : 0) * (hh - drag.h) / 2;
    const cx = drag.cx + ox * cos - oy * sin, cy = drag.cy + ox * sin + oy * cos;
    el.w = Math.round(w); if (el.type !== 'text') el.h = Math.round(hh);
    moveTo(el, cx - w / 2, cy - hh / 2); applySize(drag.node, el);
    if ((el.type === 'chart' || el.type === 'shape' || el.type === 'timeline' || el.type === 'ink') && !drag.raf) drag.raf = requestAnimationFrame(() => { if (drag) drag.raf = 0; refreshChart(el); });
    renderLinks(); positionSelTools(); updateOverlay();
  } else if (drag.kind === 'pan') {
    S.viewTouched = true;
    setView({ x: drag.vx + dx, y: drag.vy + dy, z: S.view.z });
  } else if (drag.kind === 'marquee') {
    const q = toWorld(e.clientX, e.clientY);
    const r = { x: Math.min(drag.wx, q.x), y: Math.min(drag.wy, q.y), w: Math.abs(q.x - drag.wx), h: Math.abs(q.y - drag.wy) };
    showMarquee(r);
    const hit = els().filter(el => { const b = boxOf(el); return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y; }).map(el => el.id);
    const ids = expandGroups([...new Set([...drag.base, ...hit])]);
    const key = ids.join(',');
    if (key !== drag.last) { drag.last = key; setSelection(ids); }
  } else if (drag.kind === 'link') {
    S.tempLink.to = toWorld(e.clientX, e.clientY);
    markLinkTarget(elementAt(e.clientX, e.clientY, drag.from));
    renderLinks();
  } else if (drag.kind === 'lend') {
    const l = linkById(drag.link); if (!l) return;
    const other = l[drag.end === 'from' ? 'to' : 'from'];
    const target = elementAt(e.clientX, e.clientY, other.id);
    markLinkTarget(target);
    l[drag.end] = target ? { id: target } : toWorld(e.clientX, e.clientY);
    renderLinks(); positionSelTools();
  }
}
function onUp(e, cancelled) {
  pointers.delete(e.pointerId);
  clearHold();
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  if (!drag) return;
  const d = drag; drag = null;
  canvas.classList.remove('panning'); document.body.classList.remove('dragging', 'rotating');
  showGuides([]); hideMarquee();
  if (d.kind === 'link' || d.kind === 'lend') markLinkTarget(null);
  if (d.kind === 'draw') { if (d.raf) cancelAnimationFrame(d.raf); showTempStroke(null); if (!cancelled) finishStroke(d.pts); return; }
  if (d.kind === 'erase') { if (eraserDot) { eraserDot.remove(); eraserDot = null; } return; }
  if (cancelled) { S.tempLink = null; renderLinks(); updateOverlay(); return; }
  if (d.kind === 'move') {
    if (d.moved) scheduleSave();
    else if (d.narrowTo) setSelection(d.narrowTo, d.target);
    else if (d.edit) placeCaret(e.clientX, e.clientY, d.edit);
    updateOverlay();
  } else if (d.kind === 'rotate') { hideAngle(); if (d.moved) scheduleSave(); updateOverlay(); updateSelTools(); } else if (d.kind === 'resize') { const el = byId(d.id); if (el) refreshChart(el); scheduleSave(); updateOverlay(); }
  else if (d.kind === 'pan' && !d.moved && S.glance) { if (d.tap) focusEl(d.tap); else if (S.focused) unfocus(); else fitAll(true); }
  else if (d.kind === 'pan' && !d.moved && d.touchTap) setSelection([]);
  else if (d.kind === 'link') {
    const target = S.linkHover || (d.moved ? elementAt(e.clientX, e.clientY, d.from) : null);
    const to = target ? { id: target } : S.tempLink.to;
    S.tempLink = null;
    const far = target || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 30;
    if (d.moved && far) {
      const l = normalizeLink({ from: { id: d.from }, to, arrow: 'end' }, new Set(els().map(x => x.id)));
      if (l) { pushUndo(); links().push(l); scheduleSave(); selectLink(l.id); return; }
    }
    renderLinks(); updateOverlay();
  } else if (d.kind === 'lend') {
    const l = linkById(d.link);
    if (l && l.from.id && l.from.id === l.to.id) { board().links = links().filter(x => x !== l); S.selLink = null; }
    renderLinks(); updateSelTools(); scheduleSave();
  }
}
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', e => onUp(e, false));
canvas.addEventListener('pointercancel', e => onUp(e, true));
canvas.addEventListener('mousedown', e => { if (!S.allowNative && e.target.closest && e.target.closest('.el')) e.preventDefault(); });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  S.viewTouched = true;
  const r = canvas.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0125));
  else { const m = e.deltaMode === 1 ? 16 : 1; setView({ x: S.view.x - e.deltaX * m, y: S.view.y - e.deltaY * m, z: S.view.z }); }
}, { passive: false });
canvas.addEventListener('dblclick', e => {
  if (S.glance || S.pen) return;
  const node = e.target.closest && e.target.closest('.el');
  if (node) {
    const el = byId(node.dataset.id); if (!el) return;
    // Double-click into a group to work on one member; Esc steps back out.
    if (el.group) S.inGroup = el.group;
    select(el.id);
    updateOverlay();
    const f = e.target.closest('.f') || node.querySelector('.f');
    if (f && document.activeElement !== f) placeCaret(e.clientX, e.clientY, f);
    return;
  }
  const lg = e.target.closest && e.target.closest('[data-link]');
  if (lg) { selectLink(lg.getAttribute('data-link')); editLinkLabel(lg.getAttribute('data-link')); return; }
  const p = toWorld(e.clientX, e.clientY);
  addEl('note', {}, { x: p.x - 110, y: p.y - 95 });
});
[stage, canvas].forEach(el => el.addEventListener('scroll', () => { el.scrollTop = 0; el.scrollLeft = 0; }));
// Drop image files anywhere on the canvas.
canvas.addEventListener('dragover', e => {
  if (S.glance || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; canvas.classList.add('dropping');
});
canvas.addEventListener('dragleave', e => { if (e.target === canvas) canvas.classList.remove('dropping'); });
canvas.addEventListener('drop', e => {
  canvas.classList.remove('dropping');
  if (S.glance || !e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  importImages(e.dataTransfer.files, toWorld(e.clientX, e.clientY));
});

/* ---------- editing ---------- */
world.addEventListener('focusin', e => {
  const f = e.target.closest && e.target.closest('.f'); if (!f) return;
  const id = f.closest('.el').dataset.id;
  if (!(S.multi.size === 1 && S.sel === id)) select(id);
  if (S.editEl !== id) { pushUndo(); S.editEl = id; }
});
world.addEventListener('input', e => {
  const f = e.target.closest && e.target.closest('.f'); if (!f) return;
  updateFieldModel(f); positionSelTools(); renderLinks(); scheduleSave();
});
world.addEventListener('focusout', e => {
  const f = e.target.closest && e.target.closest('.f'); if (!f) return;
  updateFieldModel(f);
  if (f.dataset.single && /\n/.test(f.textContent)) f.textContent = readField(f).replace(/\s*\n\s*/g, ' ');
  const el = byId(f.closest('.el').dataset.id);
  if (el && el.type === 'chart') updateSelTools();
  if (S.glance) buildChips();
  updateCtx(); updateOverlay(); scheduleSave();
});
world.addEventListener('paste', e => {
  const f = e.target.closest && e.target.closest('.f'); if (!f) return;
  e.stopPropagation();
  if (PT && !f.dataset.single) return;
  e.preventDefault();
  let t = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
  if (f.dataset.single) t = t.replace(/\s*\n\s*/g, ' ');
  document.execCommand('insertText', false, t);
});
world.addEventListener('keydown', e => {
  const f = e.target.closest && e.target.closest('.f'); if (!f) return;
  if (e.key === 'Escape') { e.preventDefault(); f.blur(); return; }
  const node = f.closest('.el'), el = byId(node.dataset.id); if (!el) return;
  const rows = f.dataset.field === 'item' ? el.items : f.dataset.field === 'line' ? el.lines : null;
  if (rows) {
    const i = +f.dataset.i, fieldName = f.dataset.field;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault(); updateFieldModel(f);
      rows.splice(i + 1, 0, fieldName === 'item' ? { text: '', done: false } : { text: '' });
      rerender(el); focusField(el.id, fieldName, i + 1); scheduleSave();
    } else if (e.key === 'Backspace' && readField(f) === '' && rows.length > 1) {
      e.preventDefault(); rows.splice(i, 1); rerender(el);
      if (i > 0) focusField(el.id, fieldName, i - 1); else { const t2 = nodes.get(el.id).querySelector('[data-field="title"], [data-field="name"]'); placeCaret(null, null, t2); }
      scheduleSave();
    }
    return;
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); f.blur(); return; }
  if (e.key === 'Enter' && f.dataset.single && !e.isComposing) {
    e.preventDefault();
    const fs = [...node.querySelectorAll('.f')], k = fs.indexOf(f);
    if (fs[k + 1]) placeCaret(null, null, fs[k + 1]); else f.blur();
  }
});
world.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button'); if (!b) return;
  const node = b.closest('.el'), el = node && byId(node.dataset.id); if (!el) return;
  if (b.classList.contains('check')) {
    const i = +b.dataset.i; if (!el.items[i]) return;
    pushUndo(); el.items[i].done = !el.items[i].done;
    rerender(el); scheduleSave();
  } else if (b.classList.contains('add-line')) {
    pushUndo(); el.lines.push({ text: '' });
    rerender(el); focusField(el.id, 'line', el.lines.length - 1); scheduleSave();
  } else if (b.classList.contains('add-item')) {
    pushUndo(); el.items.push({ text: '', done: false });
    rerender(el); focusField(el.id, 'item', el.items.length - 1); scheduleSave();
  }
});

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  const t = e.target;
  const typing = t && t.closest && t.closest('input, textarea, [contenteditable]');
  const mod = e.metaKey || e.ctrlKey, key = (e.key || '').toLowerCase();
  if (typing) return;
  if ((e.key === 'Enter' || e.key === ' ') && t.closest && t.closest('button')) return;
  if (e.key === ' ') { e.preventDefault(); if (!S.space) { S.space = true; canvas.classList.add('space'); } return; }
  if (e.key === 'Escape') {
    if (!menu.hidden) { closeMenu(); return; }
    if (S.pen) { exitPen(); return; }
    if (S.pop) { closePop(); return; }
    if (S.alignOpen) { S.alignOpen = false; updateSelTools(); return; }
    if (S.glance) { if (S.focused) unfocus(); else exitGlance(); return; }
    if (S.inGroup) { const g = S.inGroup; S.inGroup = null; setSelection(membersOf(g).map(m => m.id)); return; }
    if (S.multi.size || S.selLink) { setSelection([]); return; }
    return;
  }
  if (!mod && key === 'f' && !S.pen) { e.preventDefault(); toggleFloat(); return; }
  if (S.glance) { if (e.key === '/') { e.preventDefault(); gQ.focus(); } return; }
  if (S.pen && !mod) {
    if (key === 'p') { S.pen.tool = 'pen'; app.dataset.tool = 'pen'; renderPenbar(); }
    if (key === 'h') { S.pen.tool = 'hl'; app.dataset.tool = 'hl'; renderPenbar(); }
    if (key === 'e') { S.pen.tool = 'eraser'; app.dataset.tool = 'eraser'; renderPenbar(); }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && (S.multi.size || S.selLink)) { e.preventDefault(); deleteSelection(); }
  else if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (mod && key === 'y') { e.preventDefault(); redo(); }
  else if (mod && key === 'g' && S.multi.size) { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); }
  else if (mod && key === 'd' && S.multi.size) { e.preventDefault(); duplicateSelection(); }
  else if (mod && key === 'a') { e.preventDefault(); setSelection(els().map(x => x.id)); }
  else if (mod && key === 'c' && S.multi.size) { if (copySelection(false)) e.preventDefault(); }
  else if (mod && key === 'x' && S.multi.size) { if (copySelection(true)) e.preventDefault(); }
  else if (mod && key === 'v' && S.clip && !S.clipStale) { e.preventDefault(); pasteClip(); }
  else if (mod && (e.key === ']' || (e.shiftKey && key === 'f')) && S.multi.size) { e.preventDefault(); reorder(true); }
  else if (mod && (e.key === '[' || (e.shiftKey && key === 'b')) && S.multi.size) { e.preventDefault(); reorder(false); }
  else if (e.key.startsWith('Arrow') && S.multi.size) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    nudgeSel(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
  }
  else if (e.key === 'Enter' && S.multi.size === 1) { const n = nodes.get(S.sel), f = n && n.querySelector('.f'); if (f) { e.preventDefault(); placeCaret(null, null, f); } }
  else if (e.key === 'Enter' && S.selLink) { e.preventDefault(); editLinkLabel(S.selLink); }
});
document.addEventListener('keyup', e => { if (e.key === ' ') { S.space = false; canvas.classList.remove('space'); } });
// Copying something in another app should win over what was copied on the board.
window.addEventListener('blur', () => { S.space = false; canvas.classList.remove('space'); if (S.clip) S.clipStale = true; });
document.addEventListener('paste', e => {
  const t = e.target;
  if (S.glance || (t && t.closest && t.closest('input, textarea, [contenteditable]'))) return;
  const files = e.clipboardData ? [...e.clipboardData.files].filter(f => /^image\//.test(f.type)) : [];
  if (files.length) { e.preventDefault(); importImages(files); return; }
  const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  if (S.clip && S.clipText && text.trim() === S.clipText.trim()) { e.preventDefault(); S.clipStale = false; pasteClip(); return; }
  if (!text.trim()) return;
  e.preventDefault();
  pasteText(text);
});
document.addEventListener('pointerdown', e => {
  if (!menu.hidden && !menu.contains(e.target) && !$('#b-menu').contains(e.target) && !$('#empty-sample').contains(e.target)) closeMenu();
}, true);

/* ---------- chrome wiring ---------- */
// After a mouse click, toolbar buttons let go of focus, so holding Space to pan doesn't press them again.
// (Keyboard clicks have detail 0 and keep focus.)
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#dock .btn, #seltools .btn, #zoombar .btn, #tb-right .btn');
  if (b && e.detail > 0) b.blur();
}, true);
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { exitPen(); addEl(b.dataset.add); }));
$('#b-image').addEventListener('click', () => { exitPen(); filePick.click(); });
$('#b-draw').addEventListener('click', () => { if (S.pen) exitPen(); else enterPen(); });
$('#b-undo').addEventListener('click', undo);
$('#b-redo').addEventListener('click', redo);
$('#b-tidy').addEventListener('click', () => { if (!els().length) { toast('Nothing to tidy yet'); return; } tidy(true); });
$('#b-glance').addEventListener('click', () => { exitPen(); enterGlance(); });
$('#b-float').addEventListener('click', () => { exitPen(); toggleFloat(); });
$('#g-float').addEventListener('click', () => toggleFloat());
$('#b-menu').addEventListener('click', () => { if (menu.hidden) openMenu(); else closeMenu(); });
$('#z-in').addEventListener('click', () => zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.2));
$('#z-out').addEventListener('click', () => zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.2));
$('#z-reset').addEventListener('click', () => { const z = S.view.z; zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / z); });
$('#z-fit').addEventListener('click', () => fitAll(true));
titleIn.addEventListener('input', () => { board().title = titleIn.value.slice(0, 120) || 'Untitled meeting'; gTitle.textContent = board().title; scheduleSave(); });
titleIn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); titleIn.blur(); } });
titleIn.addEventListener('blur', () => { if (!titleIn.value.trim()) titleIn.value = board().title; });
emptyGo.addEventListener('click', () => {
  const t = emptyIn.value.trim();
  if (!t) { emptyIn.focus(); return; }
  board().skipPrompt = true; updateEmpty(); emptyIn.value = '';
  ask('Draft a prep board for this meeting:\n' + t, { draft: true });
});
emptyIn.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); emptyGo.click(); } });
$('#empty-skip').addEventListener('click', () => { board().skipPrompt = true; updateEmpty(); });
$('#empty-sample').addEventListener('click', () => openMenu('samples'));
$('#empty-paste').addEventListener('click', () => openSheet('prep'));
$('#b-notes').addEventListener('click', () => openSheet('notes'));
$('#b-today').addEventListener('click', () => openToday());
$('#g-done').addEventListener('click', exitGlance);
$('#g-time').addEventListener('click', tToggle);
$('#g-reset').addEventListener('click', () => { T.acc = 0; T.running = false; clearInterval(T.iv); tRender(); });
$('#g-len').addEventListener('click', () => { const opts = [15, 30, 45, 60, 90]; T.len = opts[(opts.indexOf(T.len) + 1) % opts.length]; tRender(); });
gQ.addEventListener('input', applySearch);
gQ.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); const id = applySearch(); if (id) focusEl(id); }
  else if (e.key === 'Escape') { e.preventDefault(); gQ.value = ''; applySearch(); gQ.blur(); }
});
gnote.addEventListener('submit', e => { e.preventDefault(); const v = gnoteIn.value.trim(); if (!v) return; gnoteIn.value = ''; addLiveNote(v); });
window.addEventListener('resize', () => { positionSelTools(); positionPop(); });
// A board opened while the page was hidden was fitted to a zero-size canvas; fit it again once it has a size.
let lastW = 0;
if (window.ResizeObserver) new ResizeObserver(() => {
  const w = canvas.clientWidth;
  if (lastW < 50 && w >= 50 && board()) fitAll(false);
  lastW = w;
}).observe(canvas);
document.addEventListener('gesturestart', e => e.preventDefault());

/* ================= boot ================= */
async function boot() {
  const ex = makeExample();
  S.boards[ex.id] = ex;
  setBusy(false);
  switchBoard(ex.id);
  Store.ready = Store.init();
  let wantAs = window.innerWidth >= 1180, stored = null;
  try { stored = localStorage.getItem('cueboard.as'); } catch (_) { }
  if (stored != null) wantAs = stored === '1' && !narrow(); else S.asAuto = wantAs;
  setAssistant(wantAs, true);
  setStatus('example');
  // Saved boards first (instant in this browser), so the board doesn't switch under someone
  // who has started looking around; then refit once fonts settle, unless they've moved the view.
  const saved = await Store.ready;
  Mem.ready = Mem.ready || loadMemory();
  granolaStatus().then(() => track('app_opened'));
  calendarBoot();
  demoStatus();
  Mem.ready.then(m => {
    if (!m || S.touched || !Engine || !Engine.todayModel) return;
    const t = Engine.todayModel(m, new Date().toISOString(), madeFor());
    if (t.sections.length) openToday();
  });
  if (saved.length) {
    for (const b of saved) {
      if (b.id === 'b-example' && S.touched) continue;
      S.boards[b.id] = b;
    }
    if (!S.touched) {
      const latest = saved.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!saved.some(b => b.id === 'b-example')) delete S.boards['b-example'];
      switchBoard(latest.id);
    }
  } else if (!S.touched) setStatus('example');
  try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1500)]); } catch (_) { }
  if (!S.touched && !S.viewTouched && board().autoFit) fitAll(false);
  S.booted = true;
  window.__cue = { S, els: () => els(), links: () => links() };
}
boot();
})();
