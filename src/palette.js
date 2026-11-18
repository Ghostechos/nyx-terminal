'use strict';

/* Nyx Terminal — palette de commandes (Ctrl+Shift+P) avec recherche floue et aperçu des thèmes. */

/* global $, settings, profiles, theme, savedThemeName, allThemes, resolveTheme, applyTheme, setTheme, nyx, toast,
          openTab, splitPane, closePane, closeTab, togglePaneZoom, renameTab, openSearch, setFontSize, fontSize,
          active, activePane, tabPanes, hideMenu, openDrawer, openServerModal, isQuake, escapeHtml, jumpToBlock, applySettings */

const paletteBackdrop = $('#palette-backdrop');
const paletteInput = $('#palette-input');
const paletteList = $('#palette-list');

const palette = { items: [], shown: [], sel: 0, open: false, themeBefore: null };

function swatchesHtml(t) {
  const c = t.colors;
  return `<span class="swatches">${[t.ui.accent, t.ui.accent2, c.red, c.green, c.yellow, c.blue]
    .map((x) => `<i style="background:${x}"></i>`).join('')}</span>`;
}

function toggleCmd(group, key, label, icon, defaultOn = true) {
  const on = settings[key] === undefined ? defaultOn : settings[key] !== false;
  return {
    group, icon, label: `${on ? 'Désactiver' : 'Activer'} : ${label}`,
    run: async () => applySettings(...Object.values(await nyx.updateSettings({ [key]: !on })))
  };
}

