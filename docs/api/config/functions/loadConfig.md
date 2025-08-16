[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / loadConfig

# Function: loadConfig()

> **loadConfig**(`filePath?`): `Promise`\<[`AppConfig`](../interfaces/AppConfig.md)\>

Defined in: [config.ts:164](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L164)

Charge et parse le fichier YAML de configuration.

## Parameters

### filePath?

`string`

Chemin explicite; sinon, recherche via [findConfigPath](findConfigPath.md)

## Returns

`Promise`\<[`AppConfig`](../interfaces/AppConfig.md)\>

## Throws

Erreur si aucun fichier n'est trouvé
