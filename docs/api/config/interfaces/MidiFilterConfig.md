[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / MidiFilterConfig

# Interface: MidiFilterConfig

Defined in: [config.ts:41](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L41)

Filtre applicables aux messages MIDI sortants vers une application cible.

## Properties

### channels?

> `optional` **channels**: `number`[]

Defined in: [config.ts:43](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L43)

Canaux autorisés (1..16)

***

### types?

> `optional` **types**: [`MidiEventTypeName`](../type-aliases/MidiEventTypeName.md)[]

Defined in: [config.ts:45](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L45)

Types d'événements autorisés (si défini)

***

### includeNotes?

> `optional` **includeNotes**: `number`[]

Defined in: [config.ts:47](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L47)

N'autoriser que ces notes (pour noteOn/noteOff)

***

### excludeNotes?

> `optional` **excludeNotes**: `number`[]

Defined in: [config.ts:49](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L49)

Bloquer ces notes (pour noteOn/noteOff)
