# XTouch GW — Synchronisation “Snapshot → Feedback” (boot, changement de page, hot‑reload)

Objectif : **aligner la surface X‑Touch** (faders motorisés, LEDs, LCD) sur l’état **réel** de Voicemeeter, QLC+ et OBS **au boot**, **au changement de page** et **après hot‑reload** de la config — puis **maintenir la synchro** en temps réel sans boucles.

---

## 1) Principes

* **Pas d’API “Refresh Controller”** côté apps : c’est à **la gateway** de relire l’état **utile** et de **pousser** le feedback MIDI vers la X‑Touch.
* **Pages** : chaque page mappe des contrôles X‑Touch → des actions sur **une ou plusieurs apps**.
* **Snapshot ciblé** : au moment pertinent (boot/page change/hot reload), on **ne lit que** ce qui est mappé sur la page active.
* **Anti‑boucle** : tout envoi vers une app est **tagué** (`origin`, `timestamp`), et tout évènement entrant récent **identique** est **ignoré** (±50 ms).
* **Deadband** faders : éviter le “warble” moteur (ex. ±1/16384 sur 14‑bit).

---

## 2) Cycle de vie & séquences

### 2.1 Boot

1. **Init Config** (YAML) → pages + mappings validés (Zod).
2. **Connect Drivers** (Voicemeeter/QLC+/OBS + X‑Touch).
3. **Page par défaut** → `Router.setActivePage(defaultPage)`.
4. **sendInitialFeedback()** (par app présente) → **pousser feedback** MIDI.
5. **Écoute temps réel** (attach listeners/poll) → updates → feedback.

### 2.2 Changement de page

1. **Swap atomique** de la table de mapping sur la page choisie.
2. **Snapshot ciblé** (par app) selon mappings **de la page**.
3. **Pousser feedback** (faders/LED/LCD).
4. Reprise écoute temps réel (déjà active) → updates → feedback.

### 2.3 Hot‑reload config

1. **Re-parse YAML** + validation → swap atomique.
2. **Relancer sendInitialFeedback()** sur **la page active**.

---

## 3) Modèle de données (extraits)

```ts
// types.ts
export interface ControlMapping {
  controlId: string;                  // "fader1", "btn3", "enc2", "transport.play", ...
  app: 'voicemeeter' | 'qlc' | 'obs';
  action: string;                     // ex: "setStripGain", "setChannelValue", "setScene"
  params?: unknown[];                 // ex: [stripIndex] | [dmxChannel] | ["Mic/Aux"]
}

export interface Page {
  name: string;
  controls: ControlMapping[];
}

export interface Driver {
  init(): Promise<void>;
  sendInitialFeedback(mappings: ControlMapping[],
                      sendFB: (controlId: string, value: number | string) => void): Promise<void>;
  handleControl(controlId: string, value: number | string): void;
  dispose?(): Promise<void>;
}
```

**Convention valeurs internes** (reco) :

* **booléen** → `0 | 1`
* **continu** (gain) → **valeur native** de l’app (tu convertis au besoin côté X‑TouchDriver)
* **DMX** → `0..255`
* **14‑bit MIDI** → conversion **dans** `XTouchDriver` (ne fige **aucun** numéro CC/Note a priori → *sniff d’abord*).

---

## 4) Router : orchestration page & feedback

