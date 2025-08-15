# Audit de refactorisation (focus Router, App, State)

Date: 2025-08-15
Cible: réduire router.ts à ~100–150 lignes, clarifier les responsabilités, extraire logiques transverses, compléter la JSDoc. Même approche pour app.ts et state.ts.

Résumé des tailles actuelles
- router.ts ≈ 477 lignes (logique de page, anti-echo, latence, forwarding, ordonnancement, ombres, conversion MIDI, etc.)
- app.ts ≈ 235 lignes (bootstrap, hot reload, X-Touch, navigation, bridges globaux/de page, background listeners, persistance, CLI, shutdown)
- state.ts ≈ 180 lignes (types, addrKey, StateStore, sélecteurs, builder d’entries)

Objectif de modularisation (proposée)
1) Router
- Responsabilités cœur à conserver dans router.ts (cible ~120–150 lignes):
  - Construction (constructor) et gestion de la config courante (setActivePage/next/prev/listPages)
  - API publiques: attachXTouch, onMidiFromApp, handleControl (si mapping d’actions), refreshPage (orchestrateur)
  - Glue minimale: déléguer aux services spécialisés (forwarding, planning, anti-echo, latence, émetteur X-Touch)
- Extraire dans des modules dédiés:
  - router/antiEcho.ts: gestion des ombres (xtouchShadow, appShadows), fenêtres anti-echo, LWW, comparaisons de valeurs
  - router/emit.ts: envoi vers X-Touch (entryToRawForXTouch, emitToXTouchIfNotDuplicate, squelch PB, ordonnancement Notes/CC/SysEx/PB)
  - router/planner.ts: construction des "plans" (notePlan, ccPlan, pbPlan) et priorités, basé sur mapping/états connus
  - router/forward.ts: pipeline onMidiFromApp → transformAppToXTouch → anti-echo → LWW → émetteur
  - router/keys.ts: addrKeyForXTouch/addrKeyForApp → remplacés par shared/addrKey (déjà fait partiellement)
  - router/latency.ts: déjà séparé (à garder)
  - router/page.ts: déjà présent (apps de la page, mapping PB→CC, transformAppToXTouch) — compléter si besoin

2) App
- Responsabilités cœur à conserver dans app.ts (cible ~120–150 lignes):
  - Bootstrap (config, log level, création Router)
  - Démarrage X-Touch + attachement Router
  - Navigation de pages, LCD et F-keys (orchestration simple)
  - Wiring drivers (enregistrement), watch config, cleanup
- Extraire dans des modules dédiés:
  - app/bootstrap.ts ou services: initDrivers(registre), initXTouch(options), initVoicemeeterBridgeIfNeeded, buildPageBridges (déjà extrait), setupBackgroundListeners (déjà extrait), setupStatePersistence (déjà extrait), setupCli (déjà extrait), setupSignals/cleanup
  - app/navigation.ts: gestion F1..F8 + prev/next (avec anti-rebond) et callbacks d’UI (LCD, F-keys, refresh)

3) State
- Responsabilités cœur à conserver dans state/index.ts (cible ~100–130 lignes):
  - Types publics (références), StateStore public (API), addrKey réexportée depuis shared
  - Sélecteurs principaux (getKnownLatestForApp, listStatesForApp…)
- Extraire dans des modules dédiés:
  - state/types.ts: types (MidiStatus, MidiAddr, MidiValue, MidiStateEntry, AppKey)
  - state/store.ts: classe StateStore (map interne, subscribe, sélecteurs)
  - state/builders.ts: buildEntryFromRaw (et utilitaires éventuels)
  - state/persistence.ts: déjà séparé (persistance snapshot/journal)

Déplacements et interfaces proposées
- shared/addrKey.ts: OK (withPort réexport, withoutPort dédié)
- midi/utils.ts: OK (getTypeNibble, isPB/isCC/isNoteOn/off, pb14FromRaw/rawFromPb14)
- router/antiEcho.ts
  - API: makeAntiEcho(ctx): { shouldDropEcho(entry|bytes, status, ts), markAppShadow(e), markXTouchShadow(e|bytes), getAntiLoopMs(status) }
