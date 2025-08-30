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
- [x] Déduplication helpers: clamp/delay/Levenshtein/bytes MIDI
  - Fait: `src/shared/num.ts` (clamp) et `src/shared/time.ts` (delay) ajoutés.
  - Fait: `xtouch/api-midi.ts` utilise clamp+delay partagés; `animations/*` et `test-utils/*` utilisent delay partagé.
  - Fait: `midi/appClient/core.ts` ré‑exporte clamp depuis shared.
  - Fait: Levenshtein: `help.ts` importe `cli/levenshtein`.
  - Fait: bytes MIDI uniformisés: `xtouch/api-midi.ts`, `xtouch/fkeys.ts`, `router/emit.ts`, `midi/transform.ts`, `midi/testDsl.ts`.
- [~] Remplacer les clamps “manuels” par les builders centralisés
  - Fait: usages critiques migrés (api-midi, fkeys, emit, transform, dsl).
  - À faire: revue ponctuelle des clamps restants (faible priorité).
- [x] Harmoniser la construction des trames Note/CC/PB
  - Résumé: toutes les constructions runtime passent par `rawFrom*` ou `xtapi`.
- [x] Uniformiser le parsing hex (`parseNumberMaybeHex`)
  - Fait: `router/page.ts` pour `base_cc` et `cc`.
  - Fait: `xtouch/matching.ts` (CSV: note/cc/pb channel).
  - Fait: `midi/testDsl.ts` (DSL: toInt via parseNumberMaybeHex, support 0x.., ..h, suffixe n).
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
  - refactor(shared): add clamp/time and apply targeted dedup.
  - refactor(cli): use shared levenshtein in help.ts.
  - refactor(parse): use parseNumberMaybeHex for CSV/DSL numeric parsing.
  - refactor(bytes): use rawFrom* in xtouch/api-midi and test DSL.
  - docs(audit): mark hex parsing harmonization as complete.

Duplications repérées (avec références)

1) clamp (canaux/valeurs)
- Dédup: source unique proposée `src/shared/num.ts` (déjà utilisée par les modules critiques).
- Clamps “manuels” résiduels: faible impact; revue ultérieure possible.

2) delay (promesse temporisée)
- Résolu: `src/shared/time.ts` exporte `delay(ms)` et est utilisé par animations/test-utils/api-midi.

3) Levenshtein
- Résolu: `help.ts` importe `./levenshtein` (suppression dupli interne).

4) Construction des trames MIDI (Note/CC/PB)
- Résolu: toutes les constructions runtime passent par `rawFrom*`/`xtapi` (driver, transform, fkeys, emit, testDsl).

5) Parsing hex/numérique
- Résolu: `router/page.ts`, `xtouch/matching.ts`, `midi/testDsl.ts` utilisent `parseNumberMaybeHex`.

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
- [x] Introduire `src/shared/num.ts` et `src/shared/time.ts` (+ refactor minimal)
- [x] Remplacer les constructions MIDI manuelles par `rawFrom*`/`xtapi`
- [x] Nettoyer `src/cli/help.ts` (import `levenshtein`)
- [ ] Retester build/tests en CI et cocher définitivement

—

Annexes — commandes utiles
- Dead code (une fois Node 24 actif):
  - `pnpm deadcode`
  - `pnpm deadcode:strict`
- Détection de duplication (optionnel):
  - `npx jscpd --pattern \'src/**/*.ts\' --reporters console --min-tokens 30`

Notes
- Ce document sert de base d’itération: cochez, ajoutez des items, ou demandez‑moi d’appliquer un lot ciblé (ex.: “remplacer les clamps et delays”).
