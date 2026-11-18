'use strict';

const {
  app, BrowserWindow, ipcMain, shell, clipboard, globalShortcut, screen, Notification, dialog
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');
const THEMES = require('./src/themes.js');

const isWin = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  themeName: 'nyx',
  defaultProfile: isWin ? 'pwsh' : 'shell',
  fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Cascadia Mono', Consolas, monospace",
  fontSize: 14,
  lineHeight: 1.25,
  letterSpacing: 0,
  ligatures: true,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: true,
  rightClickPaste: true,
  closeOnExit: false,
  confirmCloseWithMultipleTabs: true,

  // Apparence
  backgroundGlow: true,
  animations: true,
  statusBar: true,
  dimInactivePanes: true,
  backgroundMaterial: 'none',     // 'none' | 'mica' | 'acrylic' | 'tabbed' (Windows 11)
  background: { type: 'none', image: '', gradient: 'theme', blur: 12, opacity: 0.35 },
  theme: {},
  ui: {},
  customThemes: {},

  // Fonctions
  shellIntegration: true,         // blocs de commandes, dossier courant, notifications
  commandBlocks: true,
  restoreSession: true,
  newTabInCurrentDir: true,
  notifications: true,
  notifyAfterSeconds: 10,
  quakeHotkey: 'F12',             // touche globale du mode Quake ('' pour désactiver)
  quakeHeight: 0.45,
  quakeHideOnBlur: true,
  importSshConfig: true,          // ajoute les hôtes de ~/.ssh/config au menu Serveurs

  // { "id": "nas", "name": "NAS", "host": "serveur.exemple.com", "user": "admin", "port": 22, "identityFile": "", "icon": "🗄", "color": "#22d3ee" }
  servers: [],
  // { "id": "python", "name": "Python", "icon": "🐍", "color": "#ffd43b", "command": "python.exe", "args": [], "cwd": "C:\\dev" }
  profiles: []
};

const userData = () => app.getPath('userData');
const settingsPath = () => path.join(userData(), 'settings.json');
const sessionPath = () => path.join(userData(), 'session.json');

function readUserSettings() {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
    return structuredClone(DEFAULT_SETTINGS);
  }
  const user = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Migration v0.1 : l'ancien fichier contenait un thème complet
  if (!('themeName' in user)) {
    delete user.theme;
    delete user.ui;
    user.themeName = DEFAULT_SETTINGS.themeName;
    fs.writeFileSync(file, JSON.stringify({ ...DEFAULT_SETTINGS, ...user }, null, 2), 'utf8');
  }
  return user;
}

function loadSettings() {
  try {
    const user = readUserSettings();
    return {
      ...DEFAULT_SETTINGS,
      ...user,
      theme: { ...(user.theme || {}) },
      ui: { ...(user.ui || {}) },
      background: { ...DEFAULT_SETTINGS.background, ...(user.background || {}) },
      customThemes: { ...(user.customThemes || {}) },
      servers: Array.isArray(user.servers) ? user.servers : []
    };
  } catch (err) {
    console.error('[settings] JSON invalide, valeurs par défaut utilisées :', err.message);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function updateSettings(patch) {
  let user;
  try { user = readUserSettings(); } catch { user = structuredClone(DEFAULT_SETTINGS); }
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...user, ...patch }, null, 2), 'utf8');
}

function resolveTheme(settings) {
  const all = { ...THEMES, ...(settings.customThemes || {}) };
  const base = all[settings.themeName] || THEMES.aurora;
  return {
    colors: { ...THEMES.aurora.colors, ...base.colors, ...(settings.theme || {}) },
    ui: { ...THEMES.aurora.ui, ...base.ui, ...(settings.ui || {}) },
    light: !!base.light
  };
}

// ---------------------------------------------------------------------------
// Intégration shell : scripts copiés dans le dossier utilisateur (hors de l'asar)
// ---------------------------------------------------------------------------

const integration = { ps: '', bashPath: '' };

