# MEMORY

But: noter les erreurs, impasses et choix importants pour ne pas les répéter.

## Garde-fous
- Utiliser exclusivement pnpm/pnpx (pas npm/npx).
- Version Node ciblée: 24.1+ (engines configuré). 
- Tenir `TASKS.md` à jour après chaque lot de travail.

## Entrées
 - 2025-08-16 — Infra tests
   - Décision: utiliser Vitest avec couverture v8 et convention `_tests` (tests co-localisés dans des sous-dossiers `_tests` à côté du code, ex: `src/midi/_tests/utils.test.ts`).
   - Scripts: `pnpm test`, `pnpm test:watch`, `pnpm lint`, `pnpm format`.
- 2025-08-08 — Init
  - Décision: TypeScript + tsx (dev) + tsc (build).
  - Décision: `chalk@4` pour compat CJS simple; évite ESM-only de chalk@5 au démarrage.
  - Décision: `config.yaml` racine avec `config.example.yaml` d’illustration.
- 2025-08-08 — Sniffer MIDI
  - Problème: `pnpm add midi` échoue (node-gyp, MSBuild) sous Windows + Node 24.1.
  - Solution: `@julusian/midi` fonctionne immédiatement (précompilé/N-API). Sniffer natif intégré (CLI: midi-ports, midi-open, midi-close).
  - Fallback: sniffer Web MIDI dispo via `pnpm sniff:web` → `http://localhost:8123/`.
- 2025-08-09 — loopMIDI en sécurité (boucle)
  - Symptôme: plus aucune sortie MIDI, ports “gelés”.
  - Cause: boucle de routage (X‑Touch ↔ bridge ↔ retour vers le même flux) détectée par loopMIDI → mise en sécurité.
  - Actions: couper VM Sync si besoin, désactiver un des ponts, vérifier filtres/ports (pas de renvoi du feedback vers l’entrée source), redémarrer loopMIDI. 
 - 2025-08-09 — QLC+ ne gère pas Pitch Bend
   - Décision: ajout d’un transformer `pb_to_note` côté `MidiBridgeDriver` pour convertir Pitch Bend → Note On (même canal) avec vélocité mappée (0..127).
   - Usage: dans `config.yaml`, sous `passthroughs[].transform.pb_to_note.note` définir la note (ex: 0). Évite d’envoyer des PB à QLC+.
  - 2025-08-10 — Conversion PB → CC pour QLC+
    - Décision: ajout de `pb_to_cc` pour convertir Pitch Bend → Control Change (valeur 0..127) avec canal cible configurable et CC calculé par canal source (`base_cc` ou `cc_by_channel`).
    - Exemple: ch4 PB → ch1 CC 49 val[0..127]; ch1→CC46, ch2→CC47.
  - 2025-08-10 — Feedback inverse auto
    - Décision: toute transformation sortante (PB→Note, PB→CC) a son miroir automatique pour le feedback entrant (`Note/CC` → `PitchBend` vers X‑Touch) sans configuration supplémentaire.
 - 2025-08-10 — Refactor utilitaires
   - Décision: extraire le rendu LCD et les fonctions MIDI communes pour réduire la duplication et faciliter les tests.
   - Fichiers: `src/ui/lcd.ts`, `src/midi/utils.ts`, `src/midi/filter.ts`, `src/midi/transform.ts`. Mise à jour de `app.ts` et `drivers/midiBridge.ts` pour utiliser ces utilitaires.
 - 2025-08-10 — Oubli de rebuild → ancien comportement
   - Symptôme: après modification du code, le LCD affiche encore le nom de page (ancien fallback) et ignore la nouvelle logique.
   - Cause: process non redémarré / pas de rebuild → ancienne version en cours.
   - Rappel: après des changements de logique, redémarrer le process (`pnpm dev`) ou lancer un type-check (`pnpm run check:types`) et relancer. Le hot reload YAML ne recharge pas le code.
 - 2025-08-10 — App web séparée pour l’édition de config
   - Décision: isoler un éditeur Next.js dans `web/config-editor` pour éviter toute interaction avec la GW.
   - Implémentation: API GET/PUT `/api/config` qui lit/écrit le `config.yaml` racine; UI YAML avec validation et preview JSON.
 - 2025-08-10 — State virtuel MIDI & multipage
   - Décision: adopter une source de vérité MIDI-only par app (Note/CC/PB/SysEx) via `StateStore` avec anti-boucle (50ms) et `lastSentToXTouch`.
   - Implémentation: capture des feedbacks depuis `VoicemeeterDriver` et `MidiBridgeDriver` vers le `Router.onMidiFromApp()`; mapping automatique de l’app (`qlc`/`voicemeeter`/`obs`) selon les ports bridge. Refresh de page ordonné (Notes→CC→LCD→Faders). Fix: `nextPage()` appelait pas `refreshPage()` → ajouté. Reset par défaut: canal 1, notes 0..31 uniquement (LED).
   - À améliorer: filtrage par mapping de page → `MidiAddr` et persistance `.state/xtouch-gw.json`.
 - 2025-08-10 — Pages 3/4 ne se refreshent pas
   - Symptôme: en naviguant vers P3/P4, pas de mise à jour des faders/LED.
   - Cause: mauvaise hypothèse sur le canal cible; QLC attend les CC sur le canal 1.
   - Fix: conserver `target_channel: 1` et clarifier `base_cc` en hex (P3: 0x45, P4: 0x50). Le feedback CC (CH1) est correctement inversé vers PB pour le refresh de page.
