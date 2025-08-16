# xtouch-gw-v2 — Audit des tests (lots et plan d’implémentation)

Objectif
- Dresser l’état des lieux (il n’existe actuellement aucun test) et proposer un plan par lots pour atteindre un niveau de qualité durable.
- Respecte les préférences: pnpm; NodeJS/TypeScript pour la logique; ne pas lancer le build/dev JS.

Philosophie (projet perso, stack légère)
- Garder l’outillage minimal: Vitest (+ couverture), ESLint, tsc --noEmit. Éviter les couches lourdes et la complexité inutile.
- Priorité aux tests unitaires déterministes qui capturent les invariants du domaine (MIDI utils, transforms, Router planner/forward, StateStore).
- Simuler le matériel et les IO au maximum (fakes/stubs), repousser HIL en optionnel (P3) uniquement quand c’est utile.
- Utiliser des golden tests simples pour figer les trames/protocoles et limiter les régressions.
- Considérer les tests comme documentation exécutable pour guider l’IA lors des évolutions (les noms de tests décrivent l’intention et les contraintes).

Résumé des priorités (At-a-glance)
- P0 — Lot 0: Infrastructures de test (Vitest + c8), lint/format/type-check, CI basique pnpm, conventions.
- P0 — Lot 1: Unit tests coeur domaine/protocoles (MIDI utils, Router planner/forward, StateStore, transform, config loader).
- P1 — Lot 2: Tests d’intégration (drivers/adapters: X‑Touch driver simulé, MidiBridge, Voicemeeter bridge via double/spy; persistance State).
- P1 — Lot 3: Tests de contrat (si API web: non applicable côté core; sinon contrats internes pour frames MIDI/X‑Touch).
- P2 — Lot 4: E2E critiques (flux X‑Touch → Router → Bridges → feedback → X‑Touch, avec simulateur; sans hardware requis).
- P2 — Lot 5: Perf/latence (cibles < 20 ms; micro-bench sur hot paths router/planner/emit; mesure jitter anti‑echo).
- P2 — Lot 6: Sécurité/robustesse (entrées invalides, dépendances, semgrep; fuzz/property sur parsers MIDI).
- P3 — Lot 7: Hardware-in-the-Loop (HIL) optionnel (tests avec X‑Touch réel/UM-One/Voicemeeter).
- P3 — Lot 8: Résilience/chaos (déconnexions ports, pertes messages, redémarrages simulés).

Carte du dépôt (Repository Map)
- Langages et toolchain
  - TypeScript: Oui (tsconfig.json, target ES2022, CommonJS, outDir dist)
  - Go: Non détecté