function prepareShellIntegration() {
  try {
    const ps = fs.readFileSync(path.join(__dirname, 'shell', 'nyx.ps1'), 'utf8');
    integration.ps = Buffer.from(ps, 'utf16le').toString('base64');
    const dir = path.join(userData(), 'shell-integration');
    fs.mkdirSync(dir, { recursive: true });
    integration.bashPath = path.join(dir, 'nyx.bash');
    // fins de ligne Unix obligatoires pour bash
    fs.writeFileSync(integration.bashPath, fs.readFileSync(path.join(__dirname, 'shell', 'nyx.bash'), 'utf8').replace(/\r\n/g, '\n'));
  } catch (err) {
    console.error('[intégration shell]', err);
  }
}

// ---------------------------------------------------------------------------
// Profils (shells + serveurs SSH)
// ---------------------------------------------------------------------------

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

function guessKind(command) {
  const b = path.basename(String(command || '')).toLowerCase().replace(/\.exe$/, '');
  if (b === 'pwsh' || b === 'powershell') return 'pwsh';
  if (b === 'cmd') return 'cmd';
  if (b === 'wsl') return 'wsl';
  if (b === 'ssh') return 'ssh';
  if (b === 'bash' || b === 'sh') return 'bash';
  return 'other';
}

function sshCommand() {
  if (!isWin) return 'ssh';
  const p = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe');
  return exists(p) ? p : 'ssh.exe';
}

function parseSshConfig() {
  const file = path.join(os.homedir(), '.ssh', 'config');
  if (!exists(file)) return [];
  const hosts = [];
  let current = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\S+)\s*=?\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'host') {
      current = null;
      for (const alias of m[2].split(/\s+/)) {
        if (/[*?!]/.test(alias)) continue;
        current = { id: `cfg-${alias}`, name: alias, host: alias, fromConfig: true };
        hosts.push(current);
      }
    } else if (current && key === 'hostname') current.hostName = m[2];
    else if (current && key === 'user') current.user = m[2];
  }
  return hosts;
}

function allServers(settings) {
  const saved = (settings.servers || []).filter((s) => s && s.id && s.host);
  if (settings.importSshConfig === false) return saved;
  const known = new Set(saved.map((s) => s.host));
  return [...saved, ...parseSshConfig().filter((h) => !known.has(h.host))];
}

function serverToProfile(s) {
  const args = [];
  if (!s.fromConfig) {
    if (s.port && Number(s.port) !== 22) args.push('-p', String(s.port));
    if (s.identityFile) args.push('-i', s.identityFile);
  }
  args.push(...(Array.isArray(s.args) ? s.args : []));
  args.push(!s.fromConfig && s.user ? `${s.user}@${s.host}` : s.host);
  const subtitle = s.fromConfig
    ? `${s.user ? s.user + '@' : ''}${s.hostName || s.host} · ~/.ssh/config`
    : `${s.user ? s.user + '@' : ''}${s.host}${s.port && Number(s.port) !== 22 ? ':' + s.port : ''}`;
  return {
    id: `ssh:${s.id}`, serverId: s.id, server: true, fromConfig: !!s.fromConfig,
    name: s.name || s.host, subtitle, kind: 'ssh',
    command: sshCommand(), args, icon: s.icon || '🖧', color: s.color || '#22d3ee'
  };
}

