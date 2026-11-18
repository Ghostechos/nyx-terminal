'use strict';

/* Nyx Terminal — cœur de l'interface : thèmes, onglets, panneaux divisés, clavier, session.
   Les autres fichiers (blocks.js, palette.js, customize.js, servers.js) s'appuient sur ces fonctions. */

/* global Terminal, FitAddon, SearchAddon, WebLinksAddon, WebglAddon, NYX_THEMES, nyx,
          initPaneBlocks, disposePaneBlocks, renderBlocks, applyLigatures, updateRunningStatus,
          openPalette, closePalette, palette, openDrawer, drawerOpen, closeDrawer, openServerModal, modalOpen, closeModal,
          jumpToBlock */

const $ = (s) => document.querySelector(s);
const tabsEl = $('#tabs');
const indicator = $('#tab-indicator');
const termsEl = $('#terminals');
const menuEl = $('#profile-menu');
const searchEl = $('#search');
const searchInput = $('#search-input');
const searchCount = $('#search-count');
const sizeHud = $('#size-hud');
const toastEl = $('#toast');

let settings = null;
let profiles = [];
let platform = 'win32';
let homeDir = '';
let isQuake = false;
let fontSize = 14;
let theme = null;          // thème affiché (peut être un aperçu)
let savedThemeName = null; // thème enregistré

const tabs = [];
const panes = new Map();   // id -> pane
const byPty = new Map();   // id pty -> pane
const pendingData = new Map();
let active = null;         // onglet actif
let nextPaneId = 1;
let nextTabId = 1;
const searchState = { caseSensitive: false, regex: false };

