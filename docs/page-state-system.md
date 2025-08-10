Voilà une spec compacte et actionnable pour ton **state virtuel par adresse MIDI** et le **refresh de page** sans aucune API applicative.

# Objectif

* **Source de vérité** = *dernière trame MIDI reçue* (depuis Voicemeeter, QLC+, OBS), pas leurs APIs.
* Au **changement de page**, la gateway **rejoue** vers la X‑Touch l’état connu (faders, LED, rings, LCD…).
* Pas de “full refresh” demandé aux apps.

# Modèle de données (clé = adresse MIDI)

* **MidiAddr**: `(portId, status, channel, data1)`

  * `status` ∈ {NoteOn/Off, CC, PB, SysEx(“LCD”, “LED ring”, …)}
  * `data1` = note/cc/“fonction” (pour PB, fixer `data1=0`)
* **MidiStateEntry**:

  * `addr: MidiAddr`
  * `value: number | string | Uint8Array` (ex. vel/cc/pitch, texte LCD, payload SysEx)
  * `ts: number` (ms, monotonic)
  * `origin: 'app' | 'xtouch'` (anti‑boucle)
* **AppState**: `Map<MidiAddr, MidiStateEntry>` par **app** (voicemeeter / qlc / obs)
* **StateStore** global:

  * `apps: { [app]: AppState }`
  * `pageCache: { [pageName]: Set<MidiAddr> }` (accélère le refresh ciblé)
  * (optionnel) `persistPath?: string` (sauvegarde JSON rapide au shutdown)

# Ingestion en continu (runtime)

1. **Drivers App → Router**

   * À chaque trame MIDI *entrante depuis une app*, créer/mettre à jour `MidiStateEntry` (origin=`app`).
   * Toujours stocker, **même si page inactive**.
2. **Router → X‑Touch (page active)**

   * Si l’adresse est mappée sur la page courante, émettre **feedback immédiat** vers X‑Touch **sauf** si anti‑boucle (voir dessous).
3. **X‑Touch → Apps**

   * Les gestes de l’utilisateur (X‑Touch) **ne modifient pas** le StateStore App (c’est l’app qui renverra son echo MIDI → on restera cohérents).
   * Pour la UX, tu peux *temporairement* afficher sur X‑Touch, mais marque `origin='xtouch'` pour ignorer l’echo si identique.

# Anti‑boucle et coalescing

* **Tag d’origine + fenêtre**: si une trame entrante (depuis app) == dernière valeur envoyée par nous (`origin='xtouch'`) **et** `Δt < 50 ms`, **ignorer**.
* **Deadband faders (PB 14‑bit)**: seuil ±1/16384.
* **Coalescing**: fenêtre 5–10 ms par controlId pour compacter les rafales (faders/rings).

# Refresh de page (le cœur)

Quand `Router.setActivePage(name)`:

1. **Sélection**: pour chaque mapping de la page, traduire en **MidiAddr cible** (ou plusieurs si nécessaire, ex. LCD ligne1/ligne2).
2. **Lookup**: lire `AppState` de l’app liée → récupérer `MidiStateEntry` si présent.
3. **Ordonnancement d’émission** (éviter “warble” visuel) :

   1. **LED / mutes (Notes)**
   2. **LED rings (CC)**
   3. **LCD (SysEx)**
   4. **Faders (Pitch Bend)**

   > Raison : les moteurs font du bruit/lag, on stabilise le “statique” d’abord.
4. **Émission**: envoyer **uniquement si valeur différente** de la dernière valeur connue côté X‑Touch (petit cache local `LastSentToXTouch<MidiAddr, value>`).
5. **Tempo**: espacer à \~**1–2 ms** entre messages (batch total < 20 ms/strip typique), faders à la fin éventuellement en rafale limitée (ex. max 3/s si beaucoup de pages).

# Cas limites & résolutions

* **État inconnu (cold start)**: si un `MidiAddr` n’a **jamais** été vu, **ne rien envoyer** (évite de forcer un faux état).
  Option : persister le store à l’arrêt et recharger au boot (`persistPath`), avec un **flag “stale”** pour marquer que l’info est « non confirmée ».
* **Boutons “toggle” mal définis**: base‑toi **strictement** sur la **dernière Note vel** reçue depuis l’app (127=ON, 0=OFF). Ne déduis rien depuis l’utilisateur.
* **LED rings (modes)**: si une app n’émet que des **positions** (0..127), rejoue la position. Le **mode visuel** (single‑dot/bar) reste celui configuré côté X‑Touch (ou via trame dédiée si tu la connais).
* **LCD**: si tu reçois des trames **partielles**, stocke **le payload brut SysEx** + un **hash**. Au refresh, **rejoue le même payload** (pas de reconstruction), pour rester fidèle à la source.
* **Conflits multi‑apps sur un même contrôle**: ta **page** tranche. Au refresh, ne rejoue que l’`AppState` de l’app désignée par le mapping de la page active.

# Interface minimale (spec côté GW)

* **Router**

  * `setActivePage(name: string): void`
  * `refreshPage(): void` (appelé par setActivePage)
  * `onMidiFromApp(app: 'voicemeeter'|'qlc'|'obs', raw: number[]): void`
* **StateStore**

  * `update(app, entry: MidiStateEntry): void`
  * `get(app, addr: MidiAddr): MidiStateEntry | undefined`
  * `persist()/load()` (optionnel)
* **XTouchDriver**

  * `send(msg: MidiMsg, meta?: {origin:'xtouch'})`
  * Helpers: `sendNote(addr,value)`, `sendCC(addr,value)`, `sendPB(ch,value14)`, `sendSysEx(payload)`
* **Config YAML**

  * `midi.ports` (in/out par app)
  * `pages[].controls[].midiAddr` (si tu veux by‑passer les actions “logiques”)
  * `refresh: { interMsgDelayMs: 1, coalesceMs: 8, faderDeadband: 1 }`
  * `persistence: { path: ".state/xtouch-gw.json", loadOnStart: true }`

# Pipeline d’événements (résumé)

1. **App** émet MIDI → **Driver App** → `StateStore.update(origin=app)`
2. `Router` route vers X‑Touch **si mappé & page active** (anti‑boucle)
3. **Changement de page** → `Router.refreshPage()`

   * lit `StateStore` → ordonne → rejoue **vers X‑Touch**
   * **sans** demander quoi que ce soit aux apps

# Tests ciblés (vite faits, utiles)

* **Golden log**: capture un flux MIDI réel (boot → quelques actions → page switch), rejoue en dry‑run et vérifie que le **refresh n’émet que les messages attendus** dans l’ordre.
* **Anti‑boucle**: injecter un aller‑retour identique < 50 ms → vérifier que le retour app est ignoré.
* **Stress faders**: mouvements rapides + page switch → pas de “pumping” moteur (deadband + coalescing OK).
* **Cold start**: aucun état reçu → refresh **n’envoie rien** (sauf si persistence activée → marque “stale” mais rejoue si configuré).

# Décision

* Pour **v1**, ta stratégie **MIDI‑only** avec **state virtuel** est **la bonne** et robuste.
* **Persistence** optionnelle recommandée (qualité de vie).
* **Aucune dépendance** aux APIs → moins de couplage, plus fiable en live.
