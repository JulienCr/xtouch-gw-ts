## État d’avancement – Refactor State MIDI-only et Reset→Replay (2025-08-15)

> Spécifications
- Application : docs\specifications.md
- Focus sur le State Management : docs\page-state-system.md

### Contexte
- Source de vérité unique: feedback MIDI des apps (Voicemeeter, QLC+, OBS) côté gateway.
- Objectif: au changement de page, appliquer Reset→Replay fiable sans boucles ni “pumping”, et outiller le debug avec persistance légère.

### Modèle de données (runtime)
- `MidiAddr = { portId, status('note'|'cc'|'pb'|'sysex'), channel?, data1? }` (data1=0 pour PB).
- `MidiStateEntry = { addr, value, ts, origin('app'|'xtouch'), known, stale? }`.
- State RAM par app (`Map<AddrKey, MidiStateEntry>`), où `AddrKey = port|status|ch|d1`.

### Principales évolutions
- StateStore
  - Ajout `portId`, `known`, `origin`, `stale?`.
  - Suppression des valeurs par défaut dans le state (plus de pollution “faux” OFF/0). Retour `null` si inconnu.
  - `subscribe(listener)` pour publier chaque upsert (journal/SSE/futur viewer).
  - `getKnownLatestForApp()` accepte `channel`/`data1` optionnels (lookup flexible, utile pour QLC qui publie tout sur CH1).

- Router
  - Anti-boucle déplacé ici: `XTouchShadow` (valeur+ts, 50 ms). Clé X‑Touch = `status|ch|d1`.
  - `onMidiFromApp()` et `refreshPage()` partagent la même pipeline transform “in”.
  - Transforms “in” implémentées: `note_passthrough`, `pb_passthrough`, `sysex_passthrough`, `cc_to_pb` (via mapping de page `pb_to_cc`).
  - Reset→Replay par page:
    - Faders (PB): PB connu → sinon CC mappé → sinon PB=0 (spéc révisée). Émission ordonnée après Notes/CC/SysEx.
    - Notes inconnues → OFF; CC inconnus → 0; SysEx HOLD.
  - À chaque `refreshPage()`: `xtouchShadow.clear()` pour permettre la ré‑émission sur la nouvelle page.
  - Couverture canaux: si `base_cc` présent → faders 1..9 couverts; sinon `filter.channels` + clés de `cc_by_channel`.

- Drivers / Wiring
  - Callbacks normalisés: `onMidiFromApp(appKey, raw, portId)`.
  - Plus d’echo direct vers X‑Touch depuis les bridges; tout passe par le Router (anti‑boucle centralisé).

- Persistance (debug)
  - `.state/journal.log`: append-only (1 JSON par ligne) des upserts state.
  - `.state/snapshot.json`: snapshot RAM périodique (5s) par app.

### Politique Reset→Replay (rappel)
- Notes → OFF; CC → 0; SysEx → HOLD; PB → 0 si aucun état connu.
- Ordonnancement d’envoi: Notes → CC → SysEx → PB.

### Problème en cours (bug connu)
- Symptôme: au retour sur la page 1 (Voicemeeter+QLC), après un refresh, on observe l’envoi de PB corrects puis un second lot de PB=0 sur certains faders, ce qui les ramène à 0 malgré un état VM connu.
- Cause probable: mélange de deux chemins dans le même cycle (replay PB connu et reset PB=0) non coalescés; le PB=0 s’intercale après le PB connu.
- Impact: faders VM retombent à 0; Notes peuvent paraître éteintes selon la séquence.

### Plan de correction
- Construire un “plan PB” par fader lors du `refreshPage()`:
  - Priorité: PB connu (VM) > CC mappé (QLC) > 0.
  - Émettre tous les PB en une seule passe finale (après Notes/CC/SysEx), sans insérer de PB=0 concurrent dans la même itération.
- Conserver `xtouchShadow.clear()` au début du refresh pour autoriser la ré‑émission.

### Reproduction rapide
1) Démarrer la GW (voir logs) et activer “Voicemeeter+QLC”.
2) Vérifier `.state/snapshot.json` → présence de PB VM et CC QLC.
3) Passer à “Lum Latéraux” → faders suivent CC (OK).
4) Revenir “Voicemeeter+QLC” → constater (dans les logs) PB VM suivis de PB=0 sur faders 1..7 (régression actuelle).

### Mitigation temporaire
- Réduire la fenêtre de squelch moteurs (200 ms) pour limiter l’echo mécanique.
- `xtouchShadow.clear()` au refresh pour éviter blocage par déduplication.

### Prochaines étapes
- Implémenter le “plan PB” en une passe et tests de non-régression multi‑pages.
- Ajouter logs DEBUG optionnels imprimant la table `fader -> CC` calculée par page.
- Exposer un endpoint GET `/api/state/:app/snapshot` (lecture seule) pour le viewer.

### Artefacts utiles
- Journal: `.state/journal.log`
- Snapshot: `.state/snapshot.json`

