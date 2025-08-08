# XTouch GW

Passerelle pour piloter Voicemeeter, QLC+ et OBS depuis un Behringer X-Touch.

## Prérequis
- Node.js >= 24.1 [[Engines]]
- pnpm (via Corepack)

## Installation
```sh
corepack enable
pnpm install
```

## Développement
```sh
pnpm dev
```

## Build
```sh
pnpm build
pnpm start
```

## Pages & Passthrough
- Navigation prev/next par défaut: NoteOn ch=1 notes 46/47 (configurable via `paging`).
- Si une page définit `passthrough`, un bridge MIDI dédié est activé pour cette page; le bridge global est alors désactivé automatiquement.

Exemple `config.yaml` minimal:
```yaml
midi:
  input_port: "UM-One"
  output_port: "UM-One"

paging:
  channel: 1
  prev_note: 46
  next_note: 47

pages:
  - name: "Voicemeeter Main"
    passthrough:
      driver: "midi"
      to_port: "xtouch-gw"
      from_port: "xtouch-gw-feedback"
    controls: {}
```

## Sniffer & CLI
- Démarrer avec logs détaillés (PowerShell):
  ```powershell
  $env:LOG_LEVEL="debug"; pnpm start
  ```
- CLI documentée dans `docs/CLI.md` (incluant `learn`, `fader`, `xtouch-stop`, `xtouch-start`).

## Configuration
- Fichier: `config.yaml` (exemple: `config.example.yaml`).
- `LOG_LEVEL` peut être `error|warn|info|debug|trace`. 