function buildCommands() {
  const cmds = [];
  const shells = profiles.filter((p) => !p.server);
  const servers = profiles.filter((p) => p.server);
  const pane = activePane();
  const multi = active && tabPanes(active).length > 1;

  shells.forEach((p, i) => cmds.push({
    group: 'Nouvel onglet', icon: p.icon || '❯', color: p.color, label: `Nouvel onglet : ${p.name}`,
    hint: i < 9 ? `Ctrl+Shift+${i + 1}` : '', run: () => openTab({ profileId: p.id })
  }));

  for (const p of servers) {
    cmds.push({ group: 'Serveurs SSH', icon: p.icon, color: p.color, label: `Se connecter : ${p.name}`, hint: p.subtitle, run: () => openTab({ profileId: p.id }) });
  }
  cmds.push({ group: 'Serveurs SSH', icon: '＋', label: 'Ajouter un serveur SSH…', run: () => openServerModal() });
  for (const p of servers.filter((x) => !x.fromConfig)) {
    cmds.push({ group: 'Serveurs SSH', icon: '✎', color: p.color, label: `Modifier le serveur : ${p.name}`, run: () => openServerModal(p.serverId) });
  }

  cmds.push(
    { group: 'Panneaux', icon: '◫', label: 'Diviser à droite', hint: 'Alt+Maj+=', run: () => splitPane('h') },
    { group: 'Panneaux', icon: '⊟', label: 'Diviser en bas', hint: 'Alt+Maj+-', run: () => splitPane('v') },
    { group: 'Panneaux', icon: '⊞', label: 'Diviser automatiquement', hint: 'Alt+Maj+D', run: () => splitPane('auto') }
  );
  for (const p of servers) {
    cmds.push({ group: 'Panneaux', icon: p.icon, color: p.color, label: `Diviser avec : ${p.name}`, run: () => splitPane('auto', p) });
  }
  if (multi) {
    cmds.push(
      { group: 'Panneaux', icon: '⤢', label: active.zoomed ? 'Restaurer les panneaux' : 'Agrandir le panneau', hint: 'Alt+Maj+Z', run: togglePaneZoom },
      { group: 'Panneaux', icon: '✕', label: 'Fermer le panneau', hint: 'Ctrl+Shift+W', run: () => pane && closePane(pane) }
    );
  }

  const themes = allThemes();
  for (const [id, t] of Object.entries(themes)) {
    const resolved = resolveTheme(id, false);
    const custom = !!(settings.customThemes || {})[id];
    cmds.push({
      group: 'Thèmes', icon: custom ? '★' : '●', color: resolved.ui.accent, label: `Thème : ${t.name || id}`,
      extra: swatchesHtml(resolved) + (id === savedThemeName ? '<span class="current">actuel</span>' : ''),
      preview: () => applyTheme(resolveTheme(id, id === savedThemeName)),
      run: () => setTheme(id)
    });
  }
  cmds.push({ group: 'Thèmes', icon: '🎨', label: 'Créer ou modifier un thème…', run: () => openDrawer('colors') });
  for (const [id, t] of Object.entries(settings.customThemes || {})) {
    cmds.push({
      group: 'Thèmes', icon: '🗑', label: `Supprimer le thème : ${t.name || id}`,
      run: async () => {
        const customThemes = { ...settings.customThemes };
        delete customThemes[id];
        const patch = { customThemes };
        if (settings.themeName === id) patch.themeName = 'aurora';
        applySettings(...Object.values(await nyx.updateSettings(patch)));
        toast('Thème supprimé');
      }
    });
  }

  cmds.push(
    { group: 'Apparence', icon: '🖼', label: "Fond d'écran (image ou dégradé)…", run: () => openDrawer('background') },
    { group: 'Apparence', icon: 'Aa', label: 'Police, taille et curseur…', run: () => openDrawer('font') },
    toggleCmd('Apparence', 'ligatures', 'ligatures de police', '≠'),
    toggleCmd('Apparence', 'backgroundGlow', 'halo coloré', '✦'),
    toggleCmd('Apparence', 'statusBar', "barre d'état", '▁'),
    toggleCmd('Apparence', 'dimInactivePanes', 'assombrir les panneaux inactifs', '◑'),
    toggleCmd('Apparence', 'animations', 'animations', '〰'),
    toggleCmd('Apparence', 'cursorBlink', 'curseur clignotant', '▏'),
    { group: 'Apparence', icon: '+', label: 'Zoom avant', hint: 'Ctrl +', run: () => setFontSize(fontSize + 1) },
    { group: 'Apparence', icon: '−', label: 'Zoom arrière', hint: 'Ctrl −', run: () => setFontSize(fontSize - 1) },
    { group: 'Apparence', icon: '○', label: 'Réinitialiser le zoom', hint: 'Ctrl 0', run: () => setFontSize(settings.fontSize) },

    { group: 'Terminal', icon: '⌕', label: 'Rechercher', hint: 'Ctrl+Shift+F', run: openSearch },
    { group: 'Terminal', icon: '↑', label: 'Commande précédente (bloc)', hint: 'Ctrl+↑', run: () => jumpToBlock(-1) },
    { group: 'Terminal', icon: '↓', label: 'Commande suivante (bloc)', hint: 'Ctrl+↓', run: () => jumpToBlock(1) },
    toggleCmd('Terminal', 'commandBlocks', 'blocs de commandes', '▤'),
    toggleCmd('Terminal', 'notifications', 'notifications de fin de commande', '🔔'),
    { group: 'Terminal', icon: '⌫', label: "Effacer l'écran", run: () => pane && pane.term.clear() },
    { group: 'Terminal', icon: '✎', label: "Renommer l'onglet", run: () => active && renameTab(active) },
    { group: 'Terminal', icon: '✕', label: "Fermer l'onglet", run: () => active && closeTab(active) },

    ...(isQuake ? [] : [{ group: 'Fenêtre', icon: '⬒', label: 'Afficher le terminal Quake', hint: settings.quakeHotkey || '', run: () => nyx.toggleQuake() }]),
    toggleCmd('Fenêtre', 'restoreSession', 'restaurer la session au démarrage', '⟲'),
    { group: 'Fenêtre', icon: '⧉', label: 'Nouvelle fenêtre', hint: 'Ctrl+Shift+N', run: () => nyx.newWindow() },
    { group: 'Fenêtre', icon: '⚙', label: 'Ouvrir settings.json', hint: 'Ctrl+,', run: () => nyx.openSettings() }
  );
  return cmds;
}

