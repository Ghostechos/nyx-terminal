'use strict';

/* Nyx Terminal — intégration shell :
   - blocs de commandes façon Warp (OSC 133 : A prompt, B saisie, C exécution, D fin + code)
   - dossier courant (OSC 7, OSC 9;9, OSC 633;P)
   - notifications de fin de commande, ligatures de police */

/* global settings, theme, active, activePane, nyx, toast, fmtDuration, escapeHtml, setPaneCwd, platform, $ */

// ---------------------------------------------------------------------------
// Ligatures : on regroupe les séquences pour que la police les dessine en un seul glyphe
// ---------------------------------------------------------------------------

const LIGATURE_RE = /(?:<!--|-->|===|!==|<=>|\.\.\.|<-|->|=>|>=|<=|!=|==|&&|\|\||::|\/\/|\/\*|\*\/|\|>|<\||\?\?|\?\.|<\/|\/>)/g;

function applyLigatures(pane) {
  if (!pane.term) return;
  const want = settings.ligatures !== false;
  if (want && pane.joinerId == null) {
    pane.joinerId = pane.term.registerCharacterJoiner((text) => {
      const ranges = [];
      LIGATURE_RE.lastIndex = 0;
      let m;
      while ((m = LIGATURE_RE.exec(text))) ranges.push([m.index, m.index + m[0].length]);
      return ranges;
    });
    pane.term.refresh(0, pane.term.rows - 1);
  } else if (!want && pane.joinerId != null) {
    pane.term.deregisterCharacterJoiner(pane.joinerId);
    pane.joinerId = null;
    pane.term.refresh(0, pane.term.rows - 1);
  }
}

// ---------------------------------------------------------------------------
// Intégration shell
// ---------------------------------------------------------------------------

const ICONS = {
  copy: '<svg viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="2"/><path d="M10.5 5V3.8c0-.7-.6-1.3-1.3-1.3H3.8c-.7 0-1.3.6-1.3 1.3v5.4c0 .7.6 1.3 1.3 1.3H5"/></svg>',
  out: '<svg viewBox="0 0 16 16"><path d="M3 4h10M3 7h10M3 10h6"/><path d="M11 10.5l1.5 1.5 2-2.5"/></svg>',
  rerun: '<svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3h-3"/></svg>'
};

function parseOsc7(data) {
  const m = String(data).match(/^file:\/\/[^/]*(\/.*)$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// Git Bash renvoie /c/Users/... : on l'affiche en chemin Windows
function displayPath(pane, p) {
  if (platform === 'win32' && pane.profile.kind === 'bash') {
    const m = p.match(/^\/([a-zA-Z])(\/.*)?$/);
    if (m) return `${m[1].toUpperCase()}:${(m[2] || '/').replace(/\//g, '\\')}`;
  }
  return p;
}

function initPaneBlocks(pane) {
  const term = pane.term;
  pane.si = { blocks: [], cur: null, active: false, hasC: false };

  pane.layer = document.createElement('div');
  pane.layer.className = 'block-layer';
  pane.hl = document.createElement('div');
  pane.hl.className = 'block-hl hidden';
  pane.toolbar = document.createElement('div');
  pane.toolbar.className = 'block-toolbar hidden';
  pane.el.append(pane.layer, pane.hl, pane.toolbar);

  term.parser.registerOscHandler(133, (data) => { on133(pane, data); return true; });
  term.parser.registerOscHandler(633, (data) => {
    if (/^[ABCD](;|$)/.test(data)) on133(pane, data);
    else if (data.startsWith('P;Cwd=')) setPaneCwd(pane, data.slice(6));
    return true;
  });
  term.parser.registerOscHandler(7, (data) => {
    const p = parseOsc7(data);
    if (p) setPaneCwd(pane, displayPath(pane, p));
    return true;
  });
  term.parser.registerOscHandler(9, (data) => {
    if (!data.startsWith('9;')) return false;
    setPaneCwd(pane, data.slice(2).replace(/^"|"$/g, ''));
    return true;
  });

  term.onRender(() => scheduleBlocks(pane));
  term.onScroll(() => scheduleBlocks(pane));

  pane.el.addEventListener('mousemove', (e) => { pane.mouseY = e.clientY; hoverBlock(pane); });
  pane.el.addEventListener('mouseleave', () => { pane.mouseY = null; hideHover(pane); });
  pane.toolbar.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  pane.toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !pane.hoverBlock) return;
    toolbarAction(pane, pane.hoverBlock, btn.dataset.act);
  });
}

