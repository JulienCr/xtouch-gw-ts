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

## Configuration
- Fichier: `config.yaml` (exemple: `config.example.yaml`).
- `LOG_LEVEL` peut être `error|warn|info|debug|trace`. 