# xtouch-gw-v2 — Audit de code (itératif)

Objectif
- Dresser un premier état des lieux: logiques dupliquées, code mort, simplifications possibles.
- Tenir ce document à jour en itérant (checklist + références précises).

Contexte d’exécution pour cet audit
- Node local: v12.22.9. Le projet requiert Node >= 24.1.0. Les scripts `pnpm deadcode`/`knip` ne peuvent pas être exécutés ici.
- Actions proposées pour une passe “outillée” côté dev: `fnm use 24` ou `nvm use 24` puis `pnpm i && pnpm deadcode` (ou `pnpm deadcode:strict`).

Plan (vivant)
- [ ] Lancer Knip et intégrer les résultats ici (dès Node 24 dispo)
- [ ] Déduplication helpers: clamp/delay/Levenshtein/bytes MIDI
- [ ] Remplacer les clamps “manuels” par les builders centralisés
- [ ] Harmoniser la construction des trames Note/CC/PB
- [ ] Uniformiser le parsing hex (`parseNumberMaybeHex`)
- [ ] Vérifier et enlever le code mort (CLI runtime/misc)

—

Duplications repérées (avec références)

1) clamp (canaux/valeurs)
- Définition dupliquée:
  - src/midi/appClient/core.ts:13
  - src/xtouch/api-midi.ts:71
- Clamps “manuels” récurrents (exemples):
  - src/xtouch/driver.ts:231, 232
  - src/xtouch/fkeys.ts:9, 14, 27, 29
  - src/router/emit.ts:40, 46, 52
  - src/router/forward.ts:45
  - src/midi/bytes.ts:10, 18, 26 (déjà centralisés pour Note/CC)
- Reco:
  - Introduire `src/shared/num.ts` avec `clamp(n,min,max)` et l’utiliser partout où un clamp “manuel” est écrit.
  - Côté émission MIDI, préférer les helpers centralisés de `src/midi/bytes.ts` (qui bornent déjà) pour éviter le double clamp.

2) delay (promesse temporisée)
- Implémentée à plusieurs endroits identiques:
  - src/animations/lcdRainbow.ts:52
  - src/animations/wave.ts:39
  - src/test-utils/openRawSender.ts:19
  - src/test-utils/runners.ts:20
  - src/xtouch/api-midi.ts:70
- Reco: créer `src/shared/time.ts` exportant `delay(ms)` et l’utiliser partout.

3) Levenshtein
- Implémentation dans deux fichiers:
  - src/cli/levenshtein.ts:8
  - src/cli/help.ts:300 (fonction interne)
- Reco: supprimer la version interne de `help.ts` et importer `./levenshtein`.

4) Construction des trames MIDI (Note/CC/PB)
- Constructions “à la main” alors que `src/midi/bytes.ts` existe:
  - Pitch Bend: src/xtouch/driver.ts:229–237 construit `[status, lsb, msb]` au lieu d’utiliser `rawFromPb14`.
  - Note On LED: src/xtouch/fkeys.ts:13–15 construit le Note On au lieu d’utiliser `rawFromNoteOn` ou `xtapi.sendNoteOn`.
- Double clamp avant helpers:
  - src/router/emit.ts:40–54 clampe puis appelle `rawFromNoteOn`/`rawFromControlChange`/`rawFromPb14` qui clampent déjà.
- Reco:
  - Centraliser via `src/midi/bytes.ts` ou via l’API `xtouch/api-midi.ts` et supprimer les constructions ad hoc.
  - Dans `emit.ts`, faire confiance aux helpers pour le bornage et supprimer les clamps redondants.

5) Parsing hex/numérique
- Logique ad hoc dans `src/router/page.ts` (ex.: base_cc) alors que `parseNumberMaybeHex` existe:
  - src/router/page.ts:66–75
  - Helper dédié: src/midi/utils.ts:39
- Reco: remplacer les `parseInt` spécifiques par `parseNumberMaybeHex()`; uniformiser l’acceptation `0x..`/`..h`/décimal.

6) Helpers LCD/affichage
- `ascii7` n’est présent que dans `src/xtouch/api-lcd.ts`, OK.
- Opportunité: exposer “reverse lookups” dans `xtouch/matching.ts` (ex: `controlId -> note`) pour éviter les scans O(n) lors du fan‑out de LEDs (voir `src/router/page.ts:134–158`). Impact faible mais plus net/DRY.

—

Code mort (candidats)
- src/cli/runtime.ts
  - Non référencé (recherche globale). Contient `createMidiSniffer`, `toHex`, `clearConsole` — jamais importés.
- src/cli/commands/misc.ts
  - Non référencé. Duplique `completion`/`help`/`version` déjà implémentés dans `src/cli/commands.ts`.
- Action: valider avec Knip puis supprimer; ou réintégrer explicitement si conservés.

—

Simplifications proposées
- Unifier l’émission MIDI côté X‑Touch
  - Remplacer les constructions manuelles dans `driver.ts`/`fkeys.ts` par `rawFrom*` + `sendRawMessage` (ou par l’API `xtapi`).
  - Éviter le double clamp dans `router/emit.ts` (placer la confiance dans les builders centralisés).
- Mutualiser utilitaires génériques
  - `src/shared/num.ts`: `clamp`
  - `src/shared/time.ts`: `delay`
  - Importer `levenshtein` depuis `src/cli/levenshtein.ts` dans `help.ts`.
- Parsing hex cohérent
  - Utiliser `parseNumberMaybeHex` partout où des CC/notes/channels peuvent être saisis en hexa (config + CSV).
- Micro-opportunités
  - `xtouch/matching.ts`: ajouter `controlId→note/cc` pour éviter des scans dans le fan‑out LED.

—

Étapes concrètes (proposition)
- [ ] Passer la CI/dev sur Node 24+ (scripts pnpm opérationnels)
- [ ] Lancer `pnpm deadcode` (Knip) et coller le rapport ici
- [ ] Introduire `src/shared/num.ts` et `src/shared/time.ts` (+ refactor minimal)
- [ ] Remplacer les constructions MIDI manuelles par `rawFrom*`/`xtapi`
- [ ] Nettoyer `src/cli/help.ts` (import `levenshtein`)
- [ ] Supprimer `src/cli/runtime.ts` et `src/cli/commands/misc.ts` si validé par Knip

—

Annexes — commandes utiles
- Dead code (une fois Node 24 actif):
  - `pnpm deadcode`
  - `pnpm deadcode:strict`
- Détection de duplication (optionnel):
  - `npx jscpd --pattern \'src/**/*.ts\' --reporters console --min-tokens 30`

Notes
- Ce document sert de base d’itération: cochez, ajoutez des items, ou demandez‑moi d’appliquer un lot ciblé (ex.: “remplacer les clamps et delays”).

