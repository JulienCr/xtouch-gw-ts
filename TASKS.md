# XTouch GW – Tâches (Kanban)

> Source de vérité de l’avancement. Mettez à jour ce fichier à chaque étape importante.

## Backlog
- [ ] ConfigLoader: lecture YAML + hot reload (YAML + chokidar)
- [ ] Logger: niveaux error/warn/info/debug/trace + couleurs
- [ ] Router: mapping `control -> (app, action, params)` (résolution et callbacks)
- [ ] LED feedback X‑Touch (Note/CC out) synchronisé avec états appli
- [ ] LCD mapping: intégrer `sendLcdStripText()` dans le Router (labels dynamiques)
- [ ] Drivers applicatifs: Voicemeeter (actions réelles), QLC+, OBS
- [ ] Outil de capture: générer un mapping YAML à partir des logs sniffés
- [ ] Learn page (assistant): enchaîner plusieurs learns pour produire un bloc `controls`
- [ ] Tests de latence et perf (< 20 ms)
- [ ] CI basique (lint, build)

## En cours
- [ ] Router (pages OK) → implémenter le mapping d’actions

## Nouveau
- [x] Transformer MIDI: Pitch Bend → Note On (même canal) avec vélocité mappée (0..127) pour compat QLC+
- [x] Transformer MIDI: Pitch Bend → Control Change (canal cible configurable, CC par canal source)
- [x] Bridge: transformation inverse automatique du feedback (CC/Note → Pitch Bend pour X‑Touch)
 - [x] Refactor: extraction utilitaires MIDI (`src/midi/{utils,filter,transform,ports}.ts`) et LCD (`src/ui/lcd.ts`), simplification `drivers/midiBridge.ts`, mutualisation recherche ports, déduplication LCD, extraction CLI (`src/cli/`).

## Fait
- [x] LCD: libellés configurables par page dans `config.yaml` (`pages[].lcd.labels[0..7]`, string ou {upper,lower}). Application au démarrage et lors du changement de page.
- [x] Sniffer MIDI natif (CLI: midi-ports, midi-open <idx|name>, midi-close, learn)
- [x] X-Touch driver bidirectionnel (echo PitchBend, subscriptions)
- [x] Commandes CLI utilitaires (fader, xtouch-stop/start, lcd)
- [x] LCD MCU: écriture texte par strip (`sendLcdStripText`) + affichage du nom de page
- [x] Passthrough MIDI par page (bridge to/from port) + navigation prev/next (notes 46/47 ch=1)
- [x] Bridge global Voicemeeter (désactivé automatiquement si passthrough par page présent)
- [x] Création du système de gestion de projet (`TASKS.md`, `MEMORY.md`)
- [x] Ajout d’un squelette Node.js + TypeScript
- [x] Initialisation du projet (structure, scripts pnpm, TypeScript) 