# Fonctionne régie Twitch  - La Scène Avolo

## Hardware et logiciels

### Sur le PC :
- Voicemeeter Potato
- QLC+
- OBS Studio
- XTouch-GW (homemade)
- ivCam
- loopMidi
- VDO Ninja
- Receiver micros HF

En hardware : 
- StreamDeck
- Focusrite Scarlett 2i2
- Behringer XTouch

### Sur le Mac :
- QLab
- VBAN Talkie Cherry
- Ladiocast

En hardware : 
- Behringer Xenyx 502

### Sur le plateau
- 3 caméras (iphones), via ivCam
    - camera 1 : large, 4K
    - camera 2 : lat jardin (sur l'étagère)
    - camera 3 : lat cour (sur l'étagère murale)

- 2 PARS 64 LED blanc chaud pour la face, montés sur pieds à 2m de hauteur
- 4 néons RGB : 2 latéraux (verticaux), 2 contres (horizontaux au sol), raccordés sur un  decodeur DMX 12 canaux
- 2 contres RGB sur rideaux au sol
- 2 Latéraux au manteau, RGB(WW) - en hauteur sur étagères
- Une enceinte bluetooh pour les retours
- 2 micros cravates HF
- Un ordinateur pour les retours
    - Logiciel Twitch Companion (homemade), avec chat, retour Twitch et retour direct via VDO Ninja
- 2 batteries pour les téléphones
- Un chargeur pour la cam 1

## Fonctionnement

### Video

OBS Studio est utilisé pour la vidéo.
Il permet de switcher de caméras (une scène = une caméra). 
La caméra principale en 4K permet de cropper pour faire des caméras alternatives. On a prévu 4 positions de crop. On peut aussi modifier ces crops en direct via la Xtouch grâce aux 3 derniers encodeurs (x, y, zoom).
Le son arrive déjà mixé, via Voicemeeter. 
Des scène en plus sont également disponibles
- Carton "on arrive"
- Vidéo d'intro
- Ecran pause / camera floutée
- Camera 3 + chat
- Partage du navigateur du PC Régie + camera 1

La Xtouch et le StreamDeck permettent tout deux 
- de switcher de scène
- d'activer et gérer le mode studio

Paramétrage ivCam
- Exposition : 150
- ISO : 150
- Compensation exposition : 0
- Balance des blancs : 3500
- Focus : auto

Note penser à 
- Désactiver "embellir"
- Activer "Extinction écran
- Alimenter les téléphones

## Audio

### Voicemeeter

Input
- Input 1 : A1 ASIO input (left) --> retour HF via Focusrite, micro Baba, en mono
    - mono
    - compression 6.2
    - Gate 1.0
    - Denoiser 0.5
- Input 2 : A1 ASIO input (right) --> retour HF via Focusrite, micro Mathilde, en mono
    - mono
    - compression 6.2
    - Gate 1.0
    - Denoiser 0.5
- Input 3 : Micro ordinateur (DAC USB Logitech)
    - mono
    - compression 4.7
    - Gate 3.1
    - Denoiser 2.8

Virtual Inputs
- VA 1 : Son PC
- VA 2 : Son MAC (via VBAN)

Physical Outputs
- A1 : Focusrite --> peut faire office de retour, mais sur enceinte, risque de feedback. On peut brancher un casque sur la Focusrite en solution.
- A2 : Casque Logitech (via DAC USB Logitech) --> monitoring
- A3 : Enceinte Bluetooth  --> retours

Virtual Outputs
- B1 : Vers OBS (master)

#### Systeme settings
- OUT A1 Main device
    - 48kHz, buffer 256
    - IN1 1 | _ 
    - IN2 2 | _
- On peut ajouter 200ms de delay sur A1 si on veut sync avec le retour (le bluetooth engendrant un peu de latence)

### Midi Mapping 
cf mapping en annexe

Permet le contrôle avec la Xtouch et le StreamDeck.

## Xtouch
Cf mapping en annexe

Gère Voicemeeter en midi, QLC+ en midi et OBS via l'API websocket.

## QLC+