```ts
// router.ts
import { Page, ControlMapping, Driver } from './types';
import { XTouchDriver } from './drivers/xtouch-driver';

export class Router {
  private pages: Page[] = [];
  private active?: Page;

  constructor(
    private drivers: Record<'voicemeeter'|'qlc'|'obs', Driver>,
    private xtouch: XTouchDriver,
    pages: Page[]
  ) { this.pages = pages; }

  async setActivePage(name: string) {
    const page = this.pages.find(p => p.name === name);
    if (!page) throw new Error(`Unknown page: ${name}`);
    this.active = page;

    const byApp = groupByApp(page.controls);
    const sendFB = (controlId: string, value: number | string) => {
      this.xtouch.sendFeedback(controlId, value, { origin: 'router', ts: Date.now() });
    };

    // Snapshot ciblé par app
    await Promise.all(
      Object.entries(byApp).map(([app, mappings]) =>
        this.drivers[app as keyof typeof this.drivers].sendInitialFeedback(mappings, sendFB)
      )
    );
  }

  handleXTouchEvent(controlId: string, value: number) {
    if (!this.active) return;
    const m = this.active.controls.find(c => c.controlId === controlId);
    if (!m) return;
    this.drivers[m.app].handleControl(controlId, value);
  }
}

function groupByApp(m: ControlMapping[]) {
  return m.reduce((acc, x) => { (acc[x.app] ||= []).push(x); return acc; },
    {} as Record<'voicemeeter'|'qlc'|'obs', ControlMapping[]>);
}
```

---

## 5) XTouchDriver : feedback & anti‑boucle

```ts
// drivers/xtouch-driver.ts (extraits)
type FeedbackMeta = { origin: 'router' | 'driver'; ts: number };

export class XTouchDriver {
  private lastOut: Map<string, {v: number | string; ts: number}> = new Map();

  // Envoi de feedback normalisé → conversion MIDI ici (Pitch Bend, Note, CC, SysEx)
  sendFeedback(controlId: string, value: number | string, meta: FeedbackMeta) {
    if (this.isRedundant(controlId, value, meta)) return;

    // TODO convert: controlId -> MIDI msg(s)
    // - Motor faders: 14-bit → Pitch Bend
    // - Buttons/LED: Note On/Off or CC
    // - Rings/LCD: SysEx (doc propre issue du sniff)
    // - Apply deadband for faders (ex. ±1/16384)

    this.lastOut.set(controlId, { v: value, ts: meta.ts });
  }

  private isRedundant(id: string, v: number | string, { ts }: FeedbackMeta) {
    const prev = this.lastOut.get(id);
    if (!prev) return false;
    if (typeof v === 'number' && typeof prev.v === 'number') {
      const same = Math.abs(v - prev.v) <= 1; // deadband minimal (affine si 14‑bit)
      const recent = (ts - prev.ts) <= 50;
      return same && recent;
    }
    return v === prev.v && (ts - prev.ts) <= 50;
  }

  // Sniff mode pour documenter CANAL/TYPE/CC/NOTE/SysEx et éviter d’inventer
  startSniff() {/* ... */}
}
```

> **Règle d’or** : ne **jamais** fixer les numéros CC/Note/SysEx sans **sniffer** la X‑Touch en mode utilisé (MC DIN dans v1). Documenter les trames validées avant d’industrialiser.

---

## 6) Drivers d’apps : lecture snapshot & écoute

### 6.1 VoicemeeterDriver (via `voicemeeter-connector`)

* **Init** : login/connect + **prime** du cache (dirty flag).
* **Snapshot** : lire **uniquement** les paramètres utiles aux mappings de la page (ex. strip gain, mute, A1..A5, bus gain/mute).
* **Temps réel** : écouter le “dirty”/event → relire précisément ce qui a changé → `sendFeedback`.

```ts
// drivers/voicemeeter.ts (extraits – sans figer les noms exacts si tu veux)
import { Driver, ControlMapping } from '../types';
import { logger } from '../logger';
import { Voicemeeter /* enums/types depuis la lib */ } from 'voicemeeter-connector';

export class VoicemeeterDriver implements Driver {
  private vm!: typeof Voicemeeter.instance;

  async init() {
    this.vm = await Voicemeeter.init();
    this.vm.connect();
    // Recommandé: “prime” du cache de paramètres/dirty
    this.vm.isParametersDirty?.();
    logger.info('Voicemeeter connected');
    // Ecoute temps réel (selon lib): onDirty -> relire ce qui change et pousser feedback
  }

  async sendInitialFeedback(m: ControlMapping[], sendFB: (id: string, v: number) => void) {
    for (const x of m) {
      const v = this.readFor(x);
      if (v != null) sendFB(x.controlId, v);
    }
  }

  handleControl(controlId: string, value: number) {
    // Setter selon mapping (ex. setStripGain, setStripMute, setBusGain…)
  }

  private readFor(x: ControlMapping): number | null {
    // switch par action, lire strip/bus selon params
    // NOTE: garder le mapping d’énums de la lib dans un module dédié au besoin.
    return null; // stub à compléter selon tes actions
  }
}
```

