[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [state/builders](../README.md) / buildEntryFromRaw

# Function: buildEntryFromRaw()

> **buildEntryFromRaw**(`raw`, `portId`): `null` \| [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)

Defined in: [state/builders.ts:12](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/builders.ts#L12)

Construit une entrée de state à partir d'une trame MIDI brute.
- NoteOn/NoteOff → value = vélocité (0 = off)
- CC → value = 0..127
- PB → value = 0..16383 (14 bits)
- SysEx → value = Uint8Array (payload complet)

## Parameters

### raw

`number`[]

### portId

`string`

## Returns

`null` \| [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)