function disposePaneBlocks(pane) {
  if (!pane.si) return;
  cancelAnimationFrame(pane.blockFrame);
  for (const b of pane.si.blocks) disposeMarkers(b);
  pane.si.blocks = [];
}

function disposeMarkers(b) {
  for (const k of ['a', 'b', 'c', 'd']) { try { b[k] && b[k].dispose(); } catch { /* ignore */ } }
  if (b.el) { b.el.remove(); b.el = null; }
}

function dropBlock(pane, b) {
  disposeMarkers(b);
  pane.si.blocks = pane.si.blocks.filter((x) => x !== b);
  if (pane.si.cur === b) pane.si.cur = null;
}

function on133(pane, data) {
  const [type, arg] = String(data).split(';');
  const si = pane.si;
  const term = pane.term;
  const buf = term.buffer.active;
  si.active = true;

  switch (type) {
    case 'A': {
      if (si.cur && si.cur.state === 'prompt') dropBlock(pane, si.cur); // prompt réaffiché sans commande
      si.cur = { a: term.registerMarker(0), state: 'prompt' };
      si.blocks.push(si.cur);
      if (si.blocks.length > 400) dropBlock(pane, si.blocks[0]);
      break;
    }
    case 'B':
      if (si.cur && si.cur.state === 'prompt') { si.cur.b = term.registerMarker(0); si.cur.bx = buf.cursorX; }
      break;
    case 'C':
      if (si.cur && si.cur.state === 'prompt') {
        si.hasC = true;
        si.cur.c = term.registerMarker(0);
        si.cur.start = Date.now();
        si.cur.state = 'running';
        si.cur.command = readCommand(pane, si.cur).text;
        if (pane === activePane()) updateRunningStatus();
      }
      break;
    case 'D':
      finishBlock(pane, arg === undefined || arg === '' ? null : Number(arg));
      break;
    default:
      break;
  }
  scheduleBlocks(pane);
}

function readCommand(pane, b) {
  if (!b.b || b.b.isDisposed) return { text: '', end: -1 };
  const buf = pane.term.buffer.active;
  const start = b.b.line;
  let end = start;
  if (b.c && !b.c.isDisposed) end = Math.max(start, b.c.line - 1);
  else while (buf.getLine(end + 1) && buf.getLine(end + 1).isWrapped) end++;
  let text = '';
  for (let y = start; y <= end; y++) {
    const line = buf.getLine(y);
    if (!line) break;
    let s = line.translateToString(true);
    if (y === start) s = s.slice(b.bx || 0);
    text += (y > start && !line.isWrapped ? '\n' : '') + s;
  }
  return { text: text.trim(), end };
}

function readOutput(pane, b) {
  const buf = pane.term.buffer.active;
  const from = b.outStart;
  const to = b.d && !b.d.isDisposed ? b.d.line - 1 : buf.baseY + buf.cursorY;
  let text = '';
  for (let y = from; y <= to; y++) {
    const line = buf.getLine(y);
    if (!line) break;
    text += (y > from && !line.isWrapped ? '\n' : '') + line.translateToString(true);
  }
  return text.replace(/\s+$/, '');
}

function finishBlock(pane, code) {
  const si = pane.si;
  const b = si.cur;
  if (!b || b.state === 'done') return;
  b.d = pane.term.registerMarker(0);
  b.end = Date.now();

  if (b.state === 'prompt') {
    // Pas de séquence C : normal pour cmd.exe ; ailleurs c'est un Entrée vide ou un Ctrl+C
    if (si.hasC || !b.b) { dropBlock(pane, b); return; }
    const r = readCommand(pane, b);
    if (!r.text) { dropBlock(pane, b); return; }
    b.command = r.text;
    b.outStart = r.end + 1;
    b.code = code;
    b.start = null;
  } else {
    if (!b.command) { dropBlock(pane, b); return; }
    b.code = code;
    b.outStart = b.c.line;
  }
  b.state = 'done';
  si.cur = null;
  onBlockDone(pane, b);
}