- router/emit.ts
  - API: makeEmitter(xtouch, antiEcho): { send(entries: MidiStateEntry[]): void, toBytes(entry): number[]|null }
- router/planner.ts
  - API: planRefresh(page, stateStore): MidiStateEntry[] (renvoie la liste ordonnée à envoyer)
- router/forward.ts
  - API: forwardFromApp(routerCtx, appKey, entry): void (inclut latence.meter, anti-echo, LWW, emit)
- app/navigation.ts
  - API: attachNavigation(x, router, cfg): () => void (unsubscribe)
- state/builders.ts
  - API: buildEntryFromRaw(raw, portId)
- state/store.ts
  - API: StateStore { updateFromFeedback, subscribe, getKnownLatestForApp, listStatesForApp }

JSDoc à compléter (prioritaire)
- Router (public):
  - constructor(initialConfig): comportement et invariants
  - attachXTouch, onMidiFromApp, handleControl, refreshPage, setActivePage/next/prev, markAppShadowForOutgoing, markUserActionFromRaw
- App (public/minimale): startApp (déjà), méthodes utilitaires si exposées
- State: StateStore (updateFromFeedback, subscribe, selectors), buildEntryFromRaw (déjà fait), types exportés (courts commentaires)

Plan d’actions (milestones)
- M1 (router extraction 1):
  - Extraire router/emit.ts (entryToRawForXTouch, emitToXTouchIfNotDuplicate, sendEntriesToXTouch)
  - Extraire router/antiEcho.ts (shadow maps, fenêtrage, midiValueEquals → utilitaire ici)
  - Adapter router.ts pour déléguer; maintenir API publique stable
  - STATUT: FAIT — modules créés et intégrés, build OK
- M2 (router extraction 2):
  - Extraire router/planner.ts (plans note/cc/pb) et simplifier refreshPage()
  - Extraire router/forward.ts (onMidiFromApp pipeline)
  - Finaliser latence via router/latency.ts (déjà ok)
  - STATUT: FAIT — modules créés, `refreshPage()` et `onMidiFromApp()` délèguent; build OK
- M3 (app extraction):
  - Extraire app/navigation.ts (F1..F8, prev/next)
  - Créer app/bootstrap.ts pour drivers/xtouch/bridge/global
  - STATUT: PARTIEL — navigation extraite; bootstrap à faire
- M4 (state split):
  - Déplacer types vers state/types.ts, classe vers state/store.ts, builder vers state/builders.ts
  - Garder state/index.ts qui réexporte l’API publique
  - STATUT: FAIT — split appliqué et réexports en place; build OK
- M5 (JSDoc et docs):
  - Ajouter JSDoc public manquant (Router, App, State)
  - Mettre à jour docs/refactor-audit-*.md et TASKS.md
  - STATUT: EN COURS — JSDoc Router ajoutée

Estimation d’effort
- M1–M2 (Router): 3–4h (avec tests manuels de paging/échos/latence)
- M3 (App): 1.5–2.5h
- M4 (State): 1–1.5h
- M5 (JSDoc/docs): 0.5–1h

a) Risques et atténuations
- Régression anti-echo/LWW: conserver tests manuels et logs DEBUG existants (human/hex)
- Ordonnancement d’envoi: vérifier Notes→CC→SysEx→PB inchangé
- Latence/report: s’assurer que meters et getLatencyReport/resetLatency restent câblés

b) Gains attendus
- router.ts ramené à ~130 lignes (orchestrateur + glue)
- app.ts ~130–150 lignes
- state.ts ~110–130 lignes
- Lisibilité accrue, surfaces testables séparément, JSDoc complète

Check-list de sortie (Done Criteria)
- Router ≤ 150 lignes, sans logique d’implémentation lourde
- App ≤ 150 lignes, bootstrap clair
- State scindé, API claire et documentée
- JSDoc sur toutes méthodes publiques
- TASKS et audit mis à jour

