[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [types](../README.md) / Driver

# Interface: Driver

Defined in: [types.ts:12](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L12)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [types.ts:13](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L13)

## Methods

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [types.ts:14](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L14)

#### Returns

`Promise`\<`void`\>

***

### execute()

> **execute**(`action`, `params`, `context?`): `Promise`\<`void`\>

Defined in: [types.ts:15](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L15)

#### Parameters

##### action

`string`

##### params

`unknown`[]

##### context?

[`ExecutionContext`](ExecutionContext.md)

#### Returns

`Promise`\<`void`\>

***

### sendInitialFeedback()?

> `optional` **sendInitialFeedback**(): `Promise`\<`void`\>

Defined in: [types.ts:16](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L16)

#### Returns

`Promise`\<`void`\>

***

### onConfigChanged()?

> `optional` **onConfigChanged**(): `Promise`\<`void`\>

Defined in: [types.ts:17](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L17)

#### Returns

`Promise`\<`void`\>

***

### shutdown()?

> `optional` **shutdown**(): `Promise`\<`void`\>

Defined in: [types.ts:18](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/types.ts#L18)

#### Returns

`Promise`\<`void`\>
