[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / PassthroughConfig

# Interface: PassthroughConfig

Defined in: [config.ts:55](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L55)

Décrit un pont (passthrough) entre la X‑Touch et une application cible.

## Properties

### driver

> **driver**: `string`

Defined in: [config.ts:57](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L57)

Type de driver cible (ex: "midi", "voicemeeter")

***

### to\_port

> **to\_port**: `string`

Defined in: [config.ts:59](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L59)

Nom du port de sortie (vers l'application cible)

***

### from\_port

> **from\_port**: `string`

Defined in: [config.ts:61](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L61)

Nom du port d'entrée (feedback depuis l'application)

***

### filter?

> `optional` **filter**: [`MidiFilterConfig`](MidiFilterConfig.md)

Defined in: [config.ts:63](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L63)

Filtre appliqué aux messages sortants vers la cible

***

### optional?

> `optional` **optional**: `boolean`

Defined in: [config.ts:65](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L65)

Si true, ignorer proprement si les ports n'existent pas

***

### transform?

> `optional` **transform**: [`TransformConfig`](TransformConfig.md)

Defined in: [config.ts:67](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L67)

Transformations à appliquer aux messages sortants
