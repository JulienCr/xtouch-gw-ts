[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [drivers/qlc](../README.md) / QlcDriver

# Class: QlcDriver

Defined in: [drivers/qlc.ts:4](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/qlc.ts#L4)

## Implements

- [`Driver`](../../../types/interfaces/Driver.md)

## Constructors

### Constructor

> **new QlcDriver**(): `QlcDriver`

#### Returns

`QlcDriver`

## Properties

### name

> `readonly` **name**: `"qlc"` = `"qlc"`

Defined in: [drivers/qlc.ts:5](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/qlc.ts#L5)

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`name`](../../../types/interfaces/Driver.md#name)

## Methods

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [drivers/qlc.ts:7](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/qlc.ts#L7)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Driver`](../../../types/interfaces/Driver.md).[`init`](../../../types/interfaces/Driver.md#init)

***

### execute()

> **execute**(`action`, `params`, `context?`): `Promise`\<`void`\>

Defined in: [drivers/qlc.ts:11](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/drivers/qlc.ts#L11)

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
