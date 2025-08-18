# CLI de développement – XTouch GW

Cette CLI, accessible dans le terminal au démarrage de l’app, permet de:
- Inspecter les ports MIDI
- Sniffer et décoder les messages de la X‑Touch
- Apprendre (learn) et générer des lignes de mapping YAML
- Tester le Router avec des commandes synthétiques
- Piloter directement la surface X‑Touch (faders) et gérer l’ouverture/fermeture des ports

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
  - Simule l'émission d'un contrôle vers le Router (utile pour tester un mapping).

- `send <command>`
  - Envoie un message MIDI brut vers la X-Touch.
  - Utilise la syntaxe `parseCommand` avec paramètres nommés (support décimal, hex 0x, et hex avec suffixe n) :
    - `send noteon ch=1 note=118 velocity=127` - Note On (décimal)
    - `send noteon ch=1 note=0x76 velocity=0x7F` - Note On (hexadécimal)
    - `send noteon ch=1 note=0x1n velocity=0x1n` - Note On (hex avec suffixe n)
    - `send noteoff ch=1 note=0x76` - Note Off  
    - `send cc ch=1 cc=0x10 value=0x40` - Control Change
    - `send pb ch=1 value=8192` - Pitch Bend 14-bit
    - `send raw 90 76 7F` - Message brut hexadécimal

- `midi-ports`
  - Liste les entrées MIDI disponibles, avec index et nom.

- `midi-open <idx|nom>`
  - Ouvre un port d’entrée MIDI par index ou par sous-chaîne du nom (pour sniffer/learn).
  - Exemple: `midi-open 0` ou `midi-open UM-One`

- `midi-close`
  - Ferme l’entrée MIDI ouverte par la commande ci-dessus.

- `learn <id>`
  - Arme un "learn": le prochain message reçu propose un `controlId` et une ligne YAML prête à copier.
  - Exemple: `learn fader1` puis bouger le fader 1.

- `fader <ch> <0..16383>`
  - Envoie une position 14 bits directement au fader motorisé du canal MIDI (1..16).
  - Exemple: `fader 5 8192` (milieu), `fader 5 0` (bas), `fader 5 16383` (haut).

- `xtouch-stop`
  - Arrête le driver X‑Touch et libère les ports (évite les conflits pour le sniffer).

- `xtouch-start`
  - Relance le driver X‑Touch en rouvrant les ports définis dans `config.yaml`.

- `reset`
  - Réinitialise complètement la surface X-Touch (éteint tous les boutons, remet les faders à 0, efface les LCD).

- `state <load|rm>`
  - `state load` - Recharge les états depuis le snapshot persistant (`.state/snapshot.json`), synchronise automatiquement la surface X-Touch et recharge la configuration (LCD, éléments statiques)
  - `state rm` - Supprime tous les états en mémoire ET les fichiers de persistance (`.state/snapshot.json`), puis synchronise la surface X-Touch

- `show <pages>`
  - `show pages` - Affiche la liste des pages avec leur index (1,2,3...) et indique la page active

- `help`
  - Rappelle les commandes.

- `exit`
  - Quitte proprement l’application.

## Workflow recommandé (éviter conflits de ports)

1. Au démarrage, le driver X‑Touch ouvre déjà les ports `midi.input_port` / `midi.output_port`.
2. Pour sniffer/learn sur le même port d’entrée, libérez-le:
   - `xtouch-stop`
   - `midi-ports` puis `midi-open <idx|nom>`
   - `learn <id>` et touchez un contrôle
   - `midi-close`
   - `xtouch-start` (reconnecte la surface)

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