const activePane = () => (active ? active.activePane : null);

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function fmtDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1).replace('.', ',') : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${Math.round(s % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const fileUrl = (p) => 'file:///' + encodeURI(String(p).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/^\/+/, '');

const isTranslucent = () => platform === 'win32' && !isQuake && settings.backgroundMaterial && settings.backgroundMaterial !== 'none';
const profileColor = (p) => (p && p.color) || theme.ui.accent;
const profileById = (id) => profiles.find((p) => p.id === id) || profiles.find((p) => p.id === settings.defaultProfile) || profiles[0];

// ---------------------------------------------------------------------------
// Thèmes et fond
// ---------------------------------------------------------------------------

const allThemes = () => ({ ...NYX_THEMES, ...(settings.customThemes || {}) });

function resolveTheme(name, withOverrides = true) {
  const all = allThemes();
  const base = all[name] || NYX_THEMES.aurora;
  return {
    id: all[name] ? name : 'aurora',
    name: base.name || name,
    light: !!base.light,
    custom: !!(settings.customThemes || {})[name],
    colors: { ...NYX_THEMES.aurora.colors, ...base.colors, ...(withOverrides ? settings.theme : {}) },
    ui: { ...NYX_THEMES.aurora.ui, ...base.ui, ...(withOverrides ? settings.ui : {}) }
  };
}

function xtermTheme(t) {
  return {
    ...t.colors,
    background: '#00000000', // fond dessiné par le CSS (couleur, halo, image)
    scrollbarSliderBackground: t.light ? '#00000026' : '#ffffff22',
    scrollbarSliderHoverBackground: t.light ? '#00000040' : '#ffffff38',
    scrollbarSliderActiveBackground: t.ui.accent.slice(0, 7) + '88',
    overviewRulerBorder: '#00000000'
  };
}

function applyTheme(t) {
  theme = t;
  const r = document.documentElement.style;
  r.setProperty('--bg', t.colors.background);
  r.setProperty('--tabbar', t.ui.tabBar);
  r.setProperty('--surface', t.ui.surface);
  r.setProperty('--accent', t.ui.accent);
  r.setProperty('--accent2', t.ui.accent2);
  r.setProperty('--text', t.ui.text);
  r.setProperty('--muted', t.ui.muted);
  r.setProperty('--ok', t.colors.green);
  r.setProperty('--err', t.colors.red);
  r.setProperty('--warn', t.colors.yellow);
  r.setProperty('--border', t.light ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.08)');
  r.setProperty('--hover', t.light ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)');
  r.setProperty('--shadow', t.light
    ? '0 18px 50px rgba(30,30,60,.18), 0 2px 8px rgba(30,30,60,.08)'
    : '0 18px 50px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3)');
  document.body.classList.toggle('light', t.light);
  document.body.classList.toggle('translucent', isTranslucent());
  if (!isTranslucent() && !isQuake) nyx.setOverlay(t.ui.tabBar, t.ui.text);

  const xt = xtermTheme(t);
  for (const p of panes.values()) if (p.term) p.term.options.theme = xt;
  for (const tab of tabs) refreshTabChrome(tab);
  applyBackground();
  updateIndicator();
  updateStatus();
}

function applyUiPrefs() {
  document.body.classList.toggle('no-statusbar', settings.statusBar === false);
  document.body.classList.toggle('no-anim', settings.animations === false);
  document.body.classList.toggle('no-glow', settings.backgroundGlow === false || isTranslucent());
  document.body.classList.toggle('no-dim', settings.dimInactivePanes === false);
  document.body.classList.toggle('no-blocks', settings.commandBlocks === false);
}

function setTheme(id, persist = true) {
  applyTheme(resolveTheme(id, id === settings.themeName));
  if (persist) {
    savedThemeName = id;
    nyx.updateSettings({ themeName: id, theme: {}, ui: {} });
    toast(`Thème : ${allThemes()[id].name || id}`);
  }
}

const GRADIENTS = {
  theme: { name: 'Couleurs du thème', css: (t) => `radial-gradient(120% 90% at 0% 0%, ${t.ui.accent} 0%, transparent 60%), radial-gradient(110% 90% at 100% 100%, ${t.ui.accent2} 0%, transparent 60%)` },
  aurore: { name: 'Aurore', css: () => 'linear-gradient(135deg, #00c9a7 0%, #2b6cb0 45%, #7b2ff7 100%)' },
  coucher: { name: 'Coucher de soleil', css: () => 'linear-gradient(135deg, #ff6b6b 0%, #f7b267 40%, #7b2ff7 100%)' },
  ocean: { name: 'Océan', css: () => 'linear-gradient(160deg, #0f2027 0%, #2c5364 50%, #00c9ff 100%)' },
  neon: { name: 'Néon', css: () => 'linear-gradient(135deg, #ff00cc 0%, #333399 100%)' },
  foret: { name: 'Forêt', css: () => 'linear-gradient(160deg, #134e5e 0%, #71b280 100%)' },
  braise: { name: 'Braise', css: () => 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
  minuit: { name: 'Minuit', css: () => 'linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }
};

function applyBackground(bg = settings.background) {
  const b = bg || {};
  const el = $('#bg-layer');
  const type = b.type === 'image' && !b.image ? 'none' : b.type || 'none';
  if (type === 'image') {
    el.style.backgroundImage = `url("${fileUrl(b.image)}")`;
    el.style.filter = `blur(${b.blur || 0}px) saturate(1.1)`;
  } else if (type === 'gradient') {
    el.style.backgroundImage = (GRADIENTS[b.gradient] || GRADIENTS.theme).css(theme);
    el.style.filter = 'none';
  } else {
    el.style.backgroundImage = 'none';
  }
  el.style.opacity = type === 'none' ? 0 : clamp(Number(b.opacity ?? 0.35), 0, 1);
  document.body.classList.toggle('has-bg', type !== 'none');
}

function searchDecorations() {
  const bg = theme.colors.background.slice(0, 7);
  return {
    matchBackground: mix(bg, theme.colors.yellow.slice(0, 7), 0.35),
    matchBorder: theme.colors.yellow.slice(0, 7),
    matchOverviewRuler: theme.colors.yellow.slice(0, 7),
    activeMatchBackground: mix(bg, theme.ui.accent.slice(0, 7), 0.55),
    activeMatchBorder: theme.ui.accent.slice(0, 7),
    activeMatchColorOverviewRuler: theme.ui.accent.slice(0, 7)
  };
}

// ---------------------------------------------------------------------------
// Panneaux (un terminal = un panneau)
// ---------------------------------------------------------------------------

function xtermOptions() {
  return {
    fontFamily: settings.fontFamily,
    fontSize,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    cursorStyle: settings.cursorStyle,
    cursorInactiveStyle: 'outline',
    cursorBlink: settings.cursorBlink,
    scrollback: settings.scrollback,
    allowTransparency: true,
    allowProposedApi: true,
    smoothScrollDuration: settings.animations === false ? 0 : 110,
    fastScrollSensitivity: 5,
    drawBoldTextInBrightColors: true,
    theme: xtermTheme(theme),
    ...(platform === 'win32' ? { windowsPty: { backend: 'conpty' } } : {})
  };
}

function createPane(tab, profile, cwd) {
  const pane = {
    id: nextPaneId++, tab, profile, cwd: cwd || null,
    ptyId: null, exited: false, title: profile.name, customTitle: null,
    born: performance.now(), node: null, term: null
  };
  pane.el = document.createElement('div');
  pane.el.className = 'pane';
  pane.host = document.createElement('div');
  pane.host.className = 'pane-host';
  pane.el.appendChild(pane.host);
  pane.el.addEventListener('mousedown', () => { if (pane.tab.activePane !== pane) focusPane(pane); }, true);
  panes.set(pane.id, pane);
  return pane;
}

function makeLeaf(tab, profile, cwd, parent = null) {
  const pane = createPane(tab, profile, cwd);
  const leaf = { type: 'pane', pane, parent };
  pane.node = leaf;
  return leaf;
}

function openPane(pane) {
  const term = new Terminal(xtermOptions());
  const fit = new FitAddon.FitAddon();
  const search = new SearchAddon.SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon.WebLinksAddon((event, uri) => {
    if (event.ctrlKey) nyx.openExternal(uri);
    else toast('Ctrl+clic pour ouvrir le lien');
  }));
  term.open(pane.host);
  try {
    const webgl = new WebglAddon.WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch (err) {
    console.warn('WebGL indisponible, rendu DOM utilisé', err);
  }
  Object.assign(pane, { term, fit, search });

  term.onTitleChange((t) => setPaneTitle(pane, t));
  term.onSelectionChange(() => {
    if (settings.copyOnSelect && term.hasSelection()) nyx.copy(term.getSelection());
  });
  term.onBell(() => {
    const el = pane.tab.tabEl;
    el.classList.remove('bell');
    void el.offsetWidth;
    el.classList.add('bell');
  });
  search.onDidChangeResults(({ resultIndex, resultCount }) => {
    if (pane === activePane()) searchCount.textContent = resultCount ? `${resultIndex + 1} / ${resultCount}` : 'Aucun';
  });
  term.onData((d) => { if (!pane.exited && pane.ptyId != null) nyx.write(pane.ptyId, d); });
  term.onResize(({ cols, rows }) => { if (!pane.exited && pane.ptyId != null) nyx.resize(pane.ptyId, cols, rows); });

  pane.host.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (term.hasSelection()) {
      nyx.copy(term.getSelection());
      term.clearSelection();
      toast('Copié');
    } else if (settings.rightClickPaste) {
      term.paste(await nyx.paste());
    }
    term.focus();
  });

  initPaneBlocks(pane);
  applyLigatures(pane);
  fitPane(pane);
  spawnPane(pane);
}

async function spawnPane(pane) {
  pane.exited = false;
  pane.el.classList.remove('exited');
  pane.tab.tabEl.classList.remove('exited');
  try {
    const res = await nyx.createPty({ profileId: pane.profile.id, cols: pane.term.cols, rows: pane.term.rows, cwd: pane.cwd });
    if (!panes.has(pane.id)) { nyx.kill(res.id); return; } // panneau fermé entre-temps
    pane.ptyId = res.id;
    byPty.set(res.id, pane);
    const early = pendingData.get(res.id);
    if (early) { pane.term.write(early); pendingData.delete(res.id); }
  } catch (err) {
    pane.exited = true;
    pane.el.classList.add('exited');
    pane.term.write(`\x1b[31mImpossible de lancer « ${pane.profile.command || pane.profile.name} »\x1b[0m\r\n${String(err.message || err)}\r\n`);
  }
}

function disposePane(pane) {
  if (pane.ptyId != null && !pane.exited) nyx.kill(pane.ptyId);
  byPty.delete(pane.ptyId);
  panes.delete(pane.id);
  disposePaneBlocks(pane);
  try { pane.term && pane.term.dispose(); } catch { /* ignore */ }
  pane.el.remove();
}

function fitPane(pane) {
  if (!pane || !pane.fit) return;
  try { pane.fit.fit(); } catch { /* conteneur caché */ }
  pane.el.classList.toggle('narrow', pane.el.clientWidth < 620);
  renderBlocks(pane);
}

// « C:\Windows\System32\...\powershell.exe » -> nom du profil
function cleanTitle(title, profile) {
  const t = (title || '').trim();
  if (!t) return profile.name;
  const m = t.match(/^(?:Administrat(?:eu|o)r\s*:\s*)?([A-Za-z]:\\|\\\\)[^:*?"<>|]*?([^\\]+?)(\.exe)?$/i);
  if (m && (m[3] || /\\(system32|windowspowershell|powershell)\\/i.test(t))) {
    return t.toLowerCase().includes('administrat') ? `${profile.name} (admin)` : profile.name;
  }
  return t;
}

function setPaneTitle(pane, title) {
  pane.title = cleanTitle(title, pane.profile);
  if (pane.tab.activePane === pane) {
    refreshTabChrome(pane.tab);
    if (pane.tab === active) updateStatus();
  }
}

function setPaneCwd(pane, cwd) {
  if (!cwd || cwd === pane.cwd) return;
  pane.cwd = cwd;
  if (pane === activePane()) updateStatus();
  saveSession();
}

const tabTitle = (tab) => tab.customTitle || (tab.activePane && tab.activePane.title) || '';

// ---------------------------------------------------------------------------
// Arbre de panneaux d'un onglet
// node = { type: 'pane', pane, parent } | { type: 'split', dir: 'h' | 'v', ratio, a, b, parent }
//   h = côte à côte, v = l'un au-dessus de l'autre
// ---------------------------------------------------------------------------

function nodePanes(node, out = []) {
  if (!node) return out;
  if (node.type === 'pane') out.push(node.pane);
  else { nodePanes(node.a, out); nodePanes(node.b, out); }
  return out;
}
const tabPanes = (tab) => nodePanes(tab.root);

function replaceNode(tab, oldNode, newNode) {
  const p = oldNode.parent;
  if (!p) tab.root = newNode;
  else if (p.a === oldNode) p.a = newNode;
  else p.b = newNode;
  newNode.parent = p;
}

function applyRatio(node) {
  node.aEl.style.flex = `${node.ratio} 1 0`;
  node.bEl.style.flex = `${1 - node.ratio} 1 0`;
}

function buildNodeEl(node) {
  if (node.type === 'pane') return node.pane.el;
  const wrap = document.createElement('div');
  wrap.className = `split ${node.dir}`;
  const a = buildNodeEl(node.a);
  const b = buildNodeEl(node.b);
  const g = document.createElement('div');
  g.className = 'gutter';
  g.innerHTML = '<span></span>';
  Object.assign(node, { el: wrap, aEl: a, bEl: b });
  applyRatio(node);
  setupGutter(g, node);
  wrap.append(a, g, b);
  return wrap;
}

function layoutTab(tab) {
  const rootEl = buildNodeEl(tab.root);
  rootEl.style.flex = '1 1 0';
  tab.el.replaceChildren(rootEl);
  const multi = tab.root.type === 'split';
  tab.el.classList.toggle('split-mode', multi);
  for (const p of tabPanes(tab)) p.el.classList.toggle('focused', p === tab.activePane);
  if (tab.zoomed && !tabPanes(tab).includes(tab.zoomed)) setZoomed(tab, null);
  requestAnimationFrame(() => fitTab(tab));
}

function fitTab(tab) {
  if (!tab) return;
  for (const p of tabPanes(tab)) fitPane(p);
  if (tab === active) updateStatus();
}

let fitFrame = 0;
function scheduleFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => fitTab(active));
}

function setupGutter(g, node) {
  g.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    document.body.classList.add('resizing', `resizing-${node.dir}`);
    const move = (ev) => {
      const r = node.el.getBoundingClientRect();
      const ratio = node.dir === 'h' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
      node.ratio = clamp(ratio, 0.1, 0.9);
      applyRatio(node);
      scheduleFit();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing', 'resizing-h', 'resizing-v');
      fitTab(active);
      saveSession();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
  g.addEventListener('dblclick', () => {
    node.ratio = 0.5;
    applyRatio(node);
    setTimeout(() => fitTab(active), 260);
    saveSession();
  });
}

// Le nouveau panneau / onglet hérite du dossier du panneau actif si c'est pertinent
function inheritCwd(fromPane, toProfile) {
  if (!fromPane || !fromPane.cwd || settings.newTabInCurrentDir === false) return null;
  if (fromPane.profile.kind === 'ssh' || toProfile.kind === 'ssh') return null;
  return fromPane.cwd;
}

function splitPane(dir = 'auto', profile = null) {
  muteHud();
  const tab = active;
  if (!tab || !tab.activePane) return;
  const cur = tab.activePane;
  if (tab.zoomed) setZoomed(tab, null);
  if (dir === 'auto') {
    const r = cur.el.getBoundingClientRect();
    dir = r.width >= r.height * 1.4 ? 'h' : 'v';
  }
  const prof = profile || cur.profile;
  const oldLeaf = cur.node;
  const newLeaf = makeLeaf(tab, prof, inheritCwd(cur, prof));
  const split = { type: 'split', dir, ratio: 0.5, a: oldLeaf, b: newLeaf, parent: null };
  replaceNode(tab, oldLeaf, split);
  oldLeaf.parent = split;
  newLeaf.parent = split;
  newLeaf.pane.el.classList.add('pane-enter');
  setTimeout(() => newLeaf.pane.el.classList.remove('pane-enter'), 400);
  tab.activePane = newLeaf.pane;
  layoutTab(tab);
  openPane(newLeaf.pane);
  focusPane(newLeaf.pane);
  setTimeout(() => fitTab(tab), 50);
  saveSession();
}

function closePane(pane) {
  muteHud();
  const tab = pane.tab;
  if (tabPanes(tab).length <= 1) { closeTab(tab); return; }
  const leaf = pane.node;
  const parent = leaf.parent;
  const sibling = parent.a === leaf ? parent.b : parent.a;
  const finish = () => {
    disposePane(pane);
    replaceNode(tab, parent, sibling);
    if (tab.zoomed === pane) setZoomed(tab, null);
    if (tab.activePane === pane) tab.activePane = nodePanes(sibling)[0];
    layoutTab(tab);
    focusPane(tab.activePane);
    saveSession();
  };
  if (settings.animations === false) finish();
  else { pane.el.classList.add('pane-leave'); setTimeout(finish, 160); }
}

function focusPane(pane, focusTerm = true) {
  if (!pane) return;
  const tab = pane.tab;
  tab.activePane = pane;
  for (const p of tabPanes(tab)) p.el.classList.toggle('focused', p === pane);
  refreshTabChrome(tab);
  if (tab === active) {
    updateStatus();
    updateIndicator();
    if (searchInput.value && !searchEl.classList.contains('hidden')) pane.search.findNext(searchInput.value, searchOpts(true));
    if (focusTerm && pane.term) pane.term.focus();
  }
}

// Alt + flèches : panneau voisin dans la direction
function moveFocus(direction) {
  const tab = active;
  if (!tab || tabPanes(tab).length < 2) return false;
  const cur = tab.activePane.el.getBoundingClientRect();
  const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
  let best = null, bestD = Infinity;
  for (const p of tabPanes(tab)) {
    if (p === tab.activePane) continue;
    const r = p.el.getBoundingClientRect();
    const px = r.left + r.width / 2, py = r.top + r.height / 2;
    const ok = { left: r.right <= cur.left + 2, right: r.left >= cur.right - 2, up: r.bottom <= cur.top + 2, down: r.top >= cur.bottom - 2 }[direction];
    if (!ok) continue;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) focusPane(best);
  return true;
}

// Alt + Maj + flèches : déplace le séparateur le plus proche
function resizeActive(direction) {
  const tab = active;
  if (!tab || !tab.activePane) return false;
  const want = direction === 'left' || direction === 'right' ? 'h' : 'v';
  let n = tab.activePane.node.parent;
  while (n && n.dir !== want) n = n.parent;
  if (!n) return true;
  n.ratio = clamp(n.ratio + (direction === 'right' || direction === 'down' ? 0.05 : -0.05), 0.1, 0.9);
  applyRatio(n);
  setTimeout(() => fitTab(tab), 240);
  saveSession();
  return true;
}

function setZoomed(tab, pane) {
  muteHud();
  if (tab.zoomed) tab.zoomed.el.classList.remove('zoomed');
  tab.zoomed = pane;
  if (pane) pane.el.classList.add('zoomed');
  tab.el.classList.toggle('has-zoom', !!pane);
  setTimeout(() => fitTab(tab), 30);
}

function togglePaneZoom() {
  if (!active || tabPanes(active).length < 2) return;
  setZoomed(active, active.zoomed ? null : active.activePane);
  toast(active.zoomed ? 'Panneau agrandi (Alt+Maj+Z pour revenir)' : 'Panneaux restaurés');
}

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

const ICON_CLOSE = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

function updateIndicator() {
  if (!active || !active.tabEl || !active.tabEl.isConnected) { indicator.classList.remove('visible'); return; }
  const el = active.tabEl;
  indicator.style.left = `${el.offsetLeft}px`;
  indicator.style.width = `${el.offsetWidth}px`;
  indicator.style.setProperty('--tab-color', profileColor(active.activePane && active.activePane.profile));
  indicator.classList.add('visible');
}

let trackUntil = 0;
function trackIndicator(ms = 350) {
  const running = performance.now() < trackUntil;
  trackUntil = Math.max(trackUntil, performance.now() + ms);
  if (running) return;
  const loop = () => {
    updateIndicator();
    if (performance.now() < trackUntil) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function refreshTabChrome(tab) {
  if (!tab.tabEl || !theme) return;
  const p = tab.activePane;
  if (!p) return;
  tab.tabEl.style.setProperty('--tab-color', profileColor(p.profile));
  tab.iconEl.textContent = p.profile.icon || '❯';
  if (!tab.renaming) tab.titleEl.textContent = tabTitle(tab);
  tab.tabEl.title = tabTitle(tab);
  const n = tabPanes(tab).length;
  tab.countEl.textContent = n > 1 ? n : '';
  tab.countEl.classList.toggle('hidden', n < 2);
  if (tab === active) document.title = `${tabTitle(tab)} — Nyx Terminal`;
}

function buildTabEl(tab) {
  const el = document.createElement('div');
  el.className = 'tab';
  el.draggable = true;
  el.setAttribute('role', 'tab');
  el.innerHTML = `<span class="tab-icon"></span><span class="tab-title"></span><span class="tab-count hidden"></span><button class="tab-close" title="Fermer l'onglet">${ICON_CLOSE}</button>`;
  tab.iconEl = el.querySelector('.tab-icon');
  tab.titleEl = el.querySelector('.tab-title');
  tab.countEl = el.querySelector('.tab-count');
  const close = el.querySelector('.tab-close');

  el.addEventListener('mousedown', (e) => {
    if (e.button === 1) { e.preventDefault(); closeTab(tab); }
    else if (e.button === 0 && !close.contains(e.target)) activate(tab);
  });
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab); });
  el.addEventListener('dblclick', (e) => { if (!close.contains(e.target)) renameTab(tab); });
  el.addEventListener('animationend', (e) => { if (e.animationName === 'bell') el.classList.remove('bell'); });
  setupDrag(el, tab);
  tabsEl.appendChild(el);
  return el;
}

function renameTab(tab) {
  const input = document.createElement('input');
  input.value = tabTitle(tab);
  tab.renaming = true;
  tab.titleEl.replaceChildren(input);
  input.focus();
  input.select();
  let finished = false;
  const done = (commit) => {
    if (finished) return;
    finished = true;
    tab.renaming = false;
    if (commit) tab.customTitle = input.value.trim() || null;
    refreshTabChrome(tab);
    tab.activePane && tab.activePane.term && tab.activePane.term.focus();
    saveSession();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') done(true);
    if (e.key === 'Escape') done(false);
  });
  input.addEventListener('blur', () => done(true));
}

function activate(tab) {
  if (!tab) return;
  active = tab;
  for (const t of tabs) {
    const on = t === tab;
    t.el.classList.toggle('active', on);
    t.tabEl.classList.toggle('active', on);
    t.tabEl.setAttribute('aria-selected', on);
  }
  tab.tabEl.classList.remove('activity', 'done-ok', 'done-err');
  tab.tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  refreshTabChrome(tab);
  updateIndicator();
  updateStatus();
  requestAnimationFrame(() => {
    fitTab(tab);
    tab.activePane && tab.activePane.term && tab.activePane.term.focus();
  });
  saveSession();
}

function cycle(dir) {
  if (tabs.length < 2) return;
  const i = tabs.indexOf(active);
  activate(tabs[(i + dir + tabs.length) % tabs.length]);
}

function buildFromLayout(tab, n, parent) {
  if (n && n.type === 'split' && n.a && n.b) {
    const node = { type: 'split', dir: n.dir === 'v' ? 'v' : 'h', ratio: clamp(Number(n.ratio) || 0.5, 0.1, 0.9), parent };
    node.a = buildFromLayout(tab, n.a, node);
    node.b = buildFromLayout(tab, n.b, node);
    return node;
  }
  return makeLeaf(tab, profileById(n && n.profileId), n && n.cwd, parent);
}

function openTab({ profileId, cwd, layout, customTitle, activePaneIndex = 0, focus = true } = {}) {
  const tab = { id: nextTabId++, customTitle: customTitle || null, root: null, activePane: null, zoomed: null };
  tab.el = document.createElement('div');
  tab.el.className = 'tab-view';
  termsEl.appendChild(tab.el);

  if (layout) tab.root = buildFromLayout(tab, layout, null);
  else {
    const prof = profileById(profileId);
    tab.root = makeLeaf(tab, prof, cwd !== undefined ? cwd : inheritCwd(activePane(), prof));
  }
  const list = tabPanes(tab);
  tab.activePane = list[clamp(activePaneIndex, 0, list.length - 1)];
  tab.tabEl = buildTabEl(tab);
  tabs.push(tab);
  layoutTab(tab);
  if (focus || !active) activate(tab);
  list.forEach(openPane);
  refreshTabChrome(tab);
  trackIndicator();
  saveSession();
  return tab;
}

// compatibilité : newTab(profileId)
const newTab = (profileId) => openTab({ profileId });

function closeTab(tab, { animate = true } = {}) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  for (const p of tabPanes(tab)) disposePane(p);

  if (tabs.length === 0) { window.__closing = true; nyx.closeWindow(); return; }
  if (active === tab) activate(tabs[Math.min(i, tabs.length - 1)]);
  tab.el.classList.remove('active');
  updateStatus();
  const cleanup = () => { tab.el.remove(); tab.tabEl.remove(); updateIndicator(); };
  if (animate && settings.animations !== false) {
    tab.tabEl.classList.add('closing');
    trackIndicator(300);
    setTimeout(cleanup, 240);
  } else cleanup();
  saveSession();
}