function detectProfiles(settings) {
  const profiles = [];

  if (isWin) {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';

    const pwsh = path.join(pf, 'PowerShell', '7', 'pwsh.exe');
    if (exists(pwsh)) profiles.push({ id: 'pwsh', name: 'PowerShell 7', kind: 'pwsh', command: pwsh, args: ['-NoLogo'], icon: '⚡', color: '#4ea1ff' });
    profiles.push({ id: 'powershell', name: 'Windows PowerShell', kind: 'pwsh', command: path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoLogo'], icon: '❯', color: '#3b82f6' });
    profiles.push({ id: 'cmd', name: 'Invite de commandes', kind: 'cmd', command: path.join(sysRoot, 'System32', 'cmd.exe'), args: [], icon: '▸', color: '#facc15' });

    const wsl = path.join(sysRoot, 'System32', 'wsl.exe');
    if (exists(wsl)) profiles.push({ id: 'wsl', name: 'WSL', kind: 'wsl', command: wsl, args: [], icon: '🐧', color: '#fb923c' });

    const gitBash = path.join(pf, 'Git', 'bin', 'bash.exe');
    if (exists(gitBash)) profiles.push({ id: 'gitbash', name: 'Git Bash', kind: 'bash', command: gitBash, args: ['--login', '-i'], icon: '⎇', color: '#f05033' });
  } else {
    const sh = process.env.SHELL || '/bin/bash';
    profiles.push({ id: 'shell', name: path.basename(sh), kind: guessKind(sh), command: sh, args: ['-l'], icon: '❯', color: '#2ee6c5' });
    if (exists('/bin/sh')) profiles.push({ id: 'sh', name: 'sh', kind: 'other', command: '/bin/sh', args: [], icon: '$', color: '#facc15' });
  }

  for (const p of settings.profiles || []) {
    if (!p || !p.id) continue;
    const i = profiles.findIndex((x) => x.id === p.id);
    if (i >= 0) profiles[i] = { ...profiles[i], ...p };
    else profiles.push({ args: [], icon: '❯', name: p.id, kind: guessKind(p.command), ...p });
  }
  for (const s of allServers(settings)) profiles.push(serverToProfile(s));
  return profiles;
}

// Convertit un dossier (Windows, Git Bash /c/..., WSL /mnt/c/...) en chemin utilisable comme cwd
function toNativePath(p) {
  if (!p) return null;
  if (!isWin) return p.startsWith('/') ? p : null;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return p;
  const m = p.match(/^\/(?:mnt\/)?([a-zA-Z])(\/.*)?$/);
  if (m) return `${m[1].toUpperCase()}:${(m[2] || '/').replace(/\//g, '\\')}`;
  return null;
}

const toWslPath = (p) => p.replace(/^([a-zA-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');

function buildLaunch(profile, cwd, settings) {
  let args = [...(profile.args || [])];
  const env = {
    ...process.env,
    ...(profile.env || {}),
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'NyxTerminal',
    TERM_PROGRAM_VERSION: app.getVersion(),
    NYX_TERMINAL: '1'
  };
  const integrate = settings.shellIntegration !== false && profile.shellIntegration !== false;
  const target = cwd || profile.cwd || null;
  let spawnCwd = os.homedir();

  if (profile.kind === 'wsl') {
    args = ['--cd', target || '~', ...args];
    if (integrate && integration.bashPath) {
      args.push('-e', 'bash', '--init-file', toWslPath(integration.bashPath), '-i');
      env.NYX_SHELL_LOGIN = '1';
      env.WSLENV = [process.env.WSLENV, 'NYX_SHELL_LOGIN/u'].filter(Boolean).join(':');
    }
  } else {
    const native = toNativePath(target);
    if (native && exists(native)) spawnCwd = native;

    if (integrate && profile.kind === 'pwsh' && integration.ps && !args.some((a) => /^-(c|command|file|encodedcommand)$/i.test(a))) {
      args = [...args.filter((a) => !/^-noexit$/i.test(a)), '-NoExit', '-EncodedCommand', integration.ps];
    } else if (integrate && profile.kind === 'cmd') {
      env.PROMPT = '$E]133;D$E\\$E]9;9;$P$E\\$E]133;A$E\\' + (process.env.PROMPT || '$P$G') + '$E]133;B$E\\';
    } else if (integrate && profile.kind === 'bash' && integration.bashPath) {
      const login = args.some((a) => a === '--login' || a === '-l');
      args = ['--init-file', isWin ? integration.bashPath.replace(/\\/g, '/') : integration.bashPath, '-i'];
      if (login) env.NYX_SHELL_LOGIN = '1';
    }
  }
  return { command: profile.command, args, env, cwd: spawnCwd };
}

// ---------------------------------------------------------------------------
// Sessions PTY
// ---------------------------------------------------------------------------

const sessions = new Map(); // id -> { proc, wcId }
let nextId = 1;

function killSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try { s.proc.kill(); } catch { /* déjà terminé */ }
}

function killSessionsOf(wcId) {
  for (const [id, s] of sessions) if (s.wcId === wcId) killSession(id);
}

ipcMain.handle('pty:create', (event, { profileId, cols, rows, cwd }) => {
  const settings = loadSettings();
  const profiles = detectProfiles(settings);
  const profile = profiles.find((p) => p.id === profileId) || profiles[0];
  const wc = event.sender;
  const launch = buildLaunch(profile, cwd, settings);

  const options = {
    name: 'xterm-256color',
    cols: Math.max(2, cols | 0),
    rows: Math.max(1, rows | 0),
    cwd: launch.cwd,
    env: launch.env
  };
  // ConPTY récent fourni par node-pty (celui de Windows Terminal) : meilleur support des séquences
  // OSC utilisées par les blocs de commandes. Repli sur le ConPTY du système en cas d'échec.
  let proc;
  if (isWin && settings.useBundledConpty !== false) {
    try { proc = pty.spawn(launch.command, launch.args, { ...options, useConptyDll: true }); } catch (err) { console.warn('[conpty.dll]', err.message); }
  }
  if (!proc) proc = pty.spawn(launch.command, launch.args, options);

  const id = nextId++;
  sessions.set(id, { proc, wcId: wc.id });

  let buffer = '';
  let timer = null;
  const flush = () => {
    timer = null;
    if (buffer && !wc.isDestroyed()) wc.send('pty:data', id, buffer);
    buffer = '';
  };
  proc.onData((data) => {
    buffer += data;
    if (!timer) timer = setTimeout(flush, 4);
  });
  proc.onExit(({ exitCode }) => {
    if (timer) { clearTimeout(timer); flush(); }
    sessions.delete(id);
    if (!wc.isDestroyed()) wc.send('pty:exit', id, exitCode);
  });

  return { id, profileId: profile.id };
});

ipcMain.on('pty:write', (_e, id, data) => { sessions.get(id)?.proc.write(data); });
ipcMain.on('pty:resize', (_e, id, cols, rows) => {
  const s = sessions.get(id);
  if (s && cols > 0 && rows > 0) { try { s.proc.resize(cols, rows); } catch { /* fermeture */ } }
});
ipcMain.on('pty:kill', (_e, id) => killSession(id));

// ---------------------------------------------------------------------------
// Restauration de session
// ---------------------------------------------------------------------------

const sessionState = new Map();   // id de fenêtre -> { tabs, activeTab, bounds, maximized }
const pendingRestore = new Map(); // id de webContents -> données à restaurer
let sessionTimer = null;

function readSession() {
  try { return JSON.parse(fs.readFileSync(sessionPath(), 'utf8')); } catch { return { windows: [] }; }
}

function writeSession() {
  clearTimeout(sessionTimer);
  try {
    const windows = [];
    for (const [id, st] of sessionState) {
      const w = BrowserWindow.fromId(id);
      if (w && !w.isDestroyed()) { st.bounds = w.getNormalBounds(); st.maximized = w.isMaximized(); }
      if (st.tabs && st.tabs.length) windows.push(st);
    }
    fs.writeFileSync(sessionPath(), JSON.stringify({ version: 1, windows }, null, 2), 'utf8');
  } catch (err) {
    console.error('[session]', err);
  }
}
const scheduleSessionWrite = () => { clearTimeout(sessionTimer); sessionTimer = setTimeout(writeSession, 800); };

ipcMain.on('session:update', (e, state) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.__quake || !state) return;
  sessionState.set(win.id, { ...(sessionState.get(win.id) || {}), tabs: state.tabs, activeTab: state.activeTab });
  scheduleSessionWrite();
});

function boundsVisible(b) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80);
}

