Entrée Manette (Gamepad) → Contrôles Logiques

Objectif

- Piloter les apps (OBS, QLC, Voicemeeter, etc.) avec une manette USB standard sous Windows.
- Aucun feedback nécessaire (pas de rumble/vibration) pour v1.
- Réutiliser le routeur existant via `router.handleControl(controlId, value?)` comme pour la X‑Touch.

Périmètre v1

- Windows uniquement.
- Boutons numériques (A/B/X/Y, D‑Pad, L/R, ZL/ZR, L3/R3, Plus, Minus, Home, Capture).
- Axes analogiques (sticks et triggers) avec normalisation et deadzone simple.

Librairie

- `node-hid` (HID brut, multi‑contrôleurs). Nécessite un mapping CSV par modèle (outil de calibration fourni).

IDs de contrôle standards (noms « humains »)

- Boutons: `gamepad.btn.a`, `gamepad.btn.b`, `gamepad.btn.x`, `gamepad.btn.y`, `gamepad.btn.lb`, `gamepad.btn.rb`, `gamepad.btn.zl`, `gamepad.btn.zr`, `gamepad.btn.l3`, `gamepad.btn.r3`, `gamepad.btn.plus`, `gamepad.btn.minus`, `gamepad.btn.home`, `gamepad.btn.capture`.
- D‑Pad: `gamepad.dpad.up`, `gamepad.dpad.down`, `gamepad.dpad.left`, `gamepad.dpad.right`.
- Axes: `gamepad.axis.lx`, `gamepad.axis.ly`, `gamepad.axis.rx`, `gamepad.axis.ry`, `gamepad.axis.zl`, `gamepad.axis.zr` (triggers analogiques).

Mapping → actions (dans config.yaml)

- Pas de CSV dédié. Les actions sont déjà définies dans `config.yaml > pages[*].controls`. On y référence directement les IDs ci‑dessus comme `control_id`.
- Sémantique par défaut:
  - Bouton press: `router.handleControl(control_id)` (on ne déclenche pas à la relâche, sauf si le mapping est `midi`).
  - Bouton release avec `midi`: si `controls.*.midi.type` est `note` ou `cc`, envoyer 127 à l’appui puis 0 au relâchement (comme pour X‑Touch). Si `passthrough`, relayer brut press/release.
  - Axes/Triggers: `router.handleControl(control_id, value)` avec `value` normalisé (−1..+1 pour sticks, 0..1 pour triggers). Les conversions MIDI (7/14 bits) se font côté action/driver si nécessaire.

Extrait de config.yaml (exemple)

```yaml
pages:
  - name: "OBS Cam"
    controls:
      gamepad.btn.plus: { app: "obs", action: "toggleStudioMode" }
      gamepad.btn.a:    { app: "obs", action: "changeScene", params: ["Cam1"] }
      gamepad.btn.b:    { app: "obs", action: "changeScene", params: ["Cam2"] }
      gamepad.dpad.left:  { app: "router", action: "prevPage" }
      gamepad.dpad.right: { app: "router", action: "nextPage" }
      gamepad.axis.lx: { app: "obs", action: "nudgeX", params: ["Scene", "Camera1", 4] }
      gamepad.axis.ly: { app: "obs", action: "nudgeY", params: ["Scene", "Camera1", 4] }
      gamepad.axis.zr: { app: "obs", action: "scaleUniform", params: ["Scene", "Camera1", 0.01] }
      gamepad.axis.zl: { app: "obs", action: "scaleUniform", params: ["Scene", "Camera1", -0.01] }
```

Intégration (architecture)

- `src/input/gamepad/provider-hid.ts`: lecture HID via `node-hid` + décodage à partir d’un mapping CSV.
- `src/input/gamepad/index.ts`: service d’entrée + `subscribe(cb)` qui émet des `{ id, type: "button|axis", value }` avec les IDs ci‑dessus.
- `src/input/gamepad/mapper.ts`: branchement au Router; applique la sémantique press/release/analog décrite ci‑dessus et respecte les cas `midi.passthrough | note | cc`.
- `src/app.ts`: si `cfg.gamepad?.enabled`, initialiser le service et attacher le mapper.

Paramètres (config.yaml)

```yaml
gamepad:
  enabled: true
  provider: hid
  hid:
    product_match: "Faceoff Wired Pro Controller" # ou vendor_id/product_id
    mapping_csv: ./docs/gamepad-hid-mapping.csv
```

Calibration (HID)

- Commande: `pnpm gamepad:calibrate` (ou `tsx scripts/gamepad-calibrate.ts`)
- Le script vous demande d’appuyer successivement sur A, B, X, Y, D‑Pad, sticks et triggers, et enregistre `docs/gamepad-hid-mapping.csv`.
- Ce fichier est lu par `provider-hid` pour traduire les rapports HID en IDs standard.

Plan / TODO

1) Choisir provider HID (`node-hid`) et ajouter dépendance.
2) Implémenter `provider-hid` (lecture, décodage via CSV).
3) Script `scripts/gamepad-calibrate.ts` pour générer le CSV.
4) Brancher dans `src/app.ts` avec `cfg.gamepad.enabled`.
5) Exemple `config.yaml` et docs (ce fichier).
6) Tests unitaires: décodage bit/u8/u16; test d’intégration avec device mock.

Compat / limites

- Les pads non XInput pourront nécessiter un provider HID ultérieur.
- Pas de feedback manette en v1.