// Glisser-déposer des onglets
let dragged = null;
function setupDrag(el, tab) {
  el.addEventListener('dragstart', (e) => {
    dragged = tab;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    dragged = null;
    el.classList.remove('dragging');
    for (const t of tabs) t.tabEl.classList.remove('drop-before', 'drop-after');
  });
  el.addEventListener('dragover', (e) => {
    if (!dragged || dragged === tab) return;
    e.preventDefault();
    const after = e.offsetX > el.clientWidth / 2;
    el.classList.toggle('drop-after', after);
    el.classList.toggle('drop-before', !after);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragged || dragged === tab) return;
    const after = el.classList.contains('drop-after');
    el.classList.remove('drop-before', 'drop-after');
    tabs.splice(tabs.indexOf(dragged), 1);
    tabs.splice(tabs.indexOf(tab) + (after ? 1 : 0), 0, dragged);
    el.insertAdjacentElement(after ? 'afterend' : 'beforebegin', dragged.tabEl);
    updateIndicator();
    saveSession();
  });
}

// ---------------------------------------------------------------------------
// Données des terminaux
// ---------------------------------------------------------------------------

nyx.onData((id, data) => {
  const pane = byPty.get(id);
  if (!pane) { pendingData.set(id, (pendingData.get(id) || '') + data); return; }
  pane.term.write(data);
  if (pane.tab !== active && performance.now() - pane.born > 1500) pane.tab.tabEl.classList.add('activity');
});

