# Décision

* **Persistance** : journal append-only + snapshots périodiques (worker dédié), RAM = vérité runtime.
* **Viewer** : app Next.js séparée (ou dossier `apps/state-viewer/`) qui consomme un **API lecture + SSE** exposés par la gateway.

---

# 1) Exposition côté Gateway (API lecture + SSE)

## Endpoints HTTP (lecture seule)

* `GET /api/state/apps` → `["voicemeeter","qlc","obs"]`
* `GET /api/state/:app/summary`
  → `{ app, count, known, stale, lastUpdateTs }`
* `GET /api/state/:app/snapshot`
  → **instantané RAM** : `[{ addrKey, addr, value, ts, origin, known, stale }]`
  (pagination via `?afterTs=` et `?limit=`)
* `GET /api/pages/active` → `{ name }`
* `GET /api/metrics/persist` → `{ queueDepth, lastSnapshotAt, journalBytes }`

> **CORS** autorisé sur `http://localhost:3000` (viewer). Auth simple token (header `x-viewer-token`) si besoin.

## Flux temps-réel (SSE)

* `GET /api/state/:app/stream` (`text/event-stream`, retry auto)

  * **À l’ouverture** : envoi `event: fullSnapshot` (compact, éventuellement après un `If-None-Match` basé sur `snapshotTs`).
  * **Ensuite** : `event: upsert` pour chaque mutation (mêmes champs que journal).
  * **Heartbeats** : `event: ping` toutes 10 s.

**Payloads**

```json
// fullSnapshot
{ "version":1, "app":"qlc", "snapshotTs": 1699999999999, "items":[
  {"addrKey":"um1|cc|1|80","addr":{"portId":"um1","status":"cc","channel":1,"data1":80},"value":64,"ts":169..., "origin":"app","known":true,"stale":false}
]}

// upsert
{ "op":"upsert","app":"qlc","addr":{"portId":"um1","status":"cc","channel":1,"data1":80},"value":65,"ts":169..., "origin":"app","known":true }
```

**Notes**

* La **forme du `upsert` == journal** → zéro mapping supplémentaire côté viewer.
* **Throttling** serveur : coalescing par `addrKey` (fenêtre 5–10 ms) pour éviter de saturer le flux pendant un ride fader.

---

# 2) Viewer Web (Next.js/React)

Plus tard
---

# 3) Intégration côté Gateway (minimale)

## Service “ViewerAPI”

* Monté dans le process principal Express/fastify **ou** petit serveur http dédié (port `:7357`), sans bloquer la boucle MIDI.
* **Threading** : le worker persistance reste inchangé; **ViewerAPI** lit directement la **RAM** (StateStore) et observe la **même file d’événements** que le journal (publication duale : journal & SSE).

## Sécurité

* **Lecture seule** (aucune route de mutation).
* Bind sur `127.0.0.1` par défaut; **token** simple via `x-viewer-token` si exposé au LAN.
* CORS restreint à `http://localhost:3000`.

---

```ts
// shared/types.ts
export type AppName = 'voicemeeter'|'qlc'|'obs';
export type MidiStatus = 'note'|'cc'|'pb'|'sysex';

export interface MidiAddr { portId:string; status:MidiStatus; channel:number; data1:number; } // data1=0 pour PB
export type AddrKey = string; // "port|status|ch|d1"

export interface MidiStateEntry {
  addr: MidiAddr;
  value: number | Uint8Array | string;
  ts: number;
  origin: 'app'|'xtouch';
  known: boolean;
  stale?: boolean;
}

export interface JournalEntry {
  op: 'upsert';
  app: AppName;
  addr: MidiAddr;
  value: number | Uint8Array | string;
  ts: number;
  origin: 'app'|'xtouch';
  known: boolean;
}
```

*(Le viewer consomme `JournalEntry` tel quel via SSE.)*

---

# 5) Observabilité

* **Metrics internes** publiées via `/api/metrics/persist` et `/api/state/:app/summary`.
* **Logs** (niveau `debug`) : connexions SSE, taille snapshot, dropped events (si backpressure).
* **Backpressure** : si le client ne lit pas assez vite, on ferme poliment le SSE et on invite à re-charger (toast côté UI).

---


* Monorepo PNPM (optionnel) :

  ```
  apps/
    state-viewer/      # Next.js
  packages/
    gateway/           # ta GW actuelle
    shared-types/
  ```
* Scripts :

  * `pnpm --filter gateway dev`
  * `pnpm --filter state-viewer dev` (proxy API → `http://127.0.0.1:7357`)
* `.env` gateway (optionnel) :

  ```
  VIEWER_PORT=7357
  VIEWER_BIND=127.0.0.1
  VIEWER_TOKEN=changeme
  CORS_ORIGIN=http://localhost:3000
  ```
* `.env` viewer :

  ```
  NEXT_PUBLIC_VIEWER_API=http://127.0.0.1:7357
  NEXT_PUBLIC_VIEWER_TOKEN=changeme
  ```

---

# 7) Checklist d’implémentation (Cursor)

1. **Gateway**
   * Brancher un **publisher** en sortie de `StateStore.update()` → journal + SSE.
   * Implémenter **/api/state** (summary/snapshot), **/api/metrics**, **/api/pages/active**.
   * SSE `/:app/stream` avec **fullSnapshot** initial + `upsert` coalescés.
   * CORS + token.
2. **Viewer**
3. **Tests**
   * 10k `upsert`/min → UI reste fluide; aucun drop SSE.
   * Coupure/reprise Gateway → viewer se resynchronise.
   * Journal lourd → metrics OK; aucune régression latence MIDI.

