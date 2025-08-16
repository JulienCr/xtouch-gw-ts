[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / AppConfig

# Interface: AppConfig

Defined in: [config.ts:125](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L125)

Configuration racine de l'application.

## Properties

### midi

> **midi**: `object`

Defined in: [config.ts:127](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L127)

Ports MIDI X‑Touch

#### input\_port

> **input\_port**: `string`

#### output\_port

> **output\_port**: `string`

***

### features?

> `optional` **features**: [`FeaturesConfig`](FeaturesConfig.md)

Defined in: [config.ts:132](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L132)

Fonctionnalités optionnelles

***

### paging?

> `optional` **paging**: [`PagingConfig`](PagingConfig.md)

Defined in: [config.ts:134](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L134)

Navigation entre pages

***

### pages

> **pages**: [`PageConfig`](PageConfig.md)[]

Defined in: [config.ts:136](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L136)

Liste des pages définies