nyx.onExit((id, code) => {
  const pane = byPty.get(id);
  if (!pane) return;
  byPty.delete(id);
  if (pane.si && pane.si.cur && pane.si.cur.state === 'running') finishBlock(pane, code);
  pane.exited = true;
  pane.el.classList.add('exited');
  if (settings.closeOnExit) { closePane(pane); return; }
  const color = code === 0 ? '32' : '31';
  pane.term.write(`\r\n\x1b[${color}m●\x1b[0m \x1b[90mProcessus terminé (code ${code}) — \x1b[0mEntrée\x1b[90m pour relancer, \x1b[0mCtrl+Shift+W\x1b[90m pour fermer\x1b[0m\r\n`);
  const sub = pane.term.onKey(({ domEvent }) => {
    if (domEvent.key !== 'Enter') return;
    sub.dispose();
    pane.born = performance.now();
    spawnPane(pane);
  });
});

nyx.onFocusPane((id) => {
  const pane = panes.get(id);
  if (!pane) return;
  activate(pane.tab);
  focusPane(pane);
});

nyx.onToast((msg) => toast(msg));

// ---------------------------------------------------------------------------
// Presse-papiers, zoom
// ---------------------------------------------------------------------------

function copySelection() {
  const p = activePane();
  if (!p || !p.term.hasSelection()) return false;
  nyx.copy(p.term.getSelection());
  p.term.clearSelection();
  toast('Copié');
  return true;
}

