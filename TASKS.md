# XTouch GW – Tâches (Kanban)

> Source de vérité de l’avancement. Mettez à jour ce fichier à chaque étape importante.

## Backlog
- [ ] ConfigLoader: lecture YAML + hot reload (YAML + chokidar)
- [ ] Logger: niveaux error/warn/info/debug/trace + couleurs
- [ ] Drivers: Voicemeeter / QLC+ / OBS (APIs respectives)
- [ ] Tests de latence et perf (< 20 ms)
- [ ] CI basique (lint, build)
- [ ] Sniffer: export logs (JSON/CSV) et options de filtrage
- [ ] Outil de capture: générer un mapping YAML à partir des logs sniffés

## En cours
- [ ] Router: pages, mapping `control -> (app, action, params)`

## Fait
- [x] Sniffer MIDI natif (CLI: midi-ports, midi-open <idx|name>, midi-close)
- [x] Création du système de gestion de projet (`TASKS.md`, `MEMORY.md`)
- [x] Ajout d’un squelette Node.js + TypeScript
- [x] Initialisation du projet (structure, scripts pnpm, TypeScript) 