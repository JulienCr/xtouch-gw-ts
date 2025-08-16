# Web State Visualizer – Spécification (UI Next.js existante sous ./web)

Contexte
- L’app web existe déjà sous ./web (Next.js) et contient un configBuilder. On ne doit pas introduire de nouvelle app dans /public ni modifier le sniffer serveur pour ce besoin.
- Objectif: ajouter un visualisateur en temps réel du StateStore (./.state) par application (voicemeeter, qlc, obs, midi-bridge), sous forme d’UI avec:
  - Boutons lumineux pour les Notes (On/Off)
  - Faders pour Pitch Bend (0..16383) et CC (0..127)
  - Mise à jour en temps réel (push) quand le state change

Hypothèses et API cible
- La persistance actuelle (state/persistence.ts) écrit un snapshot JSON dans ./.state/snapshot.json avec la forme:
  {
    ts: number,
    apps: {
      voicemeeter: MidiStateEntry[],
      qlc: MidiStateEntry[],
      obs: MidiStateEntry[],
      'midi-bridge': MidiStateEntry[]
    }
  }
  où MidiStateEntry ~ { addr: { portId, status: 'note'|'cc'|'pb'|'sysex', channel?: number, data1?: number }, value: number|Uint8Array, ts: number, known: boolean, origin: 'app'|'xtouch' }

- Nous allons exposer une API HTTP/WS côté Next.js (route handlers) pour:
  - GET /api/state/snapshot: retourne le snapshot courant (lecture fichier ./.state/snapshot.json)
  - WS /api/state/ws: envoie un event initial state:init avec le snapshot, puis des events state:update à chaque changement (watch du fichier via chokidar côté route handler / server runtime)

Design côté ./web (Next.js)
- Pages/Routes:
  - /state: page du visualiseur
- Composants:
  - StateViewer: contient 4 sections par appKey (voicemeeter, qlc, obs, midi-bridge)
  - StateGrid: grille responsive d’items
  - StateItem:
    - status=note: bouton lumineux (vert si value>0, gris sinon), label "note d1 chX"
    - status=cc: fader horizontal (0..127) en read-only, label "cc d1 chX"
    - status=pb: fader horizontal (0..16383) en read-only, label "pb chX"
- Données:
  - hook useStateFeed():
    - fetch initial via GET /api/state/snapshot
    - ouvre WS sur /api/state/ws
    - met à jour le state local à chaque message (init/update)

Contraintes techniques
- Respect du runtime Next.js (Edge ou Node). Pour watch ./.state, utiliser runtime Node dans le handler WS (app router /pages API selon le projet). On visera le route handler Node (pages/api ou app/api route) avec chokidar côté serveur.
- Aucune dépendance lourde supplémentaire côté web (réutiliser WebSocket natif du navigateur et chokidar côté serveur Next.js).
- Sécurité: L’API est locale (dev). Pas de secret. Lecture simple de fichier.

Étapes d’implémentation
1) Web API dans ./web
   - Créer /api/state/snapshot (GET): lit ./.state/snapshot.json (chemin relatif au repo parent). Si fichier manquant, retourne { ts: Date.now(), apps: { ...: [] } }.
   - Créer /api/state/ws (GET with upgrade): met en place un WebSocket (ou utilise nextjs-websocket pattern). En environnement Node/Next, utiliser ws côté serveur dans le handler. Watcher chokidar sur ./.state/snapshot.json et push { type: 'state:update', payload: snapshot } aux clients connectés. À la connexion, envoyer { type: 'state:init', payload }.
   - Noter: si le projet web utilise app router, on crée app/api/state/snapshot/route.ts (GET) et app/api/state/ws/route.ts (upgrade). Sinon, pages/api/state/*.

2) UI dans ./web
   - Créer la page /state (app/state/page.tsx ou pages/state.tsx suivant structure existante)
   - Ajouter hook useStateFeed() (app/hooks/useStateFeed.ts): fetch initial + WS
   - Créer composants StateViewer/StateGrid/StateItem avec styles simples (utiliser tailwind si déjà présent, sinon styles inline légers)

3) Mapping des données → UI
   - Grouper par status: note, cc, pb
   - Ordre affichage: Notes (0..127, groupées par ch), CC (0..127, groupées par ch), PB (ch 1..9 pertinents pour X‑Touch)
   - Faders disabled/read-only (on ne pilote rien depuis l’UI pour l’instant)

4) Performances
   - Debounce côté serveur le push (facultatif) si fréquence trop élevée; sinon rely sur persistance snapshot (toutes les 5s) + journal change → pour du temps réel plus fin, on peut aussi écouter le journal .state/journal.log (optionnel v2)

5) Tests manuels
   - Lancer la gateway (pas nécessairement le dev build web, selon votre règle), puis manipuler X‑Touch/Apps pour changer l’état; vérifier mise à jour en live sur /state

Roadmap v2 (optionnel)
- Filtrer par app/clés/midi channel
- Afficher un mini-graph temps des derniers changements
- Permettre l’émission (contrôle) depuis l’UI (avec garde anti-echo)

Livrables
- Fichiers dans ./web:
  - API: /api/state/snapshot et /api/state/ws
  - Page: /state
  - Hooks + composants: useStateFeed, StateViewer, StateGrid, StateItem
- Pas de changement dans le backend Node principal en dehors de l’existant (on exploite ./.state)

Notes
- On n’introduit aucune dépendance front additionnelle inutile; on reste sur une stack légère.
- Si Next.js impose des contraintes pour l’upgrade WS, on peut passer par un petit serveur Node auxiliaire lancé via un script web dev, mais priorité à la solution native Next route handlers.

