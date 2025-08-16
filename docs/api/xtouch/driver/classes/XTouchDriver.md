[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [xtouch/driver](../README.md) / XTouchDriver

# Class: XTouchDriver

Defined in: [xtouch/driver.ts:49](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L49)

Driver bas niveau pour dialoguer avec la Behringer X‑Touch (MIDI in/out, LCD, afficheur 7‑segments).

## Constructors

### Constructor

> **new XTouchDriver**(`ports`, `options?`): `XTouchDriver`

Defined in: [xtouch/driver.ts:56](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L56)

#### Parameters

##### ports

[`XTouchPortsConfig`](../interfaces/XTouchPortsConfig.md)

##### options?

[`XTouchOptions`](../interfaces/XTouchOptions.md)

#### Returns

`XTouchDriver`

## Methods

### start()

> **start**(): `void`

Defined in: [xtouch/driver.ts:67](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L67)

Ouvre les ports MIDI et démarre l'écoute des messages entrants.

#### Returns

`void`

#### Throws

Erreur si l'un des ports configurés est introuvable

***

### squelchPitchBend()

> **squelchPitchBend**(`ms`): `void`

Defined in: [xtouch/driver.ts:150](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L150)

Ignore temporairement les Pitch Bend entrants (anti‑boucle moteurs → QLC).

#### Parameters

##### ms

`number`

Durée d'ignorance en millisecondes

#### Returns

`void`

***

### isPitchBendSquelched()

> **isPitchBendSquelched**(): `boolean`

Defined in: [xtouch/driver.ts:155](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L155)

Indique si les Pitch Bend entrants sont actuellement ignorés.

#### Returns

`boolean`

***

### subscribe()

> **subscribe**(`handler`): () => `void`

Defined in: [xtouch/driver.ts:164](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L164)

S'abonne aux messages MIDI entrants de la X‑Touch.

#### Parameters

##### handler

[`MessageHandler`](../type-aliases/MessageHandler.md)

Callback recevant le delta temps et les octets MIDI

#### Returns

Une fonction de désinscription

> (): `void`

##### Returns

`void`

***

### sendRawMessage()

> **sendRawMessage**(`bytes`): `void`

Defined in: [xtouch/driver.ts:170](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L170)

Envoie une trame MIDI brute vers la X‑Touch.

#### Parameters

##### bytes

`number`[]

#### Returns

`void`

***

### setFader14()

> **setFader14**(`channel1to16`, `value14`): `void`

Defined in: [xtouch/driver.ts:180](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L180)

Positionne un fader via un Pitch Bend 14 bits.

#### Parameters

##### channel1to16

`number`

Canal MIDI (1..16)

##### value14

`number`

Valeur 14 bits (0..16383)

#### Returns

`void`

***

### sendLcdStripText()

> **sendLcdStripText**(`stripIndex0to7`, `upper`, `lower`): `void`

Defined in: [xtouch/driver.ts:198](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L198)

Écrit du texte sur un strip LCD (ligne haute et basse).

#### Parameters

##### stripIndex0to7

`number`

Index du strip (0..7)

##### upper

`string`

Ligne haute (7 caractères max)

##### lower

`string` = `""`

Ligne basse (7 caractères max)

#### Returns

`void`

***

### setLcdColors()

> **setLcdColors**(`colors`): `void`

Defined in: [xtouch/driver.ts:212](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L212)

Définis les couleurs des 8 LCD (firmware >= 1.22).

#### Parameters

##### colors

`number`[]

#### Returns

`void`

***

### setSevenSegmentText()

> **setSevenSegmentText**(`text`, `options?`): `void`

Defined in: [xtouch/driver.ts:230](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L230)

Met à jour le grand afficheur 7-segments (zone timecode) via trame vendor Behringer.

Format: F0 00 20 32 dd 37 s1..s12 d1 d2 F7
- dd: device id (X‑Touch 0x14, Extender 0x15)
- s1..s12: masques 7-segments (bit0=a … bit6=g) pour chaque digit
- d1: dots digits 1..7 (bit0 => digit1, …, bit6 => digit7)
- d2: dots digits 8..12 (bit0 => digit8, …, bit4 => digit12)

Affiche le texte centré/tronqué à 12 caractères. Les caractères non supportés sont rendus vides.

#### Parameters

##### text

`string`

##### options?

###### deviceId?

`number`

###### dots1?

`number`

###### dots2?

`number`

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [xtouch/driver.ts:246](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L246)

Ferme proprement les ports MIDI et vide les abonnements.

#### Returns

`void`
