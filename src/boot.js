'use strict';

/* Nyx Terminal — démarrage (chargé en dernier, une fois toutes les fonctions définies). */

/* global nyx, applyUiPrefs, applyTheme, resolveTheme, restoreSession, openTab */

(async () => {
  const init = await nyx.init();
  settings = init.settings;
  profiles = init.profiles;
  platform = init.platform;
  homeDir = init.home || '';
  isQuake = !!init.quake;
  fontSize = settings.fontSize;
  savedThemeName = settings.themeName;

  document.body.classList.toggle('quake', isQuake);
  applyUiPrefs();
  applyTheme(resolveTheme(settings.themeName));
  try { await document.fonts.ready; } catch { /* ignore */ }

  if (!(init.restore && restoreSession(init.restore))) openTab({ cwd: null });
  requestAnimationFrame(() => document.body.classList.remove('booting'));
})();