// ---------------------------------------------------------------------------
// Mode Quake (fenêtre qui descend du haut de l'écran)
// ---------------------------------------------------------------------------

let quakeWin = null;
let dialogOpen = false;
let registeredHotkey = null;

function placeQuake(win) {
  const s = loadSettings();
  const { workArea: wa } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const ratio = Math.min(0.95, Math.max(0.2, Number(s.quakeHeight) || 0.45));
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: Math.round(wa.height * ratio) });
}

function showQuake() {
  if (!quakeWin || quakeWin.isDestroyed()) return;
  placeQuake(quakeWin);
  quakeWin.show();
  quakeWin.focus();
  quakeWin.webContents.send('quake:show');
}

function hideQuake() {
  if (!quakeWin || quakeWin.isDestroyed() || quakeWin.__hiding) return;
  quakeWin.__hiding = true;
  quakeWin.webContents.send('quake:hide');
  setTimeout(() => {
    if (quakeWin && !quakeWin.isDestroyed()) { quakeWin.hide(); quakeWin.__hiding = false; }
  }, 230);
}

function toggleQuake() {
  if (!quakeWin || quakeWin.isDestroyed()) { quakeWin = createWindow({ quake: true }); return; }
  if (quakeWin.isVisible() && quakeWin.isFocused()) hideQuake();
  else showQuake();
}

