[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [state/persistence](../README.md) / setupStatePersistence

# Function: setupStatePersistence()

> **setupStatePersistence**(`router`): `Promise`\<[`PersistenceHandles`](../type-aliases/PersistenceHandles.md)\>

Defined in: [state/persistence.ts:13](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/persistence.ts#L13)

Configure une persistance légère du state: journal append-only + snapshot périodique.

## Parameters

### router

[`Router`](../../../router/classes/Router.md)

## Returns

`Promise`\<[`PersistenceHandles`](../type-aliases/PersistenceHandles.md)\>