// Recherche floue, sans accents (« theme » trouve « Thème »)
function fuzzy(query, text) {
  if (!query) return { score: 0, idx: [] };
  const norm = (str) => [...str.toLowerCase()].map((ch) => ch.normalize('NFD')[0]).join('');
  const q = norm(query), s = norm(text);
  // correspondance exacte d'un morceau : bien mieux classée qu'une suite de lettres éparpillées
  const sub = s.indexOf(q.trim());
  if (q.trim() && sub >= 0) {
    const n = q.trim().length;
    return { score: 100 + n * 5 - sub * 0.5 + (sub === 0 || ' :'.includes(s[sub - 1]) ? 20 : 0), idx: Array.from({ length: n }, (_, k) => sub + k) };
  }
  const idx = [];
  let score = 0, j = 0, prev = -2;
  for (let i = 0; i < s.length && j < q.length; i++) {
    if (q[j] === ' ') { j++; i--; continue; }
    if (s[i] === q[j]) {
      idx.push(i);
      score += prev === i - 1 ? 5 : 1;
      if (i === 0 || ' :'.includes(s[i - 1])) score += 3;
      prev = i;
      j++;
    }
  }
  return j === q.length ? { score: score - s.length * 0.01, idx } : null;
}

function highlight(text, idx) {
  const set = new Set(idx);
  return [...text].map((ch, i) => (set.has(i) ? `<mark>${escapeHtml(ch)}</mark>` : escapeHtml(ch))).join('');
}

function openPalette(prefill = '') {
  hideMenu();
  palette.items = buildCommands();
  palette.themeBefore = theme;
  palette.open = true;
  paletteBackdrop.classList.remove('hidden');
  paletteInput.value = prefill;
  renderPalette();
  paletteInput.focus();
  paletteInput.setSelectionRange(prefill.length, prefill.length);
}

function closePalette(restore = true) {
  if (!palette.open) return;
  palette.open = false;
  paletteBackdrop.classList.add('hidden');
  if (restore && palette.themeBefore && theme !== palette.themeBefore) applyTheme(palette.themeBefore);
  activePane() && activePane().term.focus();
}

function renderPalette() {
  const q = paletteInput.value.trim();
  palette.shown = palette.items
    .map((c) => ({ c, m: fuzzy(q, c.label) }))
    .filter((x) => x.m)
    .sort((a, b) => (q ? b.m.score - a.m.score : 0));
  palette.sel = 0;
  if (!palette.shown.length) {
    paletteList.innerHTML = '<div class="p-empty">Aucune commande</div>';
    return;
  }
  let html = '';
  let group = null;
  palette.shown.forEach(({ c, m }, i) => {
    if (!q && c.group !== group) { group = c.group; html += `<div class="p-group">${escapeHtml(group)}</div>`; }
    html += `<div class="p-item" data-i="${i}" style="--c:${c.color || 'var(--accent)'};animation-delay:${Math.min(i, 12) * 12}ms">
      <span class="chip">${escapeHtml(c.icon)}</span>
      <span class="label">${highlight(c.label, m.idx)}</span>
      ${c.extra || ''}${c.hint ? `<span class="hint">${escapeHtml(c.hint)}</span>` : ''}
    </div>`;
  });
  paletteList.innerHTML = html;
  selectPalette(0, false);
}

function selectPalette(i, preview = true) {
  const n = palette.shown.length;
  if (!n) return;
  palette.sel = (i + n) % n;
  for (const el of paletteList.querySelectorAll('.p-item')) el.classList.toggle('selected', Number(el.dataset.i) === palette.sel);
  const sel = paletteList.querySelector('.p-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
  const cmd = palette.shown[palette.sel].c;
  if (preview) {
    if (cmd.preview) cmd.preview();
    else if (theme !== palette.themeBefore) applyTheme(palette.themeBefore);
  }
}

function runPalette(i = palette.sel) {
  const item = palette.shown[i];
  if (!item) return;
  closePalette(!item.c.preview);
  item.c.run();
}

paletteInput.addEventListener('input', renderPalette);
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); selectPalette(palette.sel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectPalette(palette.sel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); runPalette(); }
  else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
});
paletteList.addEventListener('mousemove', (e) => {
  const el = e.target.closest('.p-item');
  if (el && Number(el.dataset.i) !== palette.sel) selectPalette(Number(el.dataset.i));
});
paletteList.addEventListener('click', (e) => {
  const el = e.target.closest('.p-item');
  if (el) runPalette(Number(el.dataset.i));
});
paletteBackdrop.addEventListener('mousedown', (e) => { if (e.target === paletteBackdrop) closePalette(); });
$('#palette-btn').addEventListener('click', () => openPalette());
