'use strict';

/* Nyx Terminal — tiroir « Personnaliser » : éditeur de thème visuel, fond d'écran, police. */

/* global $, settings, theme, savedThemeName, allThemes, resolveTheme, applyTheme, applyBackground, applySettings,
          GRADIENTS, nyx, toast, escapeHtml, clamp, fileUrl, hideMenu, closePalette, palette, panes, fitTab, active,
          activePane, applyLigatures, xtermOptions, fontSize */

const drawerEl = $('#drawer');
const drawerBody = $('#drawer-body');
const drawerFoot = $('#drawer-foot');
let drawerPane = null;
let draft = null;       // thème en cours d'édition
let draftDirty = false;

const drawerOpen = () => drawerPane || false;

function openDrawer(name = 'colors') {
  muteHud(900);
  hideMenu();
  if (palette.open) closePalette();
  drawerEl.classList.remove('hidden');
  requestAnimationFrame(() => document.body.classList.add('drawer-open'));
  switchDrawer(name);
  setTimeout(() => fitTab(active), 320);
}

function closeDrawer() {
  if (!drawerPane) return;
  if (draftDirty) applyTheme(resolveTheme(settings.themeName));
  draft = null;
  draftDirty = false;
  drawerPane = null;
  muteHud(900);
  document.body.classList.remove('drawer-open');
  setTimeout(() => { if (!drawerPane) drawerEl.classList.add('hidden'); fitTab(active); }, 300);
  activePane() && activePane().term.focus();
}

function switchDrawer(name) {
  if (drawerPane === 'colors' && name !== 'colors' && draftDirty) {
    applyTheme(resolveTheme(settings.themeName));
    draftDirty = false;
  }
  drawerPane = name;
  for (const b of drawerEl.querySelectorAll('.drawer-tabs button')) b.classList.toggle('on', b.dataset.pane === name);
  drawerBody.scrollTop = 0;
  drawerBody.classList.remove('swap');
  void drawerBody.offsetWidth;
  drawerBody.classList.add('swap');
  ({ colors: renderColors, background: renderBackground, font: renderFont })[name]();
}

drawerEl.querySelector('.drawer-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) switchDrawer(b.dataset.pane);
});
$('#drawer-close').addEventListener('click', closeDrawer);

// Petits composants -----------------------------------------------------------

const hex6 = (c) => (/^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : '#000000');

function colorRow(label, value, onInput) {
  const row = document.createElement('label');
  row.className = 'c-row';
  row.innerHTML = `<span class="c-label">${escapeHtml(label)}</span><span class="c-hex">${hex6(value)}</span><span class="c-swatch" style="--sw:${hex6(value)}"><input type="color" value="${hex6(value)}"></span>`;
  const input = row.querySelector('input');
  input.addEventListener('input', () => {
    row.querySelector('.c-swatch').style.setProperty('--sw', input.value);
    row.querySelector('.c-hex').textContent = input.value;
    onInput(input.value);
  });
  return row;
}

function toggleRow(label, checked, onChange, hint = '') {
  const row = document.createElement('label');
  row.className = 't-row';
  row.innerHTML = `<span><span class="t-label">${escapeHtml(label)}</span>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span><span class="switch"><input type="checkbox" ${checked ? 'checked' : ''}><i></i></span>`;
  row.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
  return row;
}

