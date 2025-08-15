Parfait. Voici une **mise à jour de la doc existante** (pas de changement YAML) qui intègre le **state par logiciel (MIDI-only)** et le **Reset→Replay** à l’activation de page. C’est prêt pour que Cursor implémente.

# Addendum – State MIDI-only & Reset→Replay

## 1) Principes

* **Source unique du state** : **feedback MIDI** de chaque appli (Voicemeeter, QLC+, OBS) sur leurs **ports feedback** dédiés.
  → On **n’écrit jamais** dans un state à partir d’une action utilisateur; on attend l’echo MIDI des apps.
* À l’activation d’une page, la gateway :

  1. **Reset ciblé** des contrôles X-Touch **inconnus** (OFF/0/HOLD selon type).
  2. **Replay** immédiat des valeurs **connues** (app → xtouch via transform **entrante**).

## 2) Politique de reset (globale, identique pour toutes les pages)

* **Notes (LED, mutes/solos/etc.)** : `OFF` (NoteOff vel=0).
* **CC (rings/encoders)** : `0`.
* **Pitch Bend (faders moteurs)** : `HOLD` (ne pas bouger tant que l’app n’a pas parlé).
* **SysEx (LCD)** : `HOLD` (on conserve les labels de page, pas de clear agressif).

> Cette politique est **codée en dur** côté Router/XTouchDriver. **Aucun changement YAML.**

## 3) Détermination de la portée du reset (sans YAML)

Le **Router** construit, à chaque activation de page, un **ensemble de cibles X-Touch** à réinitialiser, à partir de ce qui existe déjà :

* **controls** de la page (quand présents) → résolus en adresses X-Touch.
* **passthroughs.filter** (`channels`, `types`) → déduire les **familles d’adresses** X-Touch à couvrir (ex. si `types` inclut `noteOn/noteOff`, on cible les LED latched sur les `channels` indiqués).
* **passthroughs.transform** (ex. `pb_to_cc`) → infère l’usage des **faders** concernés.

Le **XTouchDriver** expose un **catalogue d’adresses** (MC DIN) par strip (fader, mute, solo, enc ring, etc.).

> **Pré-requis** : alimenter ce catalogue par **sniff** (ne rien inventer). Le reset ne doit émettre que des trames **documentées**.

## 4) Modèle de données (runtime)

* `MidiAddr = { portId, status, channel, data1 }` (`data1=0` pour PB).
* `MidiStateEntry = { addr: MidiAddr, value, ts, origin:'app'|'xtouch', known:boolean, stale?:boolean }`
* `AppState = Map<MidiAddr, MidiStateEntry>` **par appli**.
* `StateStore = { apps: Record<AppName, AppState> }`
* `XTouchShadow = Map<MidiAddr,value>` : dernière valeur **envoyée** à la X-Touch (anti-boucle + suppression des doublons).

## 5) Transforms (sens explicites, sans YAML)

On formalise deux sens :

* **out (xtouch→app)** : déjà présents dans tes `passthroughs.transform` (ex. `pb_to_cc`).
* **in (app→xtouch)** : **ajout côté code** (pas déclarés en YAML) pour rejouer le feedback des apps vers la X-Touch lors du **Replay** :

  * `cc_to_pb` (7/14-bit → PB 14-bit ; si 7-bit, `msb=cc<<7, lsb=0`).
  * `note_passthrough` (Note vel 0/127 → LED OFF/ON).
  * `cc_to_ring` (0..127 → position anneau).
  * `sysex_passthrough` (rejoue le payload tel quel si connu).

> Le **Router** choisit la paire `in/out` en fonction des filtres/transform déjà déclarés sur la page; pas de nouveau YAML.

## 6) Algorithme d’activation de page

1. **Résolution des cibles**

   * À partir des `controls` + `passthroughs` + `filters`, déterminer les **MidiAddr X-Touch** impliquées (via le catalogue X-Touch).
2. **RESET ciblé** (≤ quelques ms, dans l’ordre)

   * **Notes → CC → LCD → PB**
   * Pour chaque cible sans valeur **connue** dans le `StateStore` :

     * Notes → `NoteOff(vel=0)`
     * CC → `0`
     * LCD → **rien**
     * PB → **rien**
3. **REPLAY immédiat**

   * Pour chaque cible avec valeur **connue** (state `origin=app`) :

     * Appliquer la **transform entrante** (app→xtouch) adaptée.
     * Émettre si **différent** de `XTouchShadow`.
     * Marquer `origin='xtouch'` + timestamp pour l’anti-boucle.
4. **Anti-boucle**

   * Si un echo app ré-arrive **identique** dans **< 50 ms**, ignorer.
5. **Coalescing & Deadband**

   * Fenêtre coalescing **5–10 ms** par contrôle (rafales faders/rings).
   * Deadband faders PB **±1/16384**.

## 7) Flux d’ingestion (rappel)

* **App → Driver App → Router**
  `StateStore.update(app, entry{origin='app', known=true})`
  Si page active et cible mappée → feedback vers X-Touch (anti-boucle).
* **X-Touch → Router → App** (interaction)
  On **n’écrit pas** dans le state; on attend l’echo MIDI app.

## 8) Paramétrage (pas de YAML)

Petits réglages en **.env** ou config (facultatif) :

* `INTER_MSG_DELAY_MS=1`
* `COALESCE_MS=8`
* `ANTILOOP_WINDOW_MS=50`
* `FADER_DEADBAND=1`
* `RESET_FADERS=hold` *(valeurs: `hold`|`zero` – `hold` par défaut)*

> Si non définis, utiliser ces **valeurs par défaut** en code.

## 9) Tests ciblés

* **Cold start** (aucun feedback reçu) → page switch :

  * LED **OFF**, rings **0**, **faders immobiles**, LCD inchangé.
* **Feedback différé** (après switch) → Replay applique les valeurs reçues, sans pumping.
* **Anti-boucle** : envoi → echo identique < 50 ms → **ignoré**.
* **Transforms** : `pb↔cc`, `cc→ring`, `note→note` validés avec golden logs.
* **Stress** : mouvements faders + switch rapide → pas de jitter (coalescing + deadband OK).

---

### Décision

* On **conserve ton YAML** tel quel.
* On implémente **State MIDI-only par appli** + **Reset→Replay global** (politique ci-dessus) **dans le Router/XTouchDriver**, en s’appuyant sur :

  * un **catalogue X-Touch** issu du **sniff**,
  * des **transforms entrantes** (app→xtouch) **internes** (pas dans le YAML),
  * l’**anti-boucle** par `origin+ts` et la **deadband**.
