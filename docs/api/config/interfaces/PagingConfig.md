[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / PagingConfig

# Interface: PagingConfig

Defined in: [config.ts:9](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L9)

Configuration de la pagination (navigation entre pages) depuis la X‑Touch.

## Properties

### channel?

> `optional` **channel**: `number`

Defined in: [config.ts:11](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L11)

Canal MIDI à utiliser pour les notes Prev/Next (défaut: 1)

***

### prev\_note?

> `optional` **prev\_note**: `number`

Defined in: [config.ts:13](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L13)

Note MIDI pour la navigation vers la page précédente (défaut: 46)

***

### next\_note?

> `optional` **next\_note**: `number`

Defined in: [config.ts:15](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L15)

Note MIDI pour la navigation vers la page suivante (défaut: 47)