function sliderRow(label, min, max, step, value, fmt, onInput) {
  const row = document.createElement('div');
  row.className = 's-row';
  row.innerHTML = `<div class="s-head"><span>${escapeHtml(label)}</span><output>${fmt(value)}</output></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const input = row.querySelector('input');
  const paint = () => input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
  paint();
  input.addEventListener('input', () => { row.querySelector('output').textContent = fmt(Number(input.value)); paint(); onInput(Number(input.value)); });
  return row;
}

function segRow(options, value, onChange) {
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const [val, label] of options) {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('on', val === value);
    b.addEventListener('click', () => {
      for (const x of seg.children) x.classList.remove('on');
      b.classList.add('on');
      onChange(val);
    });
    seg.appendChild(b);
  }
  return seg;
}

function section(title, ...children) {
  const s = document.createElement('section');
  s.className = 'd-section';
  if (title) s.appendChild(Object.assign(document.createElement('h3'), { textContent: title }));
  s.append(...children.filter(Boolean));
  return s;
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = `btn ${cls || ''}`;
  b.innerHTML = label;
  b.addEventListener('click', onClick);
  return b;
}

let saveTimer = null;
function persist(patch, delay = 350) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const res = await nyx.updateSettings(patch);
    applySettings(res.settings, res.profiles);
  }, delay);
}

// Couleurs (éditeur de thème) --------------------------------------------------

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomTheme() {
  const h = Math.floor(Math.random() * 360);
  const h2 = (h + 40 + Math.floor(Math.random() * 120)) % 360;
  const light = draft.light;
  const L = light ? (x) => 100 - x : (x) => x;
  const ansi = (hue, sat, lum) => hslToHex(hue, sat, light ? lum - 18 : lum);
  draft.ui = {
    tabBar: hslToHex(h, 22, L(6)), surface: hslToHex(h, 22, L(14)),
    accent: hslToHex(h, 85, light ? 48 : 64), accent2: hslToHex(h2, 85, light ? 52 : 70),
    text: hslToHex(h, 25, L(88)), muted: hslToHex(h, 14, light ? 55 : 48)
  };
  Object.assign(draft.colors, {
    background: hslToHex(h, 24, L(9)), foreground: hslToHex(h, 20, L(86)),
    cursor: draft.ui.accent, cursorAccent: hslToHex(h, 24, L(9)), selectionBackground: draft.ui.accent + '44',
    black: hslToHex(h, 18, L(16)), brightBlack: hslToHex(h, 14, light ? 60 : 38),
    red: ansi(355, 80, 66), brightRed: ansi(355, 90, 74),
    green: ansi(140, 60, 60), brightGreen: ansi(140, 70, 70),
    yellow: ansi(42, 85, 64), brightYellow: ansi(42, 95, 74),
    blue: ansi((h + 200) % 360 > 180 ? 215 : 205, 85, 66), brightBlue: ansi(212, 95, 76),
    magenta: ansi(285, 70, 72), brightMagenta: ansi(285, 80, 80),
    cyan: ansi(185, 70, 60), brightCyan: ansi(185, 80, 72),
    white: hslToHex(h, 15, L(78)), brightWhite: hslToHex(h, 20, L(95))
  });
  draftDirty = true;
  applyTheme(draftTheme());
  renderColors(true);
}

const draftTheme = () => ({ id: 'draft', name: draft.name || 'Mon thème', light: draft.light, custom: true, colors: { ...draft.colors }, ui: { ...draft.ui } });

function loadDraft(id) {
  const t = resolveTheme(id, false);
  const custom = (settings.customThemes || {})[id];
  draft = { baseId: id, editingId: custom ? id : null, name: custom ? t.name : `${t.name} (perso)`, light: t.light, colors: { ...t.colors }, ui: { ...t.ui } };
}

function renderColors(keep = false) {
  if (!draft || !keep) { loadDraft(savedThemeName); draftDirty = false; }
  const update = () => { draftDirty = true; applyTheme(draftTheme()); };

  const base = document.createElement('select');
  base.className = 'input';
  for (const [id, t] of Object.entries(allThemes())) {
    const o = new Option(`${(settings.customThemes || {})[id] ? '★ ' : ''}${t.name || id}`, id);
    o.selected = id === draft.baseId;
    base.appendChild(o);
  }
  base.addEventListener('change', () => { loadDraft(base.value); draftDirty = true; applyTheme(draftTheme()); renderColors(true); });

  const name = Object.assign(document.createElement('input'), { className: 'input', value: draft.name, placeholder: 'Nom du thème', spellcheck: false });
  name.addEventListener('input', () => { draft.name = name.value; });

  const uiRows = [
    ['accent', 'Accent'], ['accent2', 'Accent secondaire'], ['tabBar', "Barre d'onglets"],
    ['surface', 'Surfaces (menus, onglet actif)'], ['text', "Texte de l'interface"], ['muted', 'Texte discret']
  ].map(([k, label]) => colorRow(label, draft.ui[k], (v) => { draft.ui[k] = v; update(); }));

  const termRows = [
    ['background', 'Fond'], ['foreground', 'Texte'], ['cursor', 'Curseur'], ['selectionBackground', 'Sélection']
  ].map(([k, label]) => colorRow(label, draft.colors[k], (v) => {
    draft.colors[k] = k === 'selectionBackground' ? v + '66' : v;
    if (k === 'background') draft.colors.cursorAccent = v;
    update();
  }));

  const ansiNames = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  const fr = { black: 'Noir', red: 'Rouge', green: 'Vert', yellow: 'Jaune', blue: 'Bleu', magenta: 'Magenta', cyan: 'Cyan', white: 'Blanc' };
  const grid = document.createElement('div');
  grid.className = 'ansi-grid';
  for (const bright of [false, true]) {
    for (const n of ansiNames) {
      const key = bright ? `bright${n[0].toUpperCase()}${n.slice(1)}` : n;
      const cell = document.createElement('label');
      cell.className = 'ansi-cell';
      cell.title = `${fr[n]}${bright ? ' vif' : ''}`;
      cell.style.setProperty('--sw', hex6(draft.colors[key]));
      cell.innerHTML = `<input type="color" value="${hex6(draft.colors[key])}">`;
      cell.querySelector('input').addEventListener('input', (e) => {
        draft.colors[key] = e.target.value;
        cell.style.setProperty('--sw', e.target.value);
        update();
      });
      grid.appendChild(cell);
    }
  }

  const preview = document.createElement('div');
  preview.className = 'term-preview';
  const c = draft.colors;
  preview.style.cssText = `background:${c.background};color:${c.foreground}`;
  preview.innerHTML = `<div><span style="color:${c.green}">➜</span> <span style="color:${c.cyan}">~/projet</span> <span style="color:${c.magenta}">git:(</span><span style="color:${c.red}">main</span><span style="color:${c.magenta}">)</span> npm run dev</div>
    <div><span style="color:${c.blue}">info</span>  serveur prêt sur <u style="color:${c.cyan}">http://localhost:3000</u></div>
    <div><span style="color:${c.yellow}">warn</span>  2 dépendances obsolètes</div>
    <div><span style="color:${c.red}">error</span> <span style="color:${c.brightBlack}">src/app.js:12</span> => <span style="color:${c.brightMagenta}">undefined</span></div>`;

  drawerBody.replaceChildren(
    section('Point de départ', base, name, toggleRow('Thème clair', draft.light, (v) => { draft.light = v; update(); })),
    section('Aperçu', preview),
    section('Interface', ...uiRows),
    section('Terminal', ...termRows),
    section('Couleurs ANSI (normales puis vives)', grid)
  );
  drawerFoot.replaceChildren(
    button('🎲 Aléatoire', 'ghost', randomTheme),
    button('Annuler', 'ghost', () => { applyTheme(resolveTheme(settings.themeName)); draftDirty = false; renderColors(); }),
    button('Enregistrer', 'primary', saveDraft)
  );
}

async function saveDraft() {
  const nameVal = (draft.name || '').trim() || 'Mon thème';
  const slug = nameVal.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
  const id = draft.editingId || `perso-${slug}`;
  const customThemes = { ...(settings.customThemes || {}), [id]: { name: nameVal, light: draft.light, colors: { ...draft.colors }, ui: { ...draft.ui } } };
  const res = await nyx.updateSettings({ customThemes, themeName: id, theme: {}, ui: {} });
  draftDirty = false;
  applySettings(res.settings, res.profiles);
  draft.editingId = id;
  draft.baseId = id;
  toast(`Thème « ${nameVal} » enregistré`);
  renderColors(true);
}

// Fond d'écran ----------------------------------------------------------------

function renderBackground() {
  const bg = { ...settings.background };
  const apply = () => { applyBackground(bg); persist({ background: { ...bg } }); };

  const body = document.createElement('div');
  const rebuild = () => {
    const parts = [];
    if (bg.type === 'gradient') {
      const tiles = document.createElement('div');
      tiles.className = 'tiles';
      for (const [id, g] of Object.entries(GRADIENTS)) {
        const t = document.createElement('button');
        t.className = `tile${bg.gradient === id ? ' on' : ''}`;
        t.innerHTML = `<span class="tile-prev" style="background:${g.css(theme)}"></span><span>${escapeHtml(g.name)}</span>`;
        t.addEventListener('click', () => { bg.gradient = id; apply(); rebuild(); });
        tiles.appendChild(t);
      }
      parts.push(section('Dégradé', tiles));
    }
    if (bg.type === 'image') {
      const pick = document.createElement('div');
      pick.className = 'img-pick';
      pick.innerHTML = bg.image
        ? `<span class="img-thumb" style="background-image:url('${fileUrl(bg.image)}')"></span><span class="img-name">${escapeHtml(bg.image.split(/[\\/]/).pop())}</span>`
        : '<span class="img-thumb empty">🖼</span><span class="img-name">Aucune image choisie</span>';
      pick.appendChild(button('Choisir…', 'ghost', async () => {
        const p = await nyx.pickBackground();
        if (p) { bg.image = p; apply(); rebuild(); }
      }));
      parts.push(section('Image', pick, sliderRow('Flou', 0, 40, 1, bg.blur ?? 12, (v) => `${v} px`, (v) => { bg.blur = v; apply(); })));
    }
    if (bg.type !== 'none') {
      parts.push(section('Réglages', sliderRow('Visibilité', 5, 100, 1, Math.round((bg.opacity ?? 0.35) * 100), (v) => `${v} %`, (v) => { bg.opacity = v / 100; apply(); })));
    }
    body.replaceChildren(...parts);
  };

  drawerBody.replaceChildren(
    section('Type de fond', segRow([['none', 'Aucun'], ['gradient', 'Dégradé'], ['image', 'Image']], bg.type || 'none', (v) => {
      bg.type = v;
      if (v === 'gradient' && !bg.gradient) bg.gradient = 'theme';
      apply();
      rebuild();
    })),
    body,
    section('Effets',
      toggleRow('Halo animé', settings.backgroundGlow !== false, (v) => persist({ backgroundGlow: v }, 0), 'Lueurs colorées qui bougent lentement'),
      toggleRow('Assombrir les panneaux inactifs', settings.dimInactivePanes !== false, (v) => persist({ dimInactivePanes: v }, 0)),
      toggleRow('Animations', settings.animations !== false, (v) => persist({ animations: v }, 0)))
  );
  drawerFoot.replaceChildren(button('Terminé', 'primary', closeDrawer));
  rebuild();
}

// Police -----------------------------------------------------------------------

const FONTS = ['Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Cascadia Mono', 'Consolas', 'Lucida Console', 'Courier New'];

function primaryFont(family) {
  const m = String(family || '').match(/^\s*['"]?([^,'"]+)['"]?/);
  return m ? m[1].trim() : 'Cascadia Code';
}

function renderFont() {
  const current = primaryFont(settings.fontFamily);
  const preview = document.createElement('div');
  preview.className = 'font-preview';
  preview.innerHTML = '<div>const ok = (a, b) => a !== b && a >= 0;</div><div>0O 1lI |> :: // === -> ~/projet</div>';
  const setPreview = (fam) => { preview.style.fontFamily = fam; preview.style.fontVariantLigatures = settings.ligatures !== false ? 'normal' : 'none'; };
  setPreview(settings.fontFamily);

  const select = document.createElement('select');
  select.className = 'input';
  const list = FONTS.includes(current) ? FONTS : [current, ...FONTS];
  for (const f of list) select.appendChild(new Option(f, f, false, f === current));
  select.appendChild(new Option('Autre police…', '__custom'));
  const custom = Object.assign(document.createElement('input'), { className: 'input hidden', placeholder: 'Nom exact de la police installée', spellcheck: false });

  const applyFamily = (name) => {
    const fam = `'${name}', 'Cascadia Code', Consolas, monospace`;
    setPreview(fam);
    persist({ fontFamily: fam });
  };
  select.addEventListener('change', () => {
    if (select.value === '__custom') { custom.classList.remove('hidden'); custom.focus(); return; }
    custom.classList.add('hidden');
    applyFamily(select.value);
  });
  custom.addEventListener('change', () => custom.value.trim() && applyFamily(custom.value.trim()));

  const live = (key, value) => {
    for (const p of panes.values()) if (p.term) p.term.options[key] = value;
    fitTab(active);
  };

  drawerBody.replaceChildren(
    section('Police', select, custom, preview,
      toggleRow('Ligatures', settings.ligatures !== false, (v) => { persist({ ligatures: v }, 0); preview.style.fontVariantLigatures = v ? 'normal' : 'none'; }, '=> != -> dessinés comme des symboles (Cascadia Code, Fira Code…)')),
    section('Taille',
      sliderRow('Taille du texte', 9, 28, 1, settings.fontSize, (v) => `${v} px`, (v) => { live('fontSize', v); persist({ fontSize: v }); }),
      sliderRow('Interligne', 1, 1.8, 0.05, settings.lineHeight, (v) => v.toFixed(2).replace('.', ','), (v) => { live('lineHeight', v); persist({ lineHeight: v }); })),
    section('Curseur',
      segRow([['bar', '▏ Barre'], ['block', '█ Bloc'], ['underline', '▁ Souligné']], settings.cursorStyle, (v) => { live('cursorStyle', v); persist({ cursorStyle: v }, 0); }),
      toggleRow('Clignotant', settings.cursorBlink !== false, (v) => { live('cursorBlink', v); persist({ cursorBlink: v }, 0); }))
  );
  drawerFoot.replaceChildren(button('Terminé', 'primary', closeDrawer));
}
