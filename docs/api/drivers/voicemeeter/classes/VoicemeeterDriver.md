[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [drivers/voicemeeter](../README.md) / VoicemeeterDriver

# Class: VoicemeeterDriver

Defined in: [drivers/voicemeeter.ts:14](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/voicemeeter.ts#L14)

## Implements

- [`Driver`](../../../types/interfaces/Driver.md)

## Constructors

### Constructor

> **new VoicemeeterDriver**(`xtouch`, `cfg`, `onFeedbackFromApp?`): `VoicemeeterDriver`

Defined in: [drivers/voicemeeter.ts:20](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/voicemeeter.ts#L20)

#### Parameters

##### xtouch

[`XTouchDriver`](../../../xtouch/driver/classes/XTouchDriver.md)

##### cfg

[`VoicemeeterBridgeConfig`](../interfaces/VoicemeeterBridgeConfig.md)

##### onFeedbackFromApp?

(`appKey`, `raw`, `portId`) => `void`

#### Returns

`VoicemeeterDriver`

## Properties

### name

> `readonly` **name**: `"voicemeeter"` = `"voicemeeter"`

Defined in: [drivers/voicemeeter.ts:15](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/voicemeeter.ts#L15)

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`name`](../../../types/interfaces/Driver.md#name)

## Methods

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [drivers/voicemeeter.ts:26](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/voicemeeter.ts#L26)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`init`](../../../types/interfaces/Driver.md#init)

***

### execute()

> **execute**(`action`, `params`, `context?`): `Promise`\<`void`\>

Defined in: [drivers/voicemeeter.ts:73](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/voicemeeter.ts#L73)

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

Defined in: [drivers/voicemeeter.ts:80](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/voicemeeter.ts#L80)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`shutdown`](../../../types/interfaces/Driver.md#shutdown)
