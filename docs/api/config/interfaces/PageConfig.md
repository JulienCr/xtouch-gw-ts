[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / PageConfig

# Interface: PageConfig

Defined in: [config.ts:104](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L104)

Décrit une page de contrôle X‑Touch: nom, ponts, contrôles et LCD.

## Properties

### name

> **name**: `string`

Defined in: [config.ts:106](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L106)

Nom lisible de la page

***

### passthrough?

> `optional` **passthrough**: [`PassthroughConfig`](PassthroughConfig.md)

Defined in: [config.ts:108](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L108)

Pont unique (compatibilité)

***

### passthroughs?

> `optional` **passthroughs**: [`PassthroughConfig`](PassthroughConfig.md)[]

Defined in: [config.ts:110](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L110)

Liste de ponts (préféré)

***

### controls

> **controls**: `Record`\<`string`, `unknown`\>

Defined in: [config.ts:112](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L112)

Définition des contrôles (spécifique aux apps)

***

### lcd?

> `optional` **lcd**: `object`

Defined in: [config.ts:114](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L114)

Configuration des LCD de la X‑Touch pour cette page.

#### labels?

> `optional` **labels**: (`string` \| \{ `upper?`: `string`; `lower?`: `string`; \})[]

Libellés des 8 LCD (haut seulement ou {upper,lower})

#### colors?

> `optional` **colors**: (`string` \| `number`)[]

Couleurs LCD par strip (0..7)
