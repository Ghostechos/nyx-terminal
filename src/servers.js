'use strict';

/* Nyx Terminal — ajout / modification des serveurs SSH enregistrés. */

/* global $, settings, nyx, toast, escapeHtml, applySettings, openTab, activePane, hideMenu, closePalette, palette */

const modalBackdrop = $('#modal-backdrop');
const modalEl = $('#modal');
const modalOpen = () => !modalBackdrop.classList.contains('hidden');

const SERVER_ICONS = ['🖧', '🗄', '☁', '🐧', '🍓', '🐳', '🎮', '🔒', '🏠', '⚙', '🚀', '📦'];
const SERVER_COLORS = ['#22d3ee', '#4ea1ff', '#a277ff', '#ff7edb', '#f7768e', '#fb923c', '#facc15', '#3ee6a8'];

function closeModal() {
  modalBackdrop.classList.add('hidden');
  modalEl.replaceChildren();
  activePane() && activePane().term.focus();
}

function openServerModal(serverId = null) {
  hideMenu();
  if (palette.open) closePalette();
  const existing = serverId ? (settings.servers || []).find((s) => s.id === serverId) : null;
  const s = existing
    ? { port: 22, icon: '🖧', color: SERVER_COLORS[0], ...existing }
    : { id: '', name: '', host: '', user: '', port: 22, identityFile: '', icon: '🖧', color: SERVER_COLORS[(settings.servers || []).length % SERVER_COLORS.length] };

  modalEl.innerHTML = `
    <div class="m-head">
      <span class="m-chip"></span>
      <div><h2>${existing ? 'Modifier le serveur' : 'Nouveau serveur SSH'}</h2><code class="m-cmd"></code></div>
    </div>
    <div class="m-grid">
      <label class="f full"><span>Nom</span><input class="input" name="name" placeholder="Mon NAS" spellcheck="false"></label>
      <label class="f wide"><span>Hôte</span><input class="input" name="host" placeholder="192.168.1.10 ou moi@serveur:2222" spellcheck="false" required></label>
      <label class="f"><span>Port</span><input class="input" name="port" type="number" min="1" max="65535"></label>
      <label class="f full"><span>Utilisateur</span><input class="input" name="user" placeholder="${escapeHtml('root')}" spellcheck="false"></label>
      <label class="f full"><span>Clé privée <small>(facultatif)</small></span>
        <span class="f-inline"><input class="input" name="identityFile" placeholder="C:\\Users\\moi\\.ssh\\id_ed25519" spellcheck="false"><button type="button" class="btn ghost" data-act="browse">Parcourir…</button></span>
      </label>
      <div class="f full"><span>Icône</span><div class="pick icons"></div></div>
      <div class="f full"><span>Couleur</span><div class="pick colors"></div></div>
    </div>
    <div class="m-foot">
      ${existing ? '<button class="btn danger" data-act="delete">Supprimer</button>' : ''}
      <span class="spacer"></span>
      <button class="btn ghost" data-act="cancel">Annuler</button>
      <button class="btn" data-act="save">Enregistrer</button>
      <button class="btn primary" data-act="connect">Enregistrer et connecter</button>
    </div>`;

  const field = (n) => modalEl.querySelector(`[name="${n}"]`);
  for (const k of ['name', 'host', 'user', 'port', 'identityFile']) field(k).value = s[k] ?? '';

  const icons = modalEl.querySelector('.pick.icons');
  for (const ic of SERVER_ICONS) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: ic, className: ic === s.icon ? 'on' : '' });
    b.addEventListener('click', () => { s.icon = ic; for (const x of icons.children) x.classList.toggle('on', x === b); refresh(); });
    icons.appendChild(b);
  }
  const colors = modalEl.querySelector('.pick.colors');
  for (const c of SERVER_COLORS) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: `dot${c === s.color ? ' on' : ''}` });
    b.style.setProperty('--c', c);
    b.addEventListener('click', () => { s.color = c; for (const x of colors.children) x.classList.toggle('on', x === b); refresh(); });
    colors.appendChild(b);
  }

  function read() {
    s.name = field('name').value.trim();
    s.host = field('host').value.trim();
    s.user = field('user').value.trim();
    s.port = Number(field('port').value) || 22;
    s.identityFile = field('identityFile').value.trim();
  }

  function refresh() {
    read();
    const chip = modalEl.querySelector('.m-chip');
    chip.textContent = s.icon;
    chip.style.setProperty('--c', s.color);
    const target = `${s.user ? s.user + '@' : ''}${s.host || 'hôte'}`;
    modalEl.querySelector('.m-cmd').textContent = `ssh ${s.port !== 22 ? `-p ${s.port} ` : ''}${s.identityFile ? `-i "${s.identityFile}" ` : ''}${target}`;
  }

  // « moi@serveur:2222 » dans le champ Hôte -> remplit utilisateur et port
  field('host').addEventListener('blur', () => {
    const m = field('host').value.trim().match(/^(?:([^@\s]+)@)?([^:\s]+)(?::(\d+))?$/);
    if (!m) return;
    if (m[1]) field('user').value = m[1];
    if (m[3]) field('port').value = m[3];
    field('host').value = m[2];
    if (!field('name').value.trim()) field('name').value = m[2];
    refresh();
  });
  modalEl.addEventListener('input', refresh);

  let deleteArmed = false;
  modalEl.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
    if (!act) return;
    if (act === 'cancel') closeModal();
    else if (act === 'browse') {
      const p = await nyx.pickFile({ title: 'Choisir une clé privée SSH' });
      if (p) { field('identityFile').value = p; refresh(); }
    } else if (act === 'delete') {
      if (!deleteArmed) { deleteArmed = true; e.target.textContent = 'Confirmer la suppression'; return; }
      const res = await nyx.updateSettings({ servers: (settings.servers || []).filter((x) => x.id !== s.id) });
      applySettings(res.settings, res.profiles);
      toast('Serveur supprimé');
      closeModal();
    } else if (act === 'save' || act === 'connect') {
      await save(act === 'connect');
    }
  });

  async function save(connect) {
    read();
    if (!s.host) {
      field('host').classList.add('invalid');
      field('host').focus();
      return;
    }
    if (!s.id) {
      const base = (s.name || s.host).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'serveur';
      s.id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const entry = { id: s.id, name: s.name || s.host, host: s.host, user: s.user, port: s.port, identityFile: s.identityFile, icon: s.icon, color: s.color };
    const list = (settings.servers || []).filter((x) => x.id !== s.id);
    const res = await nyx.updateSettings({ servers: [...list, entry] });
    applySettings(res.settings, res.profiles);
    closeModal();
    toast(`Serveur « ${entry.name} » enregistré`);
    if (connect) openTab({ profileId: `ssh:${entry.id}` });
  }

  modalEl.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(true); }
  };

  modalBackdrop.classList.remove('hidden');
  refresh();
  setTimeout(() => (existing ? field('name') : field('host')).focus(), 30);
}

modalBackdrop.addEventListener('mousedown', (e) => { if (e.target === modalBackdrop) closeModal(); });