function broadcast(channel, ...args) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, ...args);
}

function registerQuakeHotkey() {
  const key = (loadSettings().quakeHotkey || '').trim();
  if (key === registeredHotkey) return;
  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  registeredHotkey = null;
  if (!key) return;
  try {
    if (globalShortcut.register(key, toggleQuake)) registeredHotkey = key;
    else broadcast('toast', `Raccourci Quake « ${key} » déjà utilisé par une autre application`);
  } catch {
    broadcast('toast', `Raccourci Quake invalide : ${key}`);
  }
}

ipcMain.on('quake:toggle', () => toggleQuake());

// ---------------------------------------------------------------------------
// Divers IPC
// ---------------------------------------------------------------------------

ipcMain.handle('app:init', (e) => {
  const settings = loadSettings();
  const win = BrowserWindow.fromWebContents(e.sender);
  const restore = pendingRestore.get(e.sender.id) || null;
  pendingRestore.delete(e.sender.id);
  return {
    settings,
    profiles: detectProfiles(settings),
    platform: process.platform,
    version: app.getVersion(),
    home: os.homedir(),
    quake: !!(win && win.__quake),
    restore
  };
});

ipcMain.handle('settings:open', () => shell.openPath(settingsPath()));
ipcMain.handle('settings:update', (_e, patch) => {
  if (patch && typeof patch === 'object') updateSettings(patch);
  const settings = loadSettings();
  return { settings, profiles: detectProfiles(settings) };
});

ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.on('window:new', () => createWindow());
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

ipcMain.on('window:overlay', (e, color, symbolColor) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || !isWin || win.__quake) return;
  try { win.setTitleBarOverlay({ color, symbolColor }); } catch { /* ignore */ }
});

ipcMain.on('open:external', (_e, url) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(u.href);
  } catch { /* URL invalide */ }
});

ipcMain.on('shell:open-folder', (_e, p) => {
  const native = toNativePath(p);
  if (native && exists(native) && fs.statSync(native).isDirectory()) shell.openPath(native);
});

async function pickFile(e, options) {
  const win = BrowserWindow.fromWebContents(e.sender);
  dialogOpen = true;
  try {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'showHiddenFiles'], ...options });
    return r.canceled ? null : r.filePaths[0] || null;
  } finally {
    dialogOpen = false;
  }
}

ipcMain.handle('file:pick', (e, opts) => pickFile(e, {
  title: opts?.title || 'Choisir un fichier',
  defaultPath: opts?.defaultPath || path.join(os.homedir(), '.ssh')
}));

ipcMain.handle('background:pick', async (e) => {
  const src = await pickFile(e, {
    title: 'Choisir une image de fond',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }]
  });
  if (!src) return null;
  const dir = path.join(userData(), 'backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `fond-${Date.now()}${path.extname(src).toLowerCase()}`);
  fs.copyFileSync(src, dest);
  return dest;
});

// Notifications Windows (fin d'une longue commande)
const liveNotifications = new Set();
ipcMain.on('notify', (e, { title, body, paneId }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (!win.isFocused()) win.flashFrame(true);
  if (!Notification.isSupported()) return;
  const icon = path.join(__dirname, 'build', 'icon.png');
  const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 240), ...(exists(icon) ? { icon } : {}) });
  liveNotifications.add(n);
  const done = () => liveNotifications.delete(n);
  n.on('click', () => {
    done();
    if (win.isDestroyed()) return;
    if (win.__quake) showQuake();
    else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    win.webContents.send('focus-pane', paneId);
  });
  n.on('close', done);
  n.show();
});

