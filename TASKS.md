# XTouch GW – Tâches (Kanban)

> **🚀 MIGRATION VERS TRELLO COMPLÉTÉE** - Le suivi de projet a été migré vers [Trello](https://trello.com/b/2TIFUKPw/xtouch-gw) le 16/08/2025. Ce fichier local reste disponible pour référence mais n'est plus mis à jour activement.
>
> **📊 Tableau Trello :** [https://trello.com/b/2TIFUKPw/xtouch-gw](https://trello.com/b/2TIFUKPw/xtouch-gw)
>
> **🎯 Structure Kanban standard :**
> - **📋 Backlog** - Toutes les tâches futures planifiées
> - **🔄 En cours** - Tâches actuellement travaillées
> - **✅ Fait** - Tâches complétées
>
> **🏷️ Système de priorités et labels :**
> - **Priorités :** Haute | Moyenne | Basse
> - **Labels :** Feature | Performance | Bug | Documentation | Infrastructure
>
> **📝 Chaque tâche Trello contient :**
> - Description détaillée avec contexte et objectifs
> - Priorité claire
> - Labels de catégorisation
> - Exemples concrets et bénéfices

> Source de vérité de l’avancement. Mettez à jour ce fichier à chaque étape importante.

## Backlog
- [ ] Drivers applicatifs: actions réelles (Voicemeeter, QLC+, OBS)
- [ ] Outil de capture: générer un mapping YAML à partir des logs sniffés
- [ ] Learn page (assistant): enchaîner plusieurs learns pour produire un bloc `controls`
- [ ] Tests de perf/jitter (< 20 ms) et micro-bench sur hot paths
- [ ] CI GitHub Actions: pnpm i --frozen-lockfile, lint, check:types, test

## En cours
- [x] Pages: support d'un bloc `pages_global` (defaults fusionnés dans chaque page; override par page)
- [x] Indiquer le nom de la page sur le grand afficheur 7-segments
- [x] Utilise les boutons F1 -> F8 pour naviguer entre les pages (notes channel 1 64..57) et LED active sur la page courante
- [x] Router: pages OK + mapping d’actions implémenté
  - [x] StateStore MIDI-only refactor: `MidiAddr` inclut `portId`; `MidiStateEntry` {known, origin, stale?}; suppression des défauts; stockage feedback only
  - [x] Anti-boucle déplacé côté Router: `XTouchShadow` + fenêtres anti‑echo par type (`antiLoopWindowMsByStatus`)
  - [x] Intégration refresh de page (ordonnancement Notes→CC→LCD→Faders) + Reset→Replay: OFF/0 pour unknown; PB/LCD HOLD
  - [ ] Filtrage par mapping page → MidiAddr (à faire)
  - [x] Navigation next/prev: forcer `refreshPage()` sur les deux (fix next)
  - [x] Page passthrough: les feedbacks des bridges alimentent `StateStore` avec l’app correcte (qlc/voicemeeter/obs)
  - [x] Reset page "Default": Note OFF limité à canal 1, notes 0..31 (au lieu de 0,8,16,24 sur 1..9)
  - [x] Config Editor Web (Next.js) séparé: CRUD `config.yaml`, UI élégante Tailwind
  - [x] Replay PB en une passe (plan PB par fader) pour éviter PB=0 après PB connu (bug retour Page 1 / Voicemeeter)
  - [x] Refactor `app.ts`: déduplication helpers (resolveAppKey, F1..F8 LEDs, construction bridges, accès `passthrough(s)`) – 2025‑08‑15
  - [x] Centralisation anti-echo fallback via `getAntiLoopMs()` (remplace `?? 60` en dur) – 2025‑08‑15
  - [x] `src/midi/transform.ts`: utiliser `pb14FromRaw`/`rawFromPb14`; suppression des reverse transforms (gérées par `router/page.ts`) – 2025‑08‑15
  - [x] Tests P0 (unitaires)
    - [x] src/midi/utils.ts
    - [x] src/midi/transform.ts
    - [x] src/state/store.ts
    - [x] src/router/planner.ts
    - [x] src/router/emit.ts
    - [x] src/router/forward.ts
    - [x] src/config.ts (load/find)

- [ ] Driver OBS (WIP): connexion obs-websocket v5, actions `nudgeX`/`nudgeY`/`scaleUniform`, cache `sceneItemId` et transforms, reconnexion/backoff. Mapping encoders `enc6..enc8` via CC 21–23. Docs: `docs/driver-obs.md`.
  - [x] Input layer générique: attacher `inputMapper` (CSV → controlId → router.handleControl)
  - [x] Navigation: pagination uniquement (suppression du mapping CC 16..23 → enc1..8)
  - [x] AssignButtons: LEDs seulement (retrait du routage des appuis)

- [x] Feature: Boutons Assign → Scènes OBS
  - [x] Ajout `assign_scenes` (racine et page-level) dans `config.yaml`
  - [x] Ingestion `docs/xtouch-matching.csv` (mode `mcu`/`ctrl`) pour récupérer les notes des boutons `assign_*`
  - [x] Wiring: appui bouton → `obs.setScene(sceneName)` ; feedback LEDs via `GetCurrentProgramScene` + event `CurrentProgramSceneChanged`
  - [x] Docs mises à jour: `docs/driver-obs.md`

## Nouveau
- [x] Infra de tests (Lot 0): Vitest + couverture v8, scripts pnpm (`test`, `test:watch`, `test:unit`, `test:integration`, `lint`, `format`), convention de placement des tests sous `_tests` (ex: `src/**/_tests/*.test.ts`) – 2025-08-16
- [x] Stack docs JSDoc/TypeDoc: config `typedoc.json`, scripts pnpm (`docs`, `docs:clean`), sortie Markdown `docs/api` – 2025-08-15
- [x] Docs: suppression des warnings TypeDoc en ajoutant `src/config.ts` aux entry points et en exportant `MessageHandler`; JSDoc enrichie (`config.ts`, `xtouch/driver.ts`) – 2025-08-15
- [x] Persistance légère du StateStore: `.state/journal.log` + `.state/snapshot.json` (append-only + snapshot périodique)
- [x] Reload au démarrage depuis snapshot avec flag `stale` sur les entrées reconstruites
- [x] Transformer MIDI: Pitch Bend → Note On (même canal) avec vélocité mappée (0..127) pour compat QLC+
- [x] Transformer MIDI: Pitch Bend → Control Change (canal cible configurable, CC par canal source)
- [x] Passthrough pages – fallback d’état: au refresh, utiliser les valeurs du state si présentes pour PB ch 1..9 et Notes 0..31 (ch1), sinon envoyer des valeurs nulles (0), comme sur la page "Default".
- [x] Refactor: extraction utilitaires MIDI (`src/midi/{utils,filter,transform,ports}.ts`) et LCD (`src/ui/lcd.ts`), simplification `drivers/midiBridge.ts` (ingestion only; pas d'echo direct), mutualisation recherche ports, déduplication LCD, extraction CLI (`src/cli/`).

- [ ] CLI — Refactor progress (lot par étapes)
  - [x] M1: Extraire `CliContext` vers `src/cli/types.ts`
  - [x] M2: Extraire l’auto-complétion REPL vers `src/cli/completer.ts`
  - [ ] M3: Extraire le dispatcher de commandes vers des handlers modulaires (`src/cli/commands/*`) et connecter depuis `src/cli/index.ts`
  - [ ] M4: Scinder les commandes par catégories (≤150 lignes/fichier)
  - [ ] M5: Tests unitaires purs sur le compléteur (génération de candidats) et le suggesteur (`suggestFromSpec`)
  - [ ] M6: Nettoyage: retirer code mort et dupliqué dans `src/cli/index.ts`
- [x] Bugfix: refresh pages 3 & 4 — conserver `transform.pb_to_cc.target_channel` = 1 (QLC attend CH1) et uniformiser `base_cc` (0x45, 0x50) pour permettre la remontée d'état CC → PB et le refresh à l'arrivée sur la page.
- [x] Suppression: Voicemeeter Sync app‑based (obsolète) — code et références retirés
 - [x] Router cleanup & modularisation: suppression listes exhaustives d’apps dans `router`, latence et ombres par app dynamiques, extraction logique pages/transformations dans `src/router/page.ts`, typage latence générique par clé string, suppression du champ inutilisé `refreshTempoMs`, mise à jour de `attachXTouch()` et appels associés.
 - [x] M1 — Extraction `src/router/emit.ts` et `src/router/antiEcho.ts`, délégation depuis `src/router.ts`, build/tsc OK — 2025‑08‑15
 - [x] Test MIDI — externalisation de la pipeline `test-midi-send` vers utilitaires réutilisables: `src/test-utils/{openRawSender,runners,runMidiTest}.ts`. Le script `src/test-midi-send.ts` est réduit (< 100 lignes) et s’appuie sur `xtouch/api`. — 2025‑08‑16
 - [x] Animation LCD rainbow + contrôle stepDelayMs: `src/animations/lcdRainbow.ts` + runner `runLcdRainbow()`, intégrée à la pipeline (modes `all`/`lcd`). Resets complets au début et à la fin des tests avec effacement LCD/7‑seg (`resetAll({ clearLcds: true })`). Séparation API: `src/xtouch/{api-midi,api-lcd}.ts`. — 2025‑08‑16

## Fait
- [x] CLI: nouvelle commande `sync` + hook `Driver.sync()` + `Router.syncDrivers()`; implémentation OBS (studio mode, scènes) et mise à jour docs CLI — 2025‑08‑20
- [x] Fix: LEDs navigation (Prev/Next) et F1..F8 s'éteignaient immédiatement à l'arrivée sur une page — la logique générique des indicateurs n'écrase plus les LEDs de navigation gérées par `fkeys` (n'émet que pour les contrôles avec indicateur explicite). Tests verts. — 2025‑08‑20
- [x] CLI: refonte aide UX‑first — YAML v2 (meta/context/categories), rendu cheatsheet coloré, `help <cmd|cat|all|examples|json>`, alias `:` avec compat, suggestions, completion; `clear` reste stdout — 2025‑08‑20
 - [x] CLI: REPL — ajout de la complétion Tab via `readline.completer` (commandes, sous-commandes et complétions contextuelles: pages, ports MIDI, fader/lcd) — 2025‑08‑20
- [x] BUG: Latence/loop perceptible (≈1 s) sur feedback boutons et « recalage » des faders — métriques, anti‑echo par type, LWW, setpoints moteurs, échos locaux — 2025‑08‑15
- [x] Page "Lum Latéraux": fader 9 forcé sur CC 78 via `cc_by_channel` – 2025-08-10
- [x] Pages 3 et 4 configurées: P3 "Néons Latéraux RGB" (base_cc 0x45, ch=2, fader 9→CC78), P4 "Néons Contres RGB" (base_cc 0x50, ch=2, fader 9→CC78) – 2025-08-10
- [x] Scaffold app Next.js séparée `web/config-editor` + API GET/PUT `/api/config` + UI YAML/JSON preview – 2025-08-10
- [x] README: documentation fonctionnelle mise à jour (pages/paging, passthroughs, LCD, CLI, sniffer, vm_sync) – 2025-08-10
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
- ~~ [ ] Bridge: reverse transform automatique du feedback (CC/Note → Pitch Bend)~~ — abandonné, remplacé par anti‑echo et setpoint moteurs via `midiBridge` + `Router`
 - [x] Fix: chargement `LOG_LEVEL` via `.env` — import `dotenv/config` avant `logger`, suppression du chemin incorrect `../.env`, logs nettoyés — 2025‑08‑16
 - [x] Fix: arrêt en dev (`pnpm dev`) — commandes CLI `exit|quit` appellent l’arrêt propre (`cleanup()`), Ctrl+C géré via signaux; aligné sur `pnpm start` — 2025‑08‑16
 - [x] Nettoyage: suppression complète du flag de config `features.vm_sync` (schéma TS, UI editor, YAML, tests, README) — 2025‑08‑16
