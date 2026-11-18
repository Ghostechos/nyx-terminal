# Sécurité

Si tu trouves une faille de sécurité dans Nyx Terminal, merci de **ne pas** ouvrir d'issue publique. Utilise plutôt l'onglet **Security → Report a vulnerability** de ce dépôt GitHub (signalement privé).

Points de conception :
- l'interface tourne dans un renderer isolé (`contextIsolation`, `sandbox`, `nodeIntegration: false`) avec une politique CSP stricte ;
- seul `preload.js` expose une liste fermée de fonctions au renderer ;
- la navigation et l'ouverture de nouvelles fenêtres sont bloquées ; seuls les liens `http(s)` sont ouverts, dans le navigateur, après un Ctrl+clic.
