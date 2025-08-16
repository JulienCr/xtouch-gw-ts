[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [shared/addrKey](../README.md) / addrKeyWithoutPort

# Function: addrKeyWithoutPort()

> **addrKeyWithoutPort**(`addr`): `string`

Defined in: [shared/addrKey.ts:9](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/shared/addrKey.ts#L9)

Construit une clé d'adressage MIDI indépendante du port pour les usages internes
(anti-echo, latence, regroupements), de la forme "status|channel|data1".
Ne pas utiliser pour l'indexation du StateStore (qui nécessite le portId).

## Parameters

### addr

`Pick`\<[`MidiAddr`](../../../state/types/interfaces/MidiAddr.md), `"status"` \| `"channel"` \| `"data1"`\>

## Returns

`string`
