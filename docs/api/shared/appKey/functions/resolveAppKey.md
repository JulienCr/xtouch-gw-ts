[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [shared/appKey](../README.md) / resolveAppKey

# Function: resolveAppKey()

> **resolveAppKey**(`toPort`, `fromPort`): `"voicemeeter"` \| `"qlc"` \| `"obs"` \| `"midi-bridge"`

Defined in: [shared/appKey.ts:6](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/shared/appKey.ts#L6)

Résolution de l'app key en fonction des noms de ports.

Règle commune: si le texte (to+from) contient "qlc", "voicemeeter"/"xtouch-gw", ou "obs".

## Parameters

### toPort

`string`

### fromPort

`string`

## Returns

`"voicemeeter"` \| `"qlc"` \| `"obs"` \| `"midi-bridge"`
