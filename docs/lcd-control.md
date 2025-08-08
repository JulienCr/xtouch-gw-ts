Courte réponse, orientée exé : il y a **2 chemins** pour écrire sur les LCD de la X‑Touch via MIDI DIN.

# 1) En **Mackie Control (MCU) mode** – recommandé si tu restes “MC”

* Le texte des **scribble strips** se pousse en **SysEx MCU** :

  * **Header** (Behringer/MCU) : `F0 00 00 66 14`
  * **Commande LCD** : `12`
  * **Position** (0x00..0x6F) : index du **premier caractère** à écrire

    * Ligne haute : `0x00..0x37` (56 chars)
    * Ligne basse : `0x38..0x6F` (56 chars)
    * Formule utile : `pos = line*0x38 + strip*7 + offset` (line=0 ou 1, strip=0..7, offset=0..6)
  * **Payload** : ASCII (7 caractères par strip)
  * **Fin** : `F7`

Exemples/refs communautaires confirment `0x12` et `0x38` pour début de ligne 2, et le mapping 112 caractères (2×8×7). ([Ardour][1], [GitHub][2], [Gig Performer Community][3])

* **Couleurs en MCU** (firmware ≥ 1.22) : Behringer a ajouté une extension SysEx `0x72` pour définir la couleur de chaque strip (0=blank, 1=red, …, 7=white). Exemple pour 8 strips :

  ```
  F0 00 00 66 14 72 00 01 02 03 04 05 06 07 F7
  ```

  (Un octet par strip). ([Reddit][4], [Logic Pro Help][5])

### Snippet TypeScript (lib `midi`), prêt à coller

```ts
// src/utils/xtouch-mcu-lcd.ts
import midi from 'midi';

export class XTouchMCU {
  private out = new midi.Output();
  constructor(portName: string) {
    const n = this.out.getPortCount();
    for (let i = 0; i < n; i++) {
      if (this.out.getPortName(i).includes(portName)) { this.out.openPort(i); return; }
    }
    throw new Error(`MIDI out port not found: ${portName}`);
  }

  // Ecrit 7 chars (upper/lower) sur un strip donné (0..7)
  writeStripText(strip: number, upper: string, lower: string) {
    const enc = (s: string) => Array.from(s.padEnd(7).slice(0,7)).map(c => c.charCodeAt(0));
    const up = enc(upper), lo = enc(lower);

    const syx = (pos: number, bytes: number[]) =>
      [0xF0,0x00,0x00,0x66,0x14,0x12,pos, ...bytes, 0xF7];

    // ligne haute
    const posTop = 0x00 + (strip * 7);
    this.out.sendMessage(syx(posTop, up));
    // ligne basse
    const posBot = 0x38 + (strip * 7); // début ligne 2 = 0x38
    this.out.sendMessage(syx(posBot, lo));
  }

  // Définit la couleur des 8 scribble strips (0..7)
  setColors(colors: number[]) {
    const payload = colors.slice(0,8);
    while (payload.length < 8) payload.push(0); // pad
    const msg = [0xF0,0x00,0x00,0x66,0x14,0x72, ...payload, 0xF7];
    this.out.sendMessage(msg);
  }
}
```

# 2) En **MIDI Mode (non‑MCU)** – si tu veux tout piloter “à la main”

Behringer publie un PDF d’implémentation **MIDI Mode** (hors MCU). Pour les LCD :

```
F0 00 20 32 dd 4C nn cc c1 .. c14 F7
```

* `dd` : device id (X‑Touch 0x14, Ext 0x15)
* `nn` : numéro d’écran (0..7)
* `cc` : bits couleur/inversion (0..2 = couleur fond, 4 = invert top, 5 = invert bottom)
* `c1..c14` : ASCII (1..7 = moitié haute, 8..14 = moitié basse)
  Doc officielle Music Tribe.&#x20;

👉 Avantages du **MIDI Mode** : couleurs et texte en un seul message par écran, sans passer par les offsets MCU; inconvénient : tu perds la compat MCU out‑of‑the‑box (donc moins “plug‑and‑play” avec des DAW).

---

## Recos pour ton projet XTouch GW

* **Reste en MCU mode** (périmètre v1) et utilise :

  * `0x12` pour texte (formule pos ci‑dessus).
  * `0x72` pour couleurs (si firmware à jour). ([Logic Pro Help][5], [Reddit][4])

* Implémente une API `XTouchDriver.sendFeedback({ type: 'lcd', strip, upper, lower, color })` qui :

  1. **coalesce** les updates (faders → beaucoup d’events),
  2. applique **deadband** texte (ne renvoyer que si le contenu change),
  3. tague `origin/timestamp` pour éviter les **boucles**,
  4. tronque/pad à **7 chars**/ligne.

* Ajoute un **mode sniff** (MIDI‑OX style) pour confirmer les trames ; ne **jamais** figer des codes sans capture réelle (ta règle). Pour vérif rapide : tester `F0 00 00 66 14 12 00 48 65 6C 6C 6F F7` → écrit “Hello” ligne 1 pos 0. ([Cantabile Community][6])

Besoin que je te fasse la méthode `sendLCD(strip, upper, lower, color?)` intégrée à ton `XTouchDriver` (TS/ESM, logs + anti‑boucle) ?

[1]: https://discourse.ardour.org/t/a-report-about-x-touch-and-some-ideas/88128?utm_source=chatgpt.com "A report about X-Touch and some ideas"
[2]: https://github.com/Ardour/ardour/blob/master/libs/surfaces/mackie/surface.cc?utm_source=chatgpt.com "ardour/libs/surfaces/mackie/surface.cc at master"
[3]: https://community.gigperformer.com/t/icon-p1-m-a-new-very-interesting-small-control-surface/16394?page=2&utm_source=chatgpt.com "Icon P1-M: a new very interesting small control surface"
[4]: https://www.reddit.com/r/ableton/comments/1b7hefn/behringer_xtouch_color_scribble_strips/?utm_source=chatgpt.com "Behringer X-Touch color scribble strips? : r/ableton"
[5]: https://www.logicprohelp.com/forums/topic/151589-108-and-x-touch-controllers/?utm_source=chatgpt.com "10.8 and X-Touch Controllers"
[6]: https://community.cantabilesoftware.com/t/behringer-x-touch-integration/5529?utm_source=chatgpt.com "Behringer X-Touch integration - Related"
