# CLI de développement – XTouch GW

Cette CLI, accessible dans le terminal au démarrage de l’app, permet de:
- Inspecter les ports MIDI
- Sniffer et décoder les messages de la X‑Touch
- Apprendre (learn) et générer des lignes de mapping YAML
- Tester le Router avec des commandes synthétiques

## Lancer

- Windows PowerShell (conseillé pour LOG_LEVEL):
```powershell
$env:LOG_LEVEL="debug"; pnpm start
```

## Commandes disponibles

- `pages`
  - Affiche la liste des pages de `config.yaml`.

- `page <idx|name>`
  - Active une page par index (0..n-1) ou par nom.

- `emit <controlId> [value]`
  - Simule l’émission d’un contrôle vers le Router (utile pour tester un mapping).

- `midi-ports`
  - Liste les entrées MIDI disponibles, avec index et nom.

- `midi-open <idx|nom>`
  - Ouvre un port d’entrée MIDI par index ou par sous-chaîne du nom.
  - Exemple: `midi-open 0` ou `midi-open UM-One`

- `midi-close`
  - Ferme l’entrée MIDI ouverte.

- `learn <id>`
  - Arme un "learn": le prochain message reçu propose un `controlId` et une ligne YAML prête à copier.
  - Exemple: `learn fader1` puis bouger le fader 1.

- `help`
  - Rappelle les commandes.

- `exit`
  - Quitte proprement l’application.

## Logs

- Niveau `debug`: affiche le brut hex + delta temps.
- Niveau `info`: affiche un message décodé lisible (NoteOn/Off, CC avec delta relatif, PitchBend 14 bits).

Exemples:
- Fader: `PitchBend ch=1 val14=200 norm=0.012`
- Bouton: `NoteOn ch=1 note=25 vel=127` puis `NoteOff ch=1 note=25 vel=0`
- Encodeur: `CC ch=1 cc=17 val=1 rel=1` (ou `rel=-1` pour décrément)

## Learn – sortie YAML

Après `learn <id>`, le prochain message produit:
- un résumé lisible
- une proposition de `controlId` (basée sur le type/canal)
- un "détecteur" (clé interne, ex: `pb:1` pour PitchBend canal 1)
- une ligne YAML prête à coller dans `config.yaml`, ex:

```yaml
fader1: { app: "console", action: "log", params: [] }
```

Adaptez ensuite `app`, `action` et `params` selon l’application cible (Voicemeeter/QLC+/OBS).
