Objectif

Séparer l’infra MIDI (ports/bytes/envoi) de l’orchestration applicative (router, anti‑écho, faders).
Garder sendControlMidi(...) comme point d’entrée unique.
Plan

Extraire des callbacks dans src/midi/appClient/index.ts: onOutgoing(bytes), onFeedback(app, raw, portId), shouldSkipFeedback(app), shouldForwardOutgoing(app).
Nettoyer MidiAppClient: plus d’accès au router/X‑Touch; remplacer markAppOutgoingAndForward, getGlobalXTouch, scheduleFaderSetpoint par les callbacks; ensureFeedbackOpen émet sur onFeedback.
Orchestration dans src/services/controlMidiSender.ts: brancher les callbacks (forward au router, anti‑écho, scheduling fader sur PB), gérer reconcileForPage.
Unifier le Bridge: dans src/drivers/midibridge/index.ts, laisser sendControlMidi(...) gérer le forward; retirer l’appel direct à markAppOutgoingAndForward pour éviter double‑forward.
Compatibilité API inchangée: conserver sendControlMidi(app, spec, value) et le hot‑reload.
Optionnel (suivi): étendre initControlMidiSender(cfg, router?) pour supprimer les global restants proprement.
Validation: vérifier qu’un PB ne schedule le fader qu’une fois et qu’aucun double‑forward n’apparaît.
Détails clés

MidiAppClient: reste responsable des ports, retry/backoff, conversion 14→7, construction des octets; publie des événements uniquement.
ControlMidiSender: devient le seul endroit qui connaît le Router et le XTouchDriver pour anti‑écho/feedback/faders.
Bridge: continue de transformer/filtrer, mais délègue entièrement l’envoi/forward au service.

Avancement

- Hooks introduits: `src/midi/appClient/hooks.ts` (onOutgoing, onFeedback, shouldForwardOutgoing, shouldOpenFeedback, onPitchBendSent).
- `MidiAppClient` rendu infra‑only: suppression de l’accès au Router/X‑Touch/globals; usage des hooks pour forward/feedback/scheduling PB.
- `feedback.ts` branché sur hooks: ouverture IN décidée par `shouldOpenFeedback`, émission via `onFeedback`.
- `ControlMidiSender` orchestre: fournit les hooks (forward vers Router, skip forward si passthrough actif, ouverture IN si pas de passthrough ni bridge, scheduling fader sur PB).
- `MidiBridgeDriver` nettoyé: suppression de l’appel direct à `markAppOutgoingAndForward` (le forward est maintenant géré par les hooks du service).

Injection explicite (plus de globals côté service)

- Nouvelle API: `initControlMidiSender(cfg, { router })` pour fournir le Router au service.
- Setter: `setControlMidiSenderXTouch(x)` appelé après bootstrap X‑Touch.
- Remplacement des appels globaux:
  - App → `reconcileControlMidiSenderForPage(page)` au lieu de `(global as any).__controlMidiSender__...`.
  - Suppression de l’utilisation de `global.__xtouch__`; scheduling PB passe par le setter.

Limites restantes (acceptées pour cette itération)

- `global.__router__` est encore lu dans `MidiBridgeDriver` pour `markUserActionFromRaw`. Hors périmètre de cette refacto (côté service nettoyé).

À faire / suivi

- Optionnel: supprimer l’usage de `global.__router__` dans `MidiBridgeDriver` en injectant explicitement un callback `onUserActionFromRaw`.
- Passer un petit tour de typecheck/tests (bloqué ici par version Node du runner), et valider sur machine locale.

Validation locale (à exécuter sur votre machine)

- Linux/macOS via portable Node 24:
  - Typecheck: `.tools/with-node24.sh node node_modules/typescript/bin/tsc --noEmit`
  - Build: `.tools/with-node24.sh node node_modules/typescript/bin/tsc -p tsconfig.json && .tools/with-node24.sh node -e "<cmd copy-assets>"`
  - Tests: `.tools/with-node24.sh pnpm test` (si pnpm activé par corepack). Alternatif: `.tools/with-node24.sh node node_modules/vitest/vitest.mjs run -c vitest.config.ts`.
- Windows (PowerShell):
  - Typecheck: `.tools/with-node24.ps1 node node_modules/typescript/bin/tsc --noEmit`
  - Build: `.tools/with-node24.ps1 node node_modules/typescript/bin/tsc -p tsconfig.json`
  - Tests: `.tools/with-node24.ps1 pnpm test` (si corepack dispo) ou `.tools/with-node24.ps1 node node_modules/vitest/vitest.mjs run -c vitest.config.ts`.
- Smoke tests rapides:
  - Lancer l’app: `pnpm dev` puis manipuler quelques contrôles mappés en `controls.*.midi` (note/cc/pb) pour vérifier l’envoi.
  - Activer un passthrough sur la page active: vérifier que le forward des OUT est bien géré sans double‑echo et que le service n’ouvre pas d’IN.
  - Naviguer entre pages: vérifier que `reconcileControlMidiSenderForPage` ferme/ré‑ouvre les ports du client quand couvert par un passthrough.

Notes env CI/local

- Les binaires précompilés (rollup, etc.) sont conditionnels à l’OS/arch. Éviter d’exécuter les tests sur un OS différent de celui utilisé pour `pnpm install`.
- Les scripts `.tools/with-node24.*` n’installent pas les dépendances; ils fournissent un Node 24 portable. Utilisez votre gestionnaire (pnpm/npm) pour installer si nécessaire.
