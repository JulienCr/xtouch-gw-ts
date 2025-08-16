[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / watchConfig

# Function: watchConfig()

> **watchConfig**(`filePath`, `onChange`, `onError?`): () => `void`

Defined in: [config.ts:180](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L180)

Observe un fichier de configuration YAML et notifie en cas de modification.

## Parameters

### filePath

`string`

Chemin du fichier à surveiller

### onChange

(`cfg`) => `void`

Callback appelée avec la nouvelle configuration

### onError?

(`err`) => `void`

Callback d'erreur facultative

## Returns

Fonction pour arrêter l'observation

> (): `void`

### Returns

`void`