// Rechargement à chaud de settings.json
let watchTimer = null;
function watchSettings() {
  const file = settingsPath();
  loadSettings();
  fs.watch(path.dirname(file), (_ev, name) => {
    if (name !== path.basename(file)) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      const settings = loadSettings();
      broadcast('settings:changed', settings, detectProfiles(settings));
      registerQuakeHotkey();
    }, 120);
  });
}

// ---------------------------------------------------------------------------
// Fenêtres
// ---------------------------------------------------------------------------

function createWindow({ restore = null, quake = false } = {}) {
  const s = loadSettings();
  const t = resolveTheme(s);
  const translucent = !quake && isWin && s.backgroundMaterial && s.backgroundMaterial !== 'none';
  const icon = path.join(__dirname, 'build', 'icon.ico');

  const common = {
    title: 'Nyx Terminal',
    show: false,
    ...(exists(icon) ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  };

  const win = quake
    ? new BrowserWindow({
        ...common,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        skipTaskbar: true,
        alwaysOnTop: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        hasShadow: false
      })
    : new BrowserWindow({
        ...common,
        width: 1120,
        height: 720,
        minWidth: 520,
        minHeight: 300,
        backgroundColor: translucent ? '#00000000' : t.ui.tabBar,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: translucent ? '#00000000' : t.ui.tabBar, symbolColor: t.ui.text, height: 40 },
        ...(translucent ? { backgroundMaterial: s.backgroundMaterial } : {})
      });

  const winId = win.id;
  win.__quake = quake;
  win.removeMenu();
  if (restore && restore.bounds && boundsVisible(restore.bounds)) win.setBounds(restore.bounds);
  if (restore) pendingRestore.set(win.webContents.id, restore);

  win.once('ready-to-show', () => {
    if (quake) { showQuake(); return; }
    if (restore && restore.maximized) win.maximize();
    win.show();
  });

  const wcId = win.webContents.id;
  win.webContents.on('destroyed', () => killSessionsOf(wcId));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('focus', () => win.flashFrame(false));

  if (quake) {
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.on('blur', () => {
      if (loadSettings().quakeHideOnBlur !== false && !dialogOpen && win.isVisible()) hideQuake();
    });
    win.on('closed', () => { if (quakeWin === win) quakeWin = null; });
  } else {
    win.on('closed', () => {
      const others = BrowserWindow.getAllWindows().filter((w) => w.id !== winId && !w.__quake && !w.isDestroyed());
      // seule la dernière fenêtre fermée forme la session à restaurer
      if (others.length) sessionState.delete(winId);
      writeSession();
    });
    win.on('close', () => {
      const st = sessionState.get(winId);
      if (st) { st.bounds = win.getNormalBounds(); st.maximized = win.isMaximized(); }
    });
  }

  const query = quake ? { quake: '1' } : {};
  win.loadFile(path.join(__dirname, 'src', 'index.html'), { query });
  return win;
}

app.whenReady().then(() => {
  if (isWin) app.setAppUserModelId('com.nyx.terminal');
  prepareShellIntegration();
  watchSettings();

  const settings = loadSettings();
  const saved = settings.restoreSession !== false ? (readSession().windows || []).filter((w) => w.tabs && w.tabs.length) : [];
  if (saved.length) saved.forEach((w) => createWindow({ restore: w }));
  else createWindow();

  registerQuakeHotkey();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  for (const id of [...sessions.keys()]) killSession(id);
  if (process.platform !== 'darwin') app.quit();
});

// Quand il ne reste que la fenêtre Quake (cachée), fermer la dernière fenêtre normale quitte l'appli
app.on('browser-window-created', (_e, w) => {
  w.on('closed', () => {
    const normal = BrowserWindow.getAllWindows().filter((x) => !x.__quake && !x.isDestroyed());
    if (!normal.length && quakeWin && !quakeWin.isDestroyed() && !quakeWin.isVisible()) quakeWin.destroy();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