async function pasteClipboard() {
  const p = activePane();
  if (!p) return;
  const text = await nyx.paste();
  if (text) p.term.paste(text);
}

function setFontSize(size) {
  fontSize = clamp(size, 6, 48);
  for (const p of panes.values()) if (p.term) p.term.options.fontSize = fontSize;
  fitTab(active);
  updateStatus();
  toast(`Zoom ${Math.round((fontSize / settings.fontSize) * 100)} %`);
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

const searchOpts = (incremental = false) => ({
  caseSensitive: searchState.caseSensitive, regex: searchState.regex, incremental, decorations: searchDecorations()
});

function openSearch() {
  const p = activePane();
  searchEl.classList.remove('hidden');
  if (p && p.term.hasSelection()) searchInput.value = p.term.getSelection().split('\n')[0];
  searchInput.focus();
  searchInput.select();
  if (searchInput.value && p) p.search.findNext(searchInput.value, searchOpts(true));
}

function closeSearch() {
  searchEl.classList.add('hidden');
  searchCount.textContent = '';
  for (const p of panes.values()) p.search && p.search.clearDecorations();
  activePane() && activePane().term.focus();
}

searchInput.addEventListener('input', () => {
  const p = activePane();
  if (!p) return;
  if (!searchInput.value) { p.search.clearDecorations(); searchCount.textContent = ''; return; }
  p.search.findNext(searchInput.value, searchOpts(true));
});
searchInput.addEventListener('keydown', (e) => {
  const p = activePane();
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!p) return;
    if (e.shiftKey) p.search.findPrevious(searchInput.value, searchOpts());
    else p.search.findNext(searchInput.value, searchOpts());
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeSearch();
  }
});
$('#search-next').addEventListener('click', () => activePane() && activePane().search.findNext(searchInput.value, searchOpts()));
$('#search-prev').addEventListener('click', () => activePane() && activePane().search.findPrevious(searchInput.value, searchOpts()));
$('#search-close').addEventListener('click', closeSearch);
for (const [btnId, key] of [['#search-case', 'caseSensitive'], ['#search-regex', 'regex']]) {
  const btn = $(btnId);
  btn.addEventListener('click', () => {
    searchState[key] = !searchState[key];
    btn.classList.toggle('on', searchState[key]);
    if (searchInput.value && activePane()) activePane().search.findNext(searchInput.value, searchOpts(true));
    searchInput.focus();
  });
}

