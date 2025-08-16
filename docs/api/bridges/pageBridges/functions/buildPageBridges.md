[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [bridges/pageBridges](../README.md) / buildPageBridges

# Function: buildPageBridges()

> **buildPageBridges**(`router`, `x`, `items`, `awaitInit`): `Promise`\<[`MidiBridgeDriver`](../../../drivers/midiBridge/classes/MidiBridgeDriver.md)[]\>

Defined in: [bridges/pageBridges.ts:11](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/bridges/pageBridges.ts#L11)

Construit et initialise les bridges MIDI pour une liste d'items de passthrough.

## Parameters

### router

[`Router`](../../../router/classes/Router.md)

### x

[`XTouchDriver`](../../../xtouch/driver/classes/XTouchDriver.md)

### items

`any`[]

### awaitInit

`boolean`

Si true, attend l'init; sinon, lance en tâche de fond.

## Returns

`Promise`\<[`MidiBridgeDriver`](../../../drivers/midiBridge/classes/MidiBridgeDriver.md)[]\>