### 6.2 QLCDriver (WebSocket JSON API)

* **Snapshot** :

  * **DMX** : batch `getChannelsValues` (ou API équivalente) puis extraire `params[0]` pour chaque mapping `setChannelValue`.
  * **Widgets/Functions** (si mappés) : lire leurs propriétés/id state via les commandes dédiées (ex. `getWidgetProperties`).
* **Temps réel** : écouter les notifications de changement (si dispo/activées) et pousser feedback ciblé.

```ts
// drivers/qlc.ts (extraits)
import { Driver, ControlMapping } from '../types';

export class QLCDriver implements Driver {
  // WebSocket client + helpers JSON API

  async init() { /* connect WS + heartbeat + retry */ }

  async sendInitialFeedback(m: ControlMapping[], sendFB: (id: string, v: number) => void) {
    const dmx = m.filter(x => x.action === 'setChannelValue');
    if (dmx.length) {
      const values = await this.getChannelsValues(); // { ch:number -> 0..255 }
      for (const x of dmx) {
        const ch = x.params?.[0] as number;
        sendFB(x.controlId, values[ch] ?? 0);
      }
    }
    // Widgets/Functions: appels dédiés puis sendFB(...)
  }

  handleControl() { /* setters via JSON API */ }

  private async getChannelsValues(): Promise<Record<number, number>> {
    // WS round-trip; adapter au schéma réel de QLC+ (JSON)
    return {};
  }
}
```

### 6.3 OBSDriver (`obs-websocket` v5)

* **Snapshot** :

  * `setScene` → comparer avec `GetCurrentProgramScene`.
  * `setMute` → `GetInputMute`.
  * `setVolume` → `GetInputVolume` (lin ou dB, mais choisis une convention et **documente** la conversion vers MIDI).
* **Temps réel** : s’abonner aux events (`CurrentProgramSceneChanged`, `InputMuteStateChanged`, `InputVolumeMeters`/poll si besoin) → feedback.

```ts
// drivers/obs.ts (extraits)
import OBSWebSocket from 'obs-websocket-js';
import { Driver, ControlMapping } from '../types';

export class OBSDriver implements Driver {
  private obs = new OBSWebSocket();

  async init() {
    await this.obs.connect(/* url, password from .env */);
    // subscribe events + retry strategy
  }

  async sendInitialFeedback(m: ControlMapping[], sendFB: (id: string, v: number) => void) {
    for (const x of m) {
      switch (x.action) {
        case 'setScene': {
          const cur = (await this.obs.call('GetCurrentProgramScene')).currentProgramSceneName;
          sendFB(x.controlId, cur === (x.params?.[0] as string) ? 1 : 0);
          break;
        }
        case 'setMute': {
          const muted = (await this.obs.call('GetInputMute', { inputName: x.params?.[0] as string })).inputMuted;
          sendFB(x.controlId, muted ? 1 : 0);
          break;
        }
        case 'setVolume': {
          const { inputVolumeMul } = await this.obs.call('GetInputVolume', { inputName: x.params?.[0] as string });
          // Choix: volume lin 0..1 → envoie tel quel (conversion MIDI dans XTouchDriver)
          sendFB(x.controlId, inputVolumeMul);
          break;
        }
      }
    }
  }

  handleControl() { /* setters OBS v5 */ }
}
```

---

## 7) Conversion valeurs ↔ MIDI (dans `XTouchDriver`)

**Faders motorisés (14‑bit)**

* Interne: `number` (ex. lin 0..1 ou dB).
* **Conversion out**: map → 0..16383, appliquer **deadband** (±1).
* **Conversion in** (depuis X‑Touch): renvoyer vers drivers en unité utile (dB, lin…) selon mapping.