// ---------------------------------------------------------------------------
// Barre d'état
// ---------------------------------------------------------------------------

const sb = {
  profile: $('#sb-profile'), cwd: $('#sb-cwd'), title: $('#sb-title'), tabs: $('#sb-tabs'),
  size: $('#sb-size'), zoom: $('#sb-zoom'), theme: $('#sb-theme')
};

function prettyCwd(cwd) {
  if (!cwd) return '';
  const home = homeDir.replace(/[\\/]+$/, '');
  const norm = (s) => (platform === 'win32' ? s.toLowerCase() : s);
  let out = home && norm(cwd).startsWith(norm(home)) ? '~' + cwd.slice(home.length) : cwd;
  if (out.length > 48) out = '…' + out.slice(-47);
  return out;
}

function updateStatus() {
  if (!settings || !theme) return;
  const p = activePane();
  if (p) {
    sb.profile.style.setProperty('--tab-color', profileColor(p.profile));
    sb.profile.querySelector('span').textContent = p.profile.name;
    sb.cwd.classList.toggle('hidden', !p.cwd);
    sb.cwd.querySelector('span').textContent = prettyCwd(p.cwd);
    sb.cwd.title = p.cwd ? `${p.cwd}\nCliquer pour ouvrir dans l'Explorateur` : '';
    sb.title.textContent = p.cwd && tabTitle(active).includes(prettyCwd(p.cwd).replace(/^~/, '')) ? '' : tabTitle(active);
    if (p.term) sb.size.textContent = `${p.term.cols} × ${p.term.rows}`;
  }
  const n = active ? tabPanes(active).length : 0;
  sb.tabs.textContent = `${tabs.length} onglet${tabs.length > 1 ? 's' : ''}${n > 1 ? ` · ${n} panneaux` : ''}`;
  sb.zoom.textContent = `${Math.round((fontSize / settings.fontSize) * 100)} %`;
  sb.theme.lastElementChild.textContent = theme.name;
  updateRunningStatus();
}