const blockStatus = (b) => (b.state === 'running' ? 'running' : b.code === 0 ? 'ok' : b.code == null ? 'unknown' : 'err');
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function onBlockDone(pane, b) {
  const duration = b.start ? b.end - b.start : null;
  const status = blockStatus(b);

  if (pane.tab !== active && status !== 'unknown') {
    pane.tab.tabEl.classList.remove('activity', 'done-ok', 'done-err');
    pane.tab.tabEl.classList.add(status === 'ok' ? 'done-ok' : 'done-err');
  }

  const long = duration != null && duration >= (Number(settings.notifyAfterSeconds) || 10) * 1000;
  const away = !document.hasFocus() || pane.tab !== active;
  if (settings.notifications !== false && long && away) {
    nyx.notify({
      title: `${status === 'ok' ? '✅' : '❌'} ${truncate(b.command.split('\n')[0], 70)}`,
      body: `${status === 'ok' ? 'Terminée' : `Échec (code ${b.code})`} en ${fmtDuration(duration)} · ${pane.profile.name}`,
      paneId: pane.id
    });
  } else if (long && !away && status === 'err') {
    toast(`Échec (code ${b.code}) après ${fmtDuration(duration)}`);
  }
  if (pane === activePane()) updateRunningStatus();
}

// ---------------------------------------------------------------------------
// Affichage : barre colorée dans la marge gauche, surbrillance et barre d'outils au survol
// ---------------------------------------------------------------------------

function scheduleBlocks(pane) {
  if (pane.blockFrame) return;
  pane.blockFrame = requestAnimationFrame(() => {
    pane.blockFrame = 0;
    renderBlocks(pane);
    if (pane.mouseY != null) hoverBlock(pane);
  });
}

function blockRange(pane, b) {
  if (!b.a || b.a.isDisposed || b.a.line < 0 || b.state === 'prompt') return null;
  const buf = pane.term.buffer.active;
  const end = b.d && !b.d.isDisposed ? b.d.line - 1 : buf.baseY + buf.cursorY;
  return { start: b.a.line, end: Math.max(b.a.line, end) };
}

function measure(pane) {
  const term = pane.term;
  const screen = term.element && term.element.querySelector('.xterm-screen');
  if (!screen || !screen.offsetHeight) return null;
  const sr = screen.getBoundingClientRect();
  const pr = pane.el.getBoundingClientRect();
  return { cellH: sr.height / term.rows, y0: sr.top - pr.top, top: term.buffer.active.viewportY, rows: term.rows };
}

function renderBlocks(pane) {
  if (!pane || !pane.si || !pane.term) return;
  if (settings.commandBlocks === false) { pane.layer.replaceChildren(); hideHover(pane); return; }
  const g = measure(pane);
  if (!g) return;
  pane.geo = g;
  const bottom = g.top + g.rows - 1;
  const alive = [];
  for (const b of pane.si.blocks) {
    if (b.a && b.a.isDisposed) { disposeMarkers(b); continue; }
    alive.push(b);
    const r = blockRange(pane, b);
    if (!r || r.end < g.top || r.start > bottom) { if (b.el) { b.el.remove(); b.el = null; } continue; }
    const s = Math.max(r.start, g.top);
    const e = Math.min(r.end, bottom);
    if (!b.el) { b.el = document.createElement('div'); pane.layer.appendChild(b.el); }
    b.el.className = `block-bar ${blockStatus(b)}${r.start < g.top ? ' cut-top' : ''}${r.end > bottom ? ' cut-bottom' : ''}`;
    b.el.style.transform = `translateY(${g.y0 + (s - g.top) * g.cellH + 2}px)`;
    b.el.style.height = `${Math.max(4, (e - s + 1) * g.cellH - 4)}px`;
  }
  pane.si.blocks = alive;
}

function findBlock(pane, line) {
  for (let i = pane.si.blocks.length - 1; i >= 0; i--) {
    const b = pane.si.blocks[i];
    const r = blockRange(pane, b);
    if (r && line >= r.start && line <= r.end) return b;
  }
  return null;
}

function hoverBlock(pane) {
  if (settings.commandBlocks === false || !pane.geo || pane.mouseY == null || !pane.si.active) return;
  const rect = pane.el.getBoundingClientRect();
  const y = pane.mouseY - rect.top - pane.geo.y0;
  if (y < 0) { hideHover(pane); return; }
  const b = findBlock(pane, pane.geo.top + Math.floor(y / pane.geo.cellH));
  if (b) showHover(pane, b); else hideHover(pane);
}

function hideHover(pane) {
  if (!pane.hl) return;
  pane.hl.classList.add('hidden');
  pane.toolbar.classList.add('hidden');
  pane.hoverBlock = null;
}

