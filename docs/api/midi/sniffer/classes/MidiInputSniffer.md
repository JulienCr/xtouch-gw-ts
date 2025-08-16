[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [midi/sniffer](../README.md) / MidiInputSniffer

# Class: MidiInputSniffer

Defined in: [midi/sniffer.ts:29](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/midi/sniffer.ts#L29)

## Constructors

### Constructor

> **new MidiInputSniffer**(`onMessage`): `MidiInputSniffer`

Defined in: [midi/sniffer.ts:33](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/midi/sniffer.ts#L33)

#### Parameters

##### onMessage

[`MidiMessageHandler`](../type-aliases/MidiMessageHandler.md)

#### Returns

`MidiInputSniffer`

## Methods

### openByIndex()

> **openByIndex**(`index`): `void`

Defined in: [midi/sniffer.ts:35](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/midi/sniffer.ts#L35)

#### Parameters

##### index

`number`

#### Returns

`void`

***

### openByName()

> **openByName**(`partialName`): `boolean`

Defined in: [midi/sniffer.ts:56](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/midi/sniffer.ts#L56)

#### Parameters

##### partialName

`string`

#### Returns

`boolean`

***

### close()

> **close**(): `void`

Defined in: [midi/sniffer.ts:64](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/midi/sniffer.ts#L64)

#### Returns

`void`
