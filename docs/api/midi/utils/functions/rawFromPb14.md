[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [midi/utils](../README.md) / rawFromPb14

# Function: rawFromPb14()

> **rawFromPb14**(`channel`, `value14`): \[`number`, `number`, `number`\]

Defined in: [midi/utils.ts:80](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/midi/utils.ts#L80)

Construit les 3 octets MIDI d'un PitchBend pour un canal donné à partir d'une valeur 14 bits.
Retourne [status, lsb, msb].

## Parameters

### channel

`number`

### value14

`number`

## Returns

\[`number`, `number`, `number`\]