sb.theme.addEventListener('click', () => openPalette('Thème '));
sb.profile.addEventListener('click', () => openPalette('Nouvel onglet '));
sb.zoom.addEventListener('click', () => setFontSize(settings.fontSize));
sb.cwd.addEventListener('click', () => {
  const p = activePane();
  if (!p || !p.cwd) return;
  if (p.profile.kind === 'wsl' && p.cwd.startsWith('/') && !/^\/mnt\/[a-z]\//.test(p.cwd)) { nyx.copy(p.cwd); toast('Chemin copié'); return; }
  nyx.openFolder(p.cwd);
});

// ---------------------------------------------------------------------------
// Session (restaurée au prochain lancement)
// ---------------------------------------------------------------------------

function serializeNode(n) {
  if (n.type === 'pane') {
    return { type: 'pane', profileId: n.pane.profile.id, cwd: n.pane.profile.kind === 'ssh' ? null : n.pane.cwd || null };
  }
  return { type: 'split', dir: n.dir, ratio: Math.round(n.ratio * 1000) / 1000, a: serializeNode(n.a), b: serializeNode(n.b) };
}

let sessionTimer = null;
function saveSession(now = false) {
  if (isQuake || !settings) return;
  clearTimeout(sessionTimer);
  const send = () => nyx.saveSession({
    tabs: tabs.map((t) => ({
      customTitle: t.customTitle,
      layout: serializeNode(t.root),
      activePaneIndex: Math.max(0, tabPanes(t).indexOf(t.activePane))
    })),
    activeTab: Math.max(0, tabs.indexOf(active))
  });
  if (now) send(); else sessionTimer = setTimeout(send, 400);
}

function restoreSession(data) {
  const saved = (data && data.tabs) || [];
  for (const t of saved) openTab({ layout: t.layout, customTitle: t.customTitle, activePaneIndex: t.activePaneIndex || 0, focus: false });
  if (tabs.length) activate(tabs[clamp(data.activeTab || 0, 0, tabs.length - 1)]);
  return tabs.length > 0;
}

// ---------------------------------------------------------------------------
// Menu (profils, serveurs, actions)
// ---------------------------------------------------------------------------

function menuItem(icon, label, kbd, onClick, color, sub) {
  const item = document.createElement('div');
  item.className = 'menu-item';
  item.setAttribute('role', 'menuitem');
  if (color) item.style.setProperty('--c', color);
  item.innerHTML = '<span class="chip"></span><span class="label"><span class="l1"></span><span class="l2"></span></span><span class="kbd"></span>';
  item.querySelector('.chip').textContent = icon;
  item.querySelector('.l1').textContent = label;
  item.querySelector('.l2').textContent = sub || '';
  item.querySelector('.kbd').textContent = kbd || '';
  item.addEventListener('click', () => { hideMenu(); onClick(); });
  return item;
}

function elt(tag, cls, text) {
  const d = document.createElement(tag);
  d.className = cls;
  if (text) d.textContent = text;
  return d;
}

function showMenu() {
  const shells = profiles.filter((p) => !p.server);
  const servers = profiles.filter((p) => p.server);
  menuEl.replaceChildren(
    elt('div', 'menu-label', 'Profils'),
    ...shells.map((p, i) => menuItem(p.icon || '❯', p.name, i < 9 ? `Ctrl+Shift+${i + 1}` : '', () => openTab({ profileId: p.id }), p.color)),
    elt('div', 'menu-sep'),
    elt('div', 'menu-label', 'Serveurs SSH'),
    ...servers.map((p) => menuItem(p.icon, p.name, '', () => openTab({ profileId: p.id }), p.color, p.subtitle)),
    menuItem('＋', 'Ajouter un serveur…', '', () => openServerModal(), theme.ui.accent),
    elt('div', 'menu-sep'),
    menuItem('◫', 'Diviser à droite', 'Alt+Maj+=', () => splitPane('h')),
    menuItem('⊟', 'Diviser en bas', 'Alt+Maj+-', () => splitPane('v')),
    menuItem('◐', 'Personnaliser…', 'Ctrl+Maj+,', () => openDrawer('colors'), theme.ui.accent2),
    menuItem('⌘', 'Palette de commandes', 'Ctrl+Shift+P', () => openPalette()),
    ...(isQuake ? [] : [menuItem('⬒', 'Terminal Quake', settings.quakeHotkey || '', () => nyx.toggleQuake())]),
    menuItem('⧉', 'Nouvelle fenêtre', 'Ctrl+Shift+N', () => nyx.newWindow()),
    menuItem('⚙', 'settings.json', 'Ctrl+,', () => nyx.openSettings())
  );
  const r = $('#profiles-btn').getBoundingClientRect();
  menuEl.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 300))}px`;
  menuEl.style.top = `${r.bottom + 6}px`;
  menuEl.classList.remove('hidden');
}

function hideMenu() { menuEl.classList.add('hidden'); }

$('#new-tab').addEventListener('click', () => openTab());
$('#split-btn').addEventListener('click', () => splitPane('auto'));
$('#customize-btn').addEventListener('click', () => (drawerOpen() ? closeDrawer() : openDrawer()));
$('#profiles-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  menuEl.classList.contains('hidden') ? showMenu() : hideMenu();
});
document.addEventListener('mousedown', (e) => {
  if (!menuEl.contains(e.target) && !$('#profiles-btn').contains(e.target)) hideMenu();
});
$('.drag-space').addEventListener('dblclick', () => openTab());

// ---------------------------------------------------------------------------
// Raccourcis clavier (phase de capture : interceptés avant xterm)
// ---------------------------------------------------------------------------

const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

document.addEventListener('keydown', (e) => {
  if (palette.open || modalOpen()) return;              // gèrent leurs propres touches
  if (e.target === searchInput && e.key !== 'F3') return;
  if (e.target.closest && e.target.closest('#drawer') && e.key !== 'Escape') return;
  if (e.target.tagName === 'INPUT' && e.target !== searchInput && !e.target.closest('#drawer')) return;

  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  const altShift = e.altKey && e.shiftKey && !e.ctrlKey;
  const p = activePane();
  const multi = active && tabPanes(active).length > 1;
  let handled = true;

  if (ctrl && e.shiftKey && k === 'p') openPalette();
  else if (ctrl && e.shiftKey && k === 't') openTab();
  else if (ctrl && e.shiftKey && k === 'w') p && closePane(p);
  else if (ctrl && e.shiftKey && k === 'n') nyx.newWindow();
  else if (ctrl && e.shiftKey && k === 'f') openSearch();
  else if (ctrl && e.shiftKey && k === 'c') copySelection();
  else if (ctrl && e.shiftKey && k === 'v') pasteClipboard();
  else if (ctrl && e.shiftKey && (k === ',' || e.code === 'Comma')) drawerOpen() ? closeDrawer() : openDrawer();
  else if (ctrl && e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
    const shells = profiles.filter((x) => !x.server);
    const prof = shells[Number(e.code.slice(5)) - 1];
    if (prof) openTab({ profileId: prof.id });
  }
  else if (altShift && k === 'd') splitPane('auto');
  else if (altShift && (e.code === 'Equal' || k === '+' || k === '=')) splitPane('h');
  else if (altShift && (e.code === 'Minus' || e.code === 'Digit6' || k === '-' || k === '_')) splitPane('v');
  else if (altShift && k === 'z') togglePaneZoom();
  else if (altShift && ARROWS[e.key] && multi) resizeActive(ARROWS[e.key]);
  else if (e.altKey && !e.shiftKey && !e.ctrlKey && ARROWS[e.key] && multi) moveFocus(ARROWS[e.key]);
  else if (ctrl && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && jumpToBlock(e.key === 'ArrowUp' ? -1 : 1)) { /* bloc précédent / suivant */ }
  else if (ctrl && !e.shiftKey && k === 'c' && p && p.term.hasSelection()) copySelection(); // sinon Ctrl+C = interruption
  else if (ctrl && !e.shiftKey && k === 'v') pasteClipboard();
  else if (ctrl && !e.shiftKey && k === ',') nyx.openSettings();
  else if (ctrl && e.key === 'Tab') cycle(e.shiftKey ? -1 : 1);
  else if (ctrl && (e.key === '=' || e.key === '+')) setFontSize(fontSize + 1);
  else if (ctrl && e.key === '-') setFontSize(fontSize - 1);
  else if (ctrl && e.key === '0') setFontSize(settings.fontSize);
  else if (e.altKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
    const n = Number(e.code.slice(5));
    activate(n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]);
  }
  else if (e.key === 'F3') {
    if (searchEl.classList.contains('hidden')) openSearch();
    else if (p && e.shiftKey) p.search.findPrevious(searchInput.value, searchOpts());
    else if (p) p.search.findNext(searchInput.value, searchOpts());
  }
  else if (e.key === 'Escape' && drawerOpen()) closeDrawer();
  else if (e.key === 'Escape' && !searchEl.classList.contains('hidden')) closeSearch();
  else if (e.key === 'Escape' && !menuEl.classList.contains('hidden')) hideMenu();
  else handled = false;

  if (handled) { e.preventDefault(); e.stopPropagation(); }
}, true);

termsEl.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setFontSize(fontSize + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

// ---------------------------------------------------------------------------
// Redimensionnement, paramètres à chaud, mode Quake
// ---------------------------------------------------------------------------

let hudTimer;
let lastSize = '';
let hudMuteUntil = 0;
const muteHud = (ms = 700) => { hudMuteUntil = performance.now() + ms; };
let resizeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    fitTab(active);
    updateIndicator();
    const p = activePane();
    if (!p || !p.term) return;
    const size = `${p.term.cols}×${p.term.rows}`;
    if (lastSize && size !== lastSize && !document.body.classList.contains('resizing') && performance.now() > hudMuteUntil) {
      sizeHud.innerHTML = `<span>${p.term.cols}</span> × <span>${p.term.rows}</span>`;
      sizeHud.classList.remove('hidden');
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => sizeHud.classList.add('hidden'), 700);
    }
    lastSize = size;
  });
}).observe(termsEl);

function applySettings(s, p) {
  const prev = settings;
  settings = s;
  profiles = p;
  savedThemeName = s.themeName;
  if (!prev || s.fontSize !== prev.fontSize) fontSize = s.fontSize;
  applyUiPrefs();
  if (!palette.open && !(drawerOpen() && drawerOpen() === 'colors')) applyTheme(resolveTheme(s.themeName));
  else applyBackground();

  const opts = xtermOptions();
  for (const pane of panes.values()) {
    const fresh = profiles.find((x) => x.id === pane.profile.id);
    if (fresh) pane.profile = fresh;
    if (!pane.term) continue;
    for (const key of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'cursorStyle', 'cursorBlink', 'scrollback', 'smoothScrollDuration']) {
      if (pane.term.options[key] !== opts[key]) pane.term.options[key] = opts[key];
    }
    applyLigatures(pane);
  }
  for (const tab of tabs) refreshTabChrome(tab);
  setTimeout(() => fitTab(active), 320);
  updateIndicator();
  updateStatus();
}

nyx.onSettingsChanged((s, p) => applySettings(s, p));

nyx.onQuakeShow(() => {
  document.body.classList.add('shown');
  setTimeout(() => { fitTab(active); activePane() && activePane().term.focus(); }, 60);
});
nyx.onQuakeHide(() => document.body.classList.remove('shown'));

window.addEventListener('beforeunload', (e) => {
  saveSession(true);
  if (isQuake) return;
  const live = [...panes.values()].filter((p) => !p.exited).length;
  if (settings && settings.confirmCloseWithMultipleTabs && live > 1 && !window.__closing) {
    e.preventDefault();
    e.returnValue = '';
    if (confirm(`Fermer ${live} terminaux ?`)) { window.__closing = true; nyx.closeWindow(); }
  }
});
