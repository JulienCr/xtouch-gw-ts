# MEMORY

But: noter les erreurs, impasses et choix importants pour ne pas les répéter.

## Garde-fous
- Utiliser exclusivement pnpm/pnpx (pas npm/npx).
- Version Node ciblée: 24.1+ (engines configuré). 
- Tenir `TASKS.md` à jour après chaque lot de travail.

## Entrées
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