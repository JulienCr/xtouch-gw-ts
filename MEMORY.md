# MEMORY

But: noter les erreurs, impasses et choix importants pour ne pas les répéter.

## Garde-fous
- Utiliser exclusivement pnpm/pnpx (pas npm/npx).
- Version Node ciblée: 24.1+ (engines configuré). 
- Tenir `TASKS.md` à jour après chaque lot de travail.

## Entrées
- 2025-08-08 — Init
  - Décision: TypeScript + tsx (dev) + tsc (build).
  - Décision: `chalk@4` pour compat CJS simple; évite ESM-only de chalk@5 au démarrage.
  - Décision: `config.yaml` racine avec `config.example.yaml` d’illustration.
- 2025-08-08 — Sniffer MIDI
  - Problème: `pnpm add midi` échoue (node-gyp, MSBuild) sous Windows + Node 24.1.
  - Solution: `@julusian/midi` fonctionne immédiatement (précompilé/N-API). Sniffer natif intégré (CLI: midi-ports, midi-open, midi-close).
  - Fallback: sniffer Web MIDI dispo via `pnpm sniff:web` → `http://localhost:8123/`. 