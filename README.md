# Nyx Terminal

Terminal moderne et open source pour Windows : **Electron + xterm.js (rendu WebGL) + node-pty (ConPTY)**.

**[🌙 Site officiel](https://ghostechos.github.io/nyx-terminal/)** · [Télécharger](../../releases/latest) · [Licence MIT](LICENSE)

![Nyx Terminal](docs/assets/hero.webp)

## Télécharger

Va dans **[Releases](../../releases/latest)** et prends :
- `NyxTerminal-Setup-x.y.z.exe` : installeur (raccourcis Bureau et menu Démarrer, désinstallation dans les Paramètres Windows)
- `NyxTerminal-Portable-x.y.z.exe` : un seul fichier, sans installation

Les .exe sont compilés **uniquement par GitHub Actions** à partir du code de ce dépôt ([voir le workflow](.github/workflows/release.yml)), jamais sur un PC personnel.

**Vérifier un téléchargement** : compare l'empreinte avec le fichier `SHA256SUMS.txt` de la Release.

```powershell
Get-FileHash .\NyxTerminal-Setup-0.4.0.exe -Algorithm SHA256
```

> **Avertissement SmartScreen** : les .exe ne sont pas signés numériquement, donc Windows peut afficher « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires**, puis **Exécuter quand même**. Ce message ne signifie pas que le fichier est dangereux, seulement que l'éditeur n'est pas encore connu de Windows.

## Confidentialité

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

Nyx Terminal ne collecte aucune donnée et n'envoie rien sur Internet de lui-même : les seules connexions sont celles que tu lances depuis le terminal (ssh, git…) et les liens que tu ouvres avec Ctrl+clic.

## Fonctionnalités

**Travail**
- **Onglets et panneaux divisés** : plusieurs terminaux côte à côte ou empilés dans un onglet, redimensionnables à la souris (double-clic sur le séparateur pour revenir à 50/50), agrandissement temporaire d'un panneau
- **Blocs de commandes** façon Warp : barre colorée à gauche de chaque commande (vert = réussie, rouge = échec, animée = en cours). Au survol : code de sortie, durée, copier la commande, copier la sortie, relancer
- **Dossier courant** affiché dans la barre d'état (clic = ouvrir dans l'Explorateur) ; nouveaux onglets et panneaux ouverts au même endroit
- **Serveurs SSH** enregistrés avec icône et couleur, plus import automatique de `~/.ssh/config`
- **Restauration de session** : onglets, panneaux, dossiers, taille et position de la fenêtre
- **Terminal Quake** : une touche globale (F12 par défaut) fait descendre un terminal depuis le haut de l'écran
- **Notifications Windows** quand une commande de plus de 10 s se termine alors que tu es ailleurs, plus un point vert ou rouge sur l'onglet

**Apparence**
- 10 thèmes + **éditeur de thème visuel** (aperçu en direct, bouton 🎲 aléatoire, thèmes perso enregistrés)
- **Fond d'écran** : image (flou et visibilité réglables) ou 8 dégradés
- **Ligatures** (`=>`, `!=`, `->`…) avec Cascadia Code, Fira Code ou JetBrains Mono
- Interface animée, halo coloré, palette de commandes (Ctrl+Shift+P)

## Démarrage (sous Windows)

Prérequis : **Node.js 20+**.

```powershell
npm install
npm start
```

## Créer le .exe

```powershell
npm run dist            # installeur + .exe portable dans dist/
```

## Raccourcis

| Action | Raccourci |
|---|---|
| Palette de commandes | Ctrl+Shift+P |
| Personnaliser (thème, fond, police) | Ctrl+Shift+, |
| Nouvel onglet / avec le profil N | Ctrl+Shift+T / Ctrl+Shift+1…9 |
| Diviser automatiquement / à droite / en bas | Alt+Maj+D / Alt+Maj+= / Alt+Maj+- |
| Passer d'un panneau à l'autre | Alt+flèches |
| Redimensionner le panneau | Alt+Maj+flèches |
| Agrandir / restaurer le panneau | Alt+Maj+Z |
| Fermer le panneau (ou l'onglet) | Ctrl+Shift+W |
| Commande précédente / suivante | Ctrl+↑ / Ctrl+↓ |
| Onglet suivant / précédent / N | Ctrl+Tab / Ctrl+Shift+Tab / Alt+1…9 |
| Terminal Quake (global) | F12 |
| Copier / Coller | Ctrl+C (avec sélection) / Ctrl+V, clic droit |
| Rechercher | Ctrl+Shift+F |
| Zoom | Ctrl + / Ctrl − / Ctrl 0 / Ctrl+molette |

## Intégration shell

Les blocs de commandes, le dossier courant et les notifications utilisent les séquences OSC 133 / OSC 7 / OSC 9;9 (les mêmes que VS Code et Windows Terminal). Nyx les active automatiquement :

| Shell | Blocs | Code de sortie | Dossier |
|---|---|---|---|
| PowerShell 5 et 7 | ✓ | ✓ | ✓ |
| Git Bash | ✓ | ✓ | ✓ |
| WSL (bash) | ✓ | ✓ | ✓ |
| Invite de commandes | ✓ | — | ✓ |
| SSH (machine distante) | — | — | — |

Ton profil PowerShell (oh-my-posh, starship…) et ton `.bashrc` sont chargés normalement. Pour WSL, Nyx lance `bash` ; si tu utilises zsh dans WSL, ajoute dans `settings.json` :

```json
"profiles": [{ "id": "wsl", "shellIntegration": false }]
```

## Paramètres

Fichier : `%APPDATA%\Nyx Terminal\settings.json` (Ctrl+,). L'essentiel se règle depuis l'interface, mais tout est modifiable ici :

```json
"quakeHotkey": "F12",          // ou "Ctrl+Alt+T", "" pour désactiver
"quakeHeight": 0.45,
"notifyAfterSeconds": 10,
"restoreSession": true,
"newTabInCurrentDir": true,
"commandBlocks": true,
"ligatures": true,
"servers": [
  { "id": "nas", "name": "NAS", "host": "serveur.exemple.com", "user": "admin", "port": 22, "icon": "🗄", "color": "#22d3ee" }
],
"profiles": [
  { "id": "python", "name": "Python", "icon": "🐍", "color": "#ffd43b", "command": "python.exe" }
]
```

> La touche ² n'est pas utilisable comme raccourci global sous Windows avec Electron : c'est pour ça que le mode Quake utilise F12 par défaut (comme Guake).

## Structure

```
main.js           processus principal : fenêtres, PTY, session, Quake, notifications, serveurs
preload.js        pont IPC sécurisé
shell/            scripts d'intégration (PowerShell, bash)
src/
  renderer.js     onglets, panneaux, clavier, thèmes, barre d'état
  blocks.js       blocs de commandes, dossier courant, ligatures, notifications
  palette.js      palette de commandes
  customize.js    éditeur de thème, fond, police
  servers.js      fenêtre « serveur SSH »
  themes.js       thèmes prédéfinis
  styles.css      interface
```

## Créateur

Nyx Terminal est créé et maintenu par **PIYAS**, alias **Ghosty**.

## Licence

[MIT](LICENSE) © 2026 PIYAS (alias Ghosty)