- 2025-08-15 — Refactor State MIDI-only + Reset→Replay (nouvelle spec)
  - Changements majeurs: `MidiAddr` {portId,status,channel,data1}, `MidiStateEntry` {known,origin,stale?}; suppression des defaults dans le state; transforms “in/out” centralisées dans le Router; anti-boucle via `XTouchShadow` (valeur+ts) et `AppShadow`.
  - Persistance légère: `.state/journal.log` (append-only) + `.state/snapshot.json` (RAM périodique) pour debug.
  - Reset→Replay: Notes OFF/CC 0 pour unknown; PB=0 (spéc révisée) si aucun PB/CC mappé connu; SysEx HOLD.
  - Mapping CC→PB: support `base_cc` (1..9) + `cc_by_channel`; lookup CC par canal puis global.
  - Correction appliquée: construction d’un plan PB par fader (priorités PB connu > CC→PB > 0) et émission en une seule passe. Évite les PB=0 après des PB connus au retour sur Page 1 (Voicemeeter+QLC). Les mutes Notes sont rejouées via plan Notes.
  - Observation: latence importante (~1 s) sur le feedback (LED/mutes) et recalage des faders après mouvement. Hypothèses: latence cumulée des bridges, fenêtre anti‑echo trop courte, echoPitchBend en conflit, listeners doublons. Actions listées dans `TASKS.md`.
 - 2025-08-15 — Documentation JSDoc/TypeDoc
   - Décision: générer la doc API avec TypeDoc + plugin Markdown, sortie `docs/api` dans le repo pour lecture hors-ligne.
   - Implémentation: `typedoc.json`, scripts `pnpm run docs`, `pnpm run docs:clean`. Warnings supprimés en ajoutant `src/config.ts` aux entry points et en exportant `MessageHandler`; JSDoc complétée sur `config.ts` et `xtouch/driver.ts`.
 - 2025-08-15 — Refactors anti-echo & transforms
   - Nettoyage: suppression des reverse transforms dans `src/midi/transform.ts`; ces miroirs sont gérés par `router/page.ts` (mapping CC→PB lors du refresh/replay).
   - Robustesse: remplacement des littéraux `?? 60` par `getAntiLoopMs(status)` dans `router` pour cohérence des fenêtres anti-echo.
   - Archivage: déplacement de `config copy.yaml` vers `docs/ARCHIVES/` pour éviter les doubles sources de config.
 - 2025-08-16 — Env non chargé assez tôt
   - Symptôme: `LOG_LEVEL` depuis `.env` ignoré; le logger lisait la valeur par défaut `info`.
   - Cause: `dotenv.config()` appelé après import du `logger`, avec un chemin relatif erroné (`../.env`).
   - Fix: utiliser `import "dotenv/config"` au tout début de `src/index.ts` (avant tout import), laisser le chemin par défaut (racine du process), et retirer le `console.trace(process.env)` bruyant.