[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [app](../README.md) / startApp

# Function: startApp()

> **startApp**(): `Promise`\<() => `void`\>

Defined in: [app.ts:24](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/app.ts#L24)

Point d'entrée de l'application.
- Charge la configuration, instancie le `Router`
- Initialise la persistance du `StateStore`
- Enregistre les drivers et démarre le X‑Touch + navigation
- Active le hot‑reload de la configuration

## Returns

`Promise`\<() => `void`\>

Fonction de nettoyage (arrêt propre des composants)
