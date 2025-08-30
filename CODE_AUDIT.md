# xtouch-gw-v2 — Audit de code (itératif)

Objectif
- Dresser un premier état des lieux: logiques dupliquées, code mort, simplifications possibles.
- Tenir ce document à jour en itérant (checklist + références précises).

Contexte d’exécution pour cet audit
- Node local: v12.22.9. Le projet requiert Node >= 24.1.0. Les scripts `pnpm deadcode`/`knip` ne peuvent pas être exécutés ici.
  - Fait (branche chore/cleanup/knip-deadcode): exécution locale de Knip, suppression des fichiers non référencés, réduction des exports inutilisés et ajustements de config.
- Actions proposées pour une passe “outillée” côté dev: `fnm use 24` ou `nvm use 24` puis `pnpm i && pnpm deadcode` (ou `pnpm deadcode:strict`).

Plan (vivant)
- [x] Lancer Knip et intégrer les résultats ici (branche chore/cleanup/knip-deadcode)
- [~] Déduplication helpers: clamp/delay/Levenshtein/bytes MIDI
  - Fait: `src/shared/num.ts` (clamp) et `src/shared/time.ts` (delay) ajoutés.
  - Fait: `xtouch/api-midi.ts` utilise clamp+delay partagés; `animations/*` et `test-utils/*` utilisent delay partagé.
  - Fait: `midi/appClient/core.ts` ré‑exporte clamp depuis shared.
  - À faire: déporter la version interne de Levenshtein dans `help.ts` vers `cli/levenshtein`.
- [~] Remplacer les clamps “manuels” par les builders centralisés
  - Fait: `midi/transform.ts` s’appuie sur `rawFrom*` et `to7bitFrom14bit` (bornage central).
  - À faire: nettoyer les clamps redondants restants (voir duplications ci‑dessous).
- [~] Harmoniser la construction des trames Note/CC/PB
  - Fait: `xtouch/driver.ts` → `xtapi.sendPitchBend14`.
  - Fait: `midi/transform.ts` → `rawFromNoteOn`/`rawFromControlChange`.
  - Fait: `xtouch/fkeys.ts` → `driver.sendNoteOn` (supprime bytes manuels).
  - Fait: `router/emit.ts` → supprime clamps redondants, s’appuie sur `rawFrom*`.
- [~] Uniformiser le parsing hex (`parseNumberMaybeHex`)
  - Fait: `router/page.ts` utilise `parseNumberMaybeHex` pour `base_cc` et `cc`.
  - À faire: revue d’autres parseurs CC/notes éventuels.
- [x] Vérifier et enlever le code mort (CLI runtime/misc)
      - Supprimés: `src/cli/runtime.ts`, `src/cli/commands/misc.ts`, `src/drivers/voicemeeter.ts`
      - Dépendance retirée: `voicemeeter-connector` (non utilisée)
      - Ajout dev: `@typescript-eslint/utils` (pour eslint.config.mjs)
      - Knip: ignore le binaire `pwsh` et ne considère plus `typedoc.json` comme unresolved
      - Exports rendus internes pour réduire le bruit Knip: `defaultMidiTestOptions` (test-utils), `computeAnchorFromAlignment` (OBS transforms), `updateFunctionKeyLeds` (xtouch/fkeys), `sendNoteOff` (xtouch/api-midi), `sendLcdStripLowerText` (xtouch/api-lcd)
      - Nettoyage convert: suppression de `to7bitFromNormalized` et du re-export `rawFromPb14` (préférer `src/midi/bytes`)

—

Mises à jour (branche: `chore/dedup-midi-helpers`)
- Commits:
  - chore(dedup): centralize clamp use and PB encoding.
  - refactor(transform): use rawFromNoteOn/rawFromControlChange for byte construction.

Duplications repérées (avec références)

1) clamp (canaux/valeurs)
- Définition dupliquée: résolu pour `xtouch/api-midi.ts` (utilise désormais la version partagée de `midi/appClient/core`).
  - Reste: conserver une source unique (proposé: `src/shared/num.ts`) et migrer les imports.
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
- Progrès:
  - Résolu: `xtouch/driver.ts` ne construit plus PB manuellement (utilise `xtapi.sendPitchBend14`).
  - Résolu: `midi/transform.ts` construit via `rawFromNoteOn`/`rawFromControlChange`.
- Reste à faire:
  - Note On LED: `xtouch/fkeys.ts` — remplacer par `rawFromNoteOn` ou `xtapi.sendNoteOn`.
  - `router/emit.ts` — supprimer le double clamp et laisser `rawFrom*` borner.
  - Audit rapide des autres fichiers pour `0x90/0xB0/0xE0`.

5) Parsing hex/numérique
- Logique ad hoc dans `src/router/page.ts` (ex.: base_cc) alors que `parseNumberMaybeHex` existe:
  - src/router/page.ts:66–75
  - Helper dédié: src/midi/utils.ts:39
- Reco: remplacer les `parseInt` spécifiques par `parseNumberMaybeHex()`; uniformiser l’acceptation `0x..`/`..h`/décimal.

6) Helpers LCD/affichage
- `ascii7` n’est présent que dans `src/xtouch/api-lcd.ts`, OK.
- Opportunité: exposer “reverse lookups” dans `xtouch/matching.ts` (ex: `controlId -> note`) pour éviter les scans O(n) lors du fan‑out de LEDs (voir `src/router/page.ts:134–158`). Impact faible mais plus net/DRY.

—

Code mort
- Supprimés suite à validation Knip:
  - `src/cli/runtime.ts`
  - `src/cli/commands/misc.ts`
  - `src/drivers/voicemeeter.ts`

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
- [ ] Remplacer les constructions MIDI manuelles par `rawFrom*`/`xtapi` (reste: `xtouch/fkeys.ts`, `router/emit.ts`)
- [ ] Nettoyer `src/cli/help.ts` (import `levenshtein`)
- [ ] Retester build/tests et cocher les items correspondants

—

Annexes — commandes utiles
- Dead code (une fois Node 24 actif):
  - `pnpm deadcode`
  - `pnpm deadcode:strict`
- Détection de duplication (optionnel):
  - `npx jscpd --pattern \'src/**/*.ts\' --reporters console --min-tokens 30`

Notes
- Ce document sert de base d’itération: cochez, ajoutez des items, ou demandez‑moi d’appliquer un lot ciblé (ex.: “remplacer les clamps et delays”).
