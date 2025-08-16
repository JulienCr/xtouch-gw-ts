[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [drivers/midiBridge](../README.md) / MidiBridgeDriver

# Class: MidiBridgeDriver

Defined in: [drivers/midiBridge.ts:15](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/midiBridge.ts#L15)

## Implements

- [`Driver`](../../../types/interfaces/Driver.md)

## Constructors

### Constructor

> **new MidiBridgeDriver**(`xtouch`, `toPort`, `fromPort`, `filter?`, `transform?`, `optional?`, `onFeedbackFromApp?`): `MidiBridgeDriver`

Defined in: [drivers/midiBridge.ts:24](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/midiBridge.ts#L24)

#### Parameters

##### xtouch

[`XTouchDriver`](../../../xtouch/driver/classes/XTouchDriver.md)

##### toPort

`string`

##### fromPort

`string`

##### filter?

[`MidiFilterConfig`](../../../config/interfaces/MidiFilterConfig.md)

##### transform?

[`TransformConfig`](../../../config/interfaces/TransformConfig.md)

##### optional?

`boolean` = `true`

##### onFeedbackFromApp?

(`appKey`, `raw`, `portId`) => `void`

#### Returns

`MidiBridgeDriver`

## Properties

### name

> `readonly` **name**: `"midi-bridge"` = `"midi-bridge"`

Defined in: [drivers/midiBridge.ts:16](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/midiBridge.ts#L16)

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`name`](../../../types/interfaces/Driver.md#name)

## Methods

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [drivers/midiBridge.ts:34](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/midiBridge.ts#L34)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`init`](../../../types/interfaces/Driver.md#init)

***

### execute()

> **execute**(`action`, `params`, `context?`): `Promise`\<`void`\>

Defined in: [drivers/midiBridge.ts:143](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/midiBridge.ts#L143)

#### Parameters

##### action

`string`

##### params

`unknown`[]

##### context?

[`ExecutionContext`](../../../types/interfaces/ExecutionContext.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`execute`](../../../types/interfaces/Driver.md#execute)

***

### shutdown()

> **shutdown**(): `Promise`\<`void`\>

Defined in: [drivers/midiBridge.ts:147](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/midiBridge.ts#L147)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`shutdown`](../../../types/interfaces/Driver.md#shutdown)
