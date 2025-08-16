[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [xtouch/driver](../README.md) / MessageHandler

# Type Alias: MessageHandler()

> **MessageHandler** = (`deltaSeconds`, `data`) => `void`

Defined in: [xtouch/driver.ts:32](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/xtouch/driver.ts#L32)

Callback appelé à chaque message MIDI entrant de la X‑Touch.

## Parameters

### deltaSeconds

`number`

Temps en secondes depuis le message précédent

### data

`number`[]

Trame MIDI brute (3 octets typiquement, plus pour SysEx)

## Returns

`void`
