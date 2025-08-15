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
  - [x] StateStore MIDI-only refactor: `MidiAddr` inclut `portId`; `MidiStateEntry` {known, origin, stale?}; suppression des défauts; stockage feedback only
  - [x] Anti-boucle déplacé côté Router: `XTouchShadow` + fenêtre 50ms; `AppShadow` réservé pour echo app
  - [x] Intégration refresh de page (ordonnancement Notes→CC→LCD→Faders) + Reset→Replay: OFF/0 pour unknown; PB/LCD HOLD
  - [ ] Filtrage par mapping page → MidiAddr (à faire)
  - [x] Navigation next/prev: forcer `refreshPage()` sur les deux (fix next)
  - [x] Page passthrough: les feedbacks des bridges alimentent `StateStore` avec l’app correcte (qlc/voicemeeter/obs)
  - [x] Reset page "Default": Note OFF limité à canal 1, notes 0..31 (au lieu de 0,8,16,24 sur 1..9)
  - [ ] Config Editor Web (Next.js) séparé: CRUD `config.yaml`, UI élégante Tailwind
  - [x] Replay PB en une passe (plan PB par fader) pour éviter PB=0 après PB connu (bug retour Page 1 / Voicemeeter)
  - [ ] BUG: Latence/loop perceptible (≈1 s) sur feedback boutons et « recalage » des faders après mouvement
    - [x] Instrumenter la latence round-trip par app (Voicemeeter, QLC, OBS): timestamp à l’émission (X‑Touch→app) et à la réception (app→X‑Touch), logs `DEBUG` synthétiques (p50/p95/max) — via `Router.latencyMeters` + CLI `latency:report`
    - [x] Élargir/paramétrer la fenêtre anti‑echo côté app et la rendre spécifique par contrôle (NOTE/CC/PB) — `antiLoopWindowMsByStatus` (note/cc/sysex=60ms, pb=200ms)
    - [ ] Implémenter `lastUserActionTs` par contrôle X‑Touch: ignorer le feedback app plus ancien que la dernière action locale (Last‑Write‑Wins par timestamp)
    - [x] Période de grâce faders moteurs: squelch PB entrants légèrement plus long (180ms) au refresh
    - [ ] Vérifier `echoPitchBend`: l’activer seulement si fader sans app mappée; sinon désactiver pour éviter conflit avec feedback tardif
    - [ ] Auditer les listeners background: éviter tout doublon d’écoute sur les mêmes `from_port` (pages actives vs background)
    - [x] Ajouter métriques CLI rapides: `latency:report`, `latency:reset`

## Nouveau
- [ ] Persistence optionnelle du StateStore (`.state/xtouch-gw.json`), flag stale sur reload
- [x] Transformer MIDI: Pitch Bend → Note On (même canal) avec vélocité mappée (0..127) pour compat QLC+
- [x] Transformer MIDI: Pitch Bend → Control Change (canal cible configurable, CC par canal source)
- [x] Bridge: transformation inverse automatique du feedback (CC/Note → Pitch Bend pour X‑Touch)
 - [x] Passthrough pages – fallback d’état: au refresh, utiliser les valeurs du state si présentes pour PB ch 1..9 et Notes 0..31 (ch1), sinon envoyer des valeurs nulles (0), comme sur la page "Default".
 - [x] Refactor: extraction utilitaires MIDI (`src/midi/{utils,filter,transform,ports}.ts`) et LCD (`src/ui/lcd.ts`), simplification `drivers/midiBridge.ts` (ingestion only; pas d'echo direct), mutualisation recherche ports, déduplication LCD, extraction CLI (`src/cli/`).
 - [x] Bugfix: refresh pages 3 & 4 — conserver `transform.pb_to_cc.target_channel` = 1 (QLC attend CH1) et uniformiser `base_cc` (0x45, 0x50) pour permettre la remontée d'état CC → PB et le refresh à l'arrivée sur la page.

## Fait
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