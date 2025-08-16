[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [drivers/consoleDriver](../README.md) / ConsoleDriver

# Class: ConsoleDriver

Defined in: [drivers/consoleDriver.ts:4](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/consoleDriver.ts#L4)

## Implements

- [`Driver`](../../../types/interfaces/Driver.md)

## Constructors

### Constructor

> **new ConsoleDriver**(): `ConsoleDriver`

#### Returns

`ConsoleDriver`

## Properties

### name

> `readonly` **name**: `"console"` = `"console"`

Defined in: [drivers/consoleDriver.ts:5](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/consoleDriver.ts#L5)

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`name`](../../../types/interfaces/Driver.md#name)

## Methods

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [drivers/consoleDriver.ts:7](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/consoleDriver.ts#L7)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`init`](../../../types/interfaces/Driver.md#init)

***

### execute()

> **execute**(`action`, `params`, `context?`): `Promise`\<`void`\>

Defined in: [drivers/consoleDriver.ts:11](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/consoleDriver.ts#L11)

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

### sendInitialFeedback()

> **sendInitialFeedback**(): `Promise`\<`void`\>

Defined in: [drivers/consoleDriver.ts:15](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/consoleDriver.ts#L15)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`sendInitialFeedback`](../../../types/interfaces/Driver.md#sendinitialfeedback)
