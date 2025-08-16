[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [state/types](../README.md) / MidiStateEntry

# Interface: MidiStateEntry

Defined in: [state/types.ts:18](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L18)

Entrée d'état MIDI enrichie (métadonnées) stockée dans le StateStore.

## Properties

### addr

> **addr**: [`MidiAddr`](MidiAddr.md)

Defined in: [state/types.ts:19](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L19)

***

### value

> **value**: [`MidiValue`](../type-aliases/MidiValue.md)

Defined in: [state/types.ts:20](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L20)

***

### ts

> **ts**: `number`

Defined in: [state/types.ts:21](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L21)

***

### origin

> **origin**: `"app"` \| `"xtouch"`

Defined in: [state/types.ts:22](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L22)

***

### known

> **known**: `boolean`

Defined in: [state/types.ts:23](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L23)

***

### stale?

> `optional` **stale**: `boolean`

Defined in: [state/types.ts:24](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L24)

***

### hash?

> `optional` **hash**: `string`

Defined in: [state/types.ts:26](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/types.ts#L26)

Empreinte utile pour SysEx (déduplication/trace).