function showHover(pane, b, flash = false) {
  const g = pane.geo || measure(pane);
  const r = blockRange(pane, b);
  if (!g || !r) return;
  const bottom = g.top + g.rows - 1;
  const s = Math.max(r.start, g.top);
  const e = Math.min(r.end, bottom);
  if (e < s) return;
  const status = blockStatus(b);
  const top = g.y0 + (s - g.top) * g.cellH;

  pane.hl.className = `block-hl ${status}${flash ? ' flash' : ''}`;
  pane.hl.style.transform = `translateY(${top}px)`;
  pane.hl.style.height = `${(e - s + 1) * g.cellH}px`;

  if (pane.hoverBlock !== b || flash || b.state !== pane.hoverState) {
    const label = status === 'running' ? '<i class="spinner"></i>En cours'
      : status === 'ok' ? '✓ Réussie' : status === 'err' ? `✗ Code ${b.code}` : '• Terminée';
    const ms = b.start ? (b.end || Date.now()) - b.start : 0;
    const time = ms >= 5 ? fmtDuration(ms) : '';
    const canRerun = !pane.exited && !(pane.si.cur && pane.si.cur.state === 'running');
    pane.toolbar.innerHTML = `
      <span class="bt-status ${status}">${label}</span>
      ${time ? `<span class="bt-time">${time}</span>` : ''}
      <span class="bt-cmd" title="${escapeHtml(b.command || '')}">${escapeHtml(truncate((b.command || '').split('\n')[0], 40))}</span>
      <button data-act="cmd" title="Copier la commande">${ICONS.copy}</button>
      ${status !== 'running' ? `<button data-act="out" title="Copier la sortie">${ICONS.out}</button>` : ''}
      ${canRerun && status !== 'running' ? `<button data-act="rerun" title="Relancer la commande">${ICONS.rerun}</button>` : ''}`;
    pane.hoverBlock = b;
    pane.hoverState = b.state;
  }
  pane.toolbar.style.transform = `translateY(${Math.max(2, top + (g.cellH - 24) / 2)}px)`;
  pane.hl.classList.remove('hidden');
  pane.toolbar.classList.remove('hidden');
}

function toolbarAction(pane, b, act) {
  if (act === 'cmd') { nyx.copy(b.command); toast('Commande copiée'); }
  else if (act === 'out') {
    const out = readOutput(pane, b);
    nyx.copy(out);
    toast(out ? `Sortie copiée (${out.split('\n').length} ligne${out.includes('\n') ? 's' : ''})` : 'Sortie vide');
  } else if (act === 'rerun' && pane.ptyId != null && !pane.exited) {
    nyx.write(pane.ptyId, b.command.replace(/\n/g, ' ') + '\r');
    pane.term.scrollToBottom();
  }
  pane.term.focus();
}

// Ctrl+↑ / Ctrl+↓ : saute au bloc précédent / suivant
function jumpToBlock(dir) {
  const pane = activePane();
  if (!pane || !pane.si || !pane.si.active || settings.commandBlocks === false) return false;
  const starts = pane.si.blocks.map((b) => ({ b, r: blockRange(pane, b) })).filter((x) => x.r);
  if (!starts.length) return false;
  const top = pane.term.buffer.active.viewportY;
  const target = dir < 0
    ? [...starts].reverse().find((x) => x.r.start < top)
    : starts.find((x) => x.r.start > top);
  if (!target) { if (dir > 0) pane.term.scrollToBottom(); else pane.term.scrollToTop(); return true; }
  pane.term.scrollToLine(target.r.start);
  requestAnimationFrame(() => {
    pane.geo = measure(pane);
    showHover(pane, target.b, true);
    setTimeout(() => { if (pane.mouseY == null) hideHover(pane); }, 900);
  });
  return true;
}

// Barre d'état : commande en cours dans le panneau actif
let runTimer = null;
function updateRunningStatus() {
  const el = $('#sb-running');
  if (!el) return;
  const p = activePane();
  const b = p && p.si && p.si.cur && p.si.cur.state === 'running' ? p.si.cur : null;
  if (!b) { el.classList.add('hidden'); clearInterval(runTimer); runTimer = null; return; }
  const ms = Date.now() - b.start;
  el.classList.toggle('hidden', ms < 1500);
  el.lastElementChild.textContent = `${truncate((b.command || '').split('\n')[0], 26)} · ${fmtDuration(ms).replace(/,\d/, '')}`;
  if (!runTimer) runTimer = setInterval(updateRunningStatus, 500);
}