- Gestionnaire de paquets: pnpm (pnpm-lock.yaml; packageManager pnpm@9.x)
- Scripts package.json (pertinents): dev (tsx), build (tsc), start (node dist), check:types, docs
- Structure TS (extraits principaux)
  - src/app.ts: bootstrap, hot reload config, attache les drivers, navigation pages, persistance, CLI
  - src/router.ts: orchestration Router (pages, anti‑echo, latence, émission X‑Touch via makeXTouchEmitter, planRefresh, forwardFromApp)
  - src/router/*: emit, planner, forward, latency, page (mapping pages/apps, transformAppToXTouch)
  - src/state/*: store (StateStore), persistence (journal + snapshot), types/builders (via index dans state)
  - src/midi/*: utils (human/hex/pb utils), filter, transform, ports
  - src/drivers/*: midiBridge (bridge générique), voicemeeter (non affiché ici mais référencé), xtouch (driver)
  - src/ui/lcd.ts, src/xtouch/fkeys.ts
  - src/config.ts (+ config/passthrough.ts), watchConfig, loadConfig
  - docs/*: specs et audits refactor
- Dépendances externes/IO
  - MIDI via @julusian/midi (ports IN/OUT), matériel X‑Touch (DIN via UM-One) — à simuler en test
  - Voicemeeter via voicemeeter-connector (driver)
  - FS: persistance .state (journal.log, snapshot.json)
- CI/CD: non détecté (.github non listé)

État actuel des tests (2025-08-16)
- Vitest configuré avec couverture v8, convention `_tests` active
- Suites présentes: 28 fichiers, 57 tests passés (100%)
  - midi: utils (incl. fast-check), transform, filter, decoder, ports, sniffer
  - state: store, builders, persistence
  - router: antiEcho, emit, forward, page, planner, latency, shadows, router (orchestration)
  - shared: addrKey, appKey
  - config: load/findConfig, watchConfig
  - drivers: midiBridge, voicemeeter (fakes)
- Couverture globale: ~59.7% lignes
  - router.ts ≈ 74.9%, router/* ≈ 95.5%
  - drivers/midiBridge ≈ 71.2%, drivers/voicemeeter ≈ 75.4%
  - state/persistence ≈ 100%
  - midi/sniffer ≈ 100%, midi/ports ≈ 100%, midi/decoder ≈ 76.1%
  - logger ≈ 96.1%

Barre de qualité cible
- Couverture
  - Unitaire global: ≥ 85% lignes, ≥ 80% branches
  - Modules critiques (MIDI utils, planner, forward, transform, StateStore): ≥ 95% branches
- Déterminisme
  - Timers factices, seeds stables, isolation FS (tmp), pas de dépendance hardware par défaut
- Feedback rapide
  - Lint + typecheck + unit en PR; intégration/E2E derrière label/nightly

Outillage proposé (TypeScript, via pnpm)
- Runner: Vitest (TS-first), couverture c8 intégrée
- Mocks: Vitest (vi.fn, vi.spyOn), nock/msw pour HTTP si besoin (pas critique ici)
- Property-based: fast-check pour fonctions pures (parsers MIDI, addrKey, transforms)
- Intégration: simulateurs/faux drivers; éventuellement Testcontainers si un jour DB/broker
- Qualité: ESLint (typescript-eslint), Prettier, tsc --noEmit
- Hooks: Husky + lint-staged (optionnel)

Conventions
- Nommage fichiers: *.test.ts; co-localisés dans des sous-dossiers `_tests` à côté du code source
  - Exemple: `src/midi/_tests/utils.test.ts`, `src/router/_tests/planner.test.ts`
- Dossiers: tests d’intégration sous `test/integration` (optionnel) ou `__tests__/integration`
- Tags Vitest pour marquer lentes @integration/@e2e (skippées par défaut)

Lots (batches), portée, tâches et critères de sortie

Lot 0 (P0): Infrastructure de test — STATUS: DONE (2025-08-16)
- Portée
  - Ajouter Vitest + config minimale; scripts pnpm test/test:watch/test:unit/test:integration
  - Activer couverture c8; ESLint + Prettier; typecheck (tsc --noEmit)
  - Workflow CI GH Actions (si repo GitHub) pour pnpm i --frozen-lockfile, lint, typecheck, test unitaire
- Tâches
  - Ajouter devDeps: vitest, @vitest/coverage-v8, @types/node, eslint, @typescript-eslint/*, prettier, fast-check (optionnel dès Lot1)
  - Créer vitest.config.ts (resolve tsconfig paths si besoin)
  - Ajouter scripts package.json: "test", "test:watch", "test:unit", "test:integration", "lint", "typecheck", "format"
  - Config ESLint/Prettier (si non présents) et règles de base TS strict
  - CI: workflow .github/workflows/test.yml (pnpm, pas de build/dev)
- Exit
  - pnpm test OK en local; rapport coverage généré (dossier ignoré par git)

Lot 1 (P0): Unit tests cœur
- Modules et cas concrets
  - src/midi/utils.ts ✅ (tests + propriété fast-check)
    - pb14FromRaw/rawFromPb14: inverses, bornes (0, 16383), monotonicité (fast-check), robustesse entrées invalides
    - getTypeNibble/isPB/isCC/isNoteOn: détection statuts; tables de vérité
    - human/hex: rendu stable; longueurs attendues
  - src/midi/transform.ts (applyTransform) ✅
    - pb_to_note: status PB → NoteOn attendu (canal, note, vélocité mappée), non-PB inchangé
    - pb_to_cc: mapping base_cc, cc_by_channel, canal cible, bornes 0..127
    - Idempotence: données non concernées renvoyées inchangées
  - src/state/store.ts (StateStore) ✅
    - updateFromFeedback: known=true, origin=app, écrase par clé addr, publication aux subscribers
    - getKnownLatestForApp: filtres par status/channel/data1, sélection la plus récente
    - listStatesForApp/Apps: contenus attendus
  - src/router/planner.ts (planRefresh) ✅
    - Priorités: PB connu (3) > CC mappé (2) > ZERO (1); Notes/CC: connu (2) > reset (1)
    - Canaux par app depuis page; zeros générés si absence d’état
    - Transformations transformAppToXTouch appliquées
  - src/router/forward.ts (forwardFromApp) ✅
    - LWW/anti‑echo: messages proches d’actions locales ignorés selon fenêtre; appel emitter conditionnel
    - Latency meters: mise à jour lors de round-trip
  - src/router/emit.ts (makeXTouchEmitter) ✅
    - emitIfNotDuplicate: déduplication par clé, respect fenêtres anti‑echo; ordonnancement Notes→CC→PB
  - src/config.ts (+ watchConfig si isolable) ✅ (load/find)
    - loadConfig: parsing YAML valide/invalide; défauts; messages d’erreur clairs
- Exit
  - Couverture ≥ 95% sur modules listés; tests déterministes

Lot 2 (P1): Intégration
- Cibles
  - src/drivers/midiBridge.ts ✅
  - src/drivers/voicemeeter.ts ✅
  - src/state/persistence.ts ✅
  - src/app/bootstrap.ts (si présent) / startApp wiring
- Exit
  - Scénarios heureux + erreurs; pas de fuite de ressources (timers nettoyés)

Lot 3 (P1): Contrats internes (protocoles)
- Golden files
  - Frames MIDI typiques X‑Touch (Note/CC/PB) et transformations attendues vers apps
  - Validation stricte des limites (notes 0..31, CC 0..31, canaux mappés)
- Exit
  - Golden tests stables, round-trip garanti là où applicable

Lot 4 (P2): E2E critiques (sans hardware)
- Harness
  - Simulateur X‑Touch (driver fake) + simulateurs de bridges app
  - Cas: navigation de pages, refresh initial, replay état connu, anti‑echo sur actions locales
- Exit
  - 3–5 scénarios exécutables sous 2–3 min, zéro flake en 10 runs

Lot 5 (P2): Performance/latence
- Micro-bench (tinybench) sur planner/emit/transform; tests de jitter anti‑echo (fenêtres status‑spécifiques)
- Exit
  - Budget < 20 ms respecté dans profils représentatifs; régressions détectées

Lot 6 (P2): Sécurité/robustesse
- pnpm audit en CI; semgrep règles Node/TS de base
- Fuzz/property sur parsers MIDI (fast-check générateurs de trames aléatoires bornées)
- Exit
  - Aucun vuln crit/high ouvert; parsers robustes

Lot 7 (P3): HIL optionnel
- Lorsque matériel dispo: tests avec vrai X‑Touch + UM‑One + Voicemeeter; tolérances temporisation; déconnexions/reconnexions

Lot 8 (P3): Résilience/chaos
- Toxiproxy/erreurs simulées sur ports/WS; redémarrages; idempotence/déduplication

Table d’inventaire modules → cas de tests (à compléter au fil de l’implémentation)
| Module | Type | Risque | Tests existants | Tests proposés | Priorité |
|--------|------|--------|-----------------|----------------|----------|
| src/midi/utils.ts | utils/protocole | élevé | 0 | bornes, propriétés, tables de vérité | P0 |
| src/midi/transform.ts | transform | élevé | 0 | pb→note, pb→cc, idempotence | P0 |
| src/state/store.ts | state | élevé | 0 | upsert, latest selectors, subscribe | P0 |
| src/router/planner.ts | plan/refresh | élevé | 0 | priorités, zeros, mapping | P0 |
| src/router/forward.ts | forwarding | élevé | 0 | anti‑echo, LWW, latence | P0 |
| src/router/emit.ts | émission | moyen | 0 | dédup/ordonnancement | P0 |
| src/config.ts | config | moyen | 0 | parsing, défauts/erreurs | P0 |
| src/state/persistence.ts | IO/FS | moyen | 0 | journal/snapshot tmp | P1 |
| src/drivers/midiBridge.ts | adapter | élevé | 0 | filter/transform/setpoint/feedback | P1 |
| src/app.ts (+bootstrap) | orchestrateur | moyen | 0 | wiring via stubs/spies | P1 |

Scripts pnpm (à ajouter dans package.json, Lot 0)
- "test": "vitest run --coverage"
- "test:watch": "vitest"
- "test:unit": "vitest run -c vitest.config.ts"
- "test:integration": "vitest run --dir test/integration"
- "lint": "eslint ."
- "typecheck": "tsc --NoEmit"
- "format": "prettier --check ."

Notes d’implémentation
- Éviter tout accès matériel réel par défaut. Introduire des fakes/stubs:
  - XTouchDriver fake: expose subscribe(), setFader14(), setLed()/LCD no-op, trace des messages
  - MIDI ports fake: Input/Output doubles (collectent messages au lieu d’ouvrir des ports)
- Isolation FS: utiliser des dossiers temporaires pour tests de persistance (Node fs.mkdtemp)
- Timers: vi.useFakeTimers() pour setTimeout dans MidiBridge (setpoint PB) et persistance snapshot
- Journalisation: baisser niveau logs en test; injecter logger mock si nécessaire

Risques et atténuations
- Dépendance matérielle → simuler; basculer HIL en P3 seulement
- Flaky liés aux timers → timers factices et marges > fenêtres anti‑echo
- Couverture difficile sur chemins erreurs IO → fakes et erreurs injectées

Prochaines étapes
- Valider ce plan (lots et priorités)
- Exécuter Lot 0, puis Lot 1
- Créer issues par module (P0 d’abord), ajouter checklists et critères de sortie

## Journal d’avancement (MàJ continue)

2025-08-16 — Progression Lot 2 + Orchestration Router
- Suites: 28 fichiers, 57 tests verts. Couverture globale ~59.7%.
- Nouveaux: midi/ports, midi/sniffer, router (orchestration), router-more (handleControl/updateConfig), drivers (voicemeeter), state/persistence (timers asynchrones).
- Router central rehaussé à ~74.9% lignes; objectif: ≥ 85% via cas supplémentaires (replay forward dans onMidiFromApp, branches warnings).

2025-08-16 — Refactor test MIDI
- Extraction de la pipeline `src/test-midi-send.ts` vers `src/test-utils/{openRawSender,runners,runMidiTest}.ts`. Le script devient un fin wrapper et facilite la réutilisation côté E2E/HIL.