**Boutons/LED**

* Interne: `0 | 1`
* **Out**: Note On/Off (ou CC) selon sniff; **In**: Note On/Off → bool.

**LED rings / LCD**

* **SysEx** spécifiques X‑Touch (à documenter via **sniff**).
* Normaliser côté Router/Driver une **chaîne** ou un **mode** (ex. “pan”, “dot/bar”, text LCD 7‑chars).

---

## 8) Anti‑boucle & coalescing (résumé)

* **Tag** chaque émission vers une app : `{ origin: 'router', ts: Date.now() }`.
* Drivers : si un event entrant **match** une valeur **émise** récemment (±50 ms & même valeur), **ignore**.
* **Coalescing** faders (optionnel) : si plusieurs updates arrivent < X ms, n’en garder qu’une (dernier état).
* **Deadband** faders côté XTouchDriver pour éviter les allers‑retours minuscules.

---

## 9) Hot‑reload

* `ConfigLoader` surveille le YAML (chokidar).
* Validation **stricte** (Zod).
* Swap atomique → `router.setActivePage(currentPageName)` → **sendInitialFeedback()**.

---

## 10) Exemple `config.yaml`

```yaml
midi:
  input_port: "UM-One"
  output_port: "UM-One"

pages:
  - name: "Voicemeeter Main"
    controls:
      - controlId: "fader1"
        app: "voicemeeter"
        action: "setStripGain"
        params: [0]   # strip index
      - controlId: "btn1"
        app: "voicemeeter"
        action: "setStripMute"
        params: [0]
  - name: "QLC Scene"
    controls:
      - controlId: "fader2"
        app: "qlc"
        action: "setChannelValue"
        params: [5]  # DMX channel
  - name: "OBS"
    controls:
      - controlId: "btn2"
        app: "obs"
        action: "setScene"
        params: ["CloseUp"]
      - controlId: "rotary1"
        app: "obs"
        action: "setVolume"
        params: ["Mic/Aux"]
```

---

## 11) `.env.example` & scripts

```env
# MIDI
MIDI_INPUT_PORT=UM-One
MIDI_OUTPUT_PORT=UM-One

# OBS
OBS_WS_URL=ws://127.0.0.1:4455
OBS_WS_PASSWORD=

# QLC+
QLC_WS_URL=ws://127.0.0.1:9999

# LOG
LOG_LEVEL=info
```

```json
// package.json (extrait)
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "debug": "ts-node-dev --respawn --transpile-only --inspect src/index.ts",
    "sniff": "ts-node src/tools/sniff.ts"
  }
}
```

---

## 12) Checklist de validation (rapide)

* [ ] Boot : X‑Touch à jour (faders & LEDs) **sans toucher aucun contrôle**.
* [ ] Changement de page : réalignement < **200 ms** (OBS/VM local) ; QLC+ WS OK.
* [ ] Anti‑boucle : pas d’oscillation faders après set programmatique.
* [ ] Hot‑reload : page active réalignée automatiquement.
* [ ] Sniff doc : **journal** des trames MIDI (canal/type/num/val, SysEx hexdump).
* [ ] Deadband et coalescing actifs.

---

## 13) Pseudo‑code “end‑to‑end” (boot)

```ts
await configLoader.load();
await Promise.all([
  xtouch.init(),
  voicemeeter.init(),
  qlc.init(),
  obs.init(),
]);

await router.setActivePage(config.pages[0].name);
// ... realtime loops: vm.onDirty(...), qlc.onChange(...), obs.onEvent(...)
// router.handleXTouchEvent(...) dispatch vers drivers
```

---

## 14) Points d’attention

* **Ne pas bloquer** le thread : toute I/O en async, pas d’attentes sync lourdes.
* **Limiter les round‑trips** QLC+ (batch lecture DMX).
* **Conversions claires** (lin/dB/DMX↔MIDI) et **centralisées** (XTouchDriver).
* **Logs** (level‑gated) pour tracer: snapshot sizes, temps de lecture, feedback count, boucles ignorées.

