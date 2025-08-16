[**xtouch-gw v0.1.0**](../../../README.md)

***

[xtouch-gw](../../../README.md) / [state/store](../README.md) / StateStore

# Class: StateStore

Defined in: [state/store.ts:8](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L8)

Stocke l'état MIDI-only par application et notifie les abonnés à chaque mise à jour.

## Constructors

### Constructor

> **new StateStore**(): `StateStore`

Defined in: [state/store.ts:12](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L12)

#### Returns

`StateStore`

## Methods

### updateFromFeedback()

> **updateFromFeedback**(`app`, `entry`): `void`

Defined in: [state/store.ts:25](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L25)

Enregistre un feedback d'application et publie aux abonnés.

#### Parameters

##### app

[`AppKey`](../../types/type-aliases/AppKey.md)

##### entry

[`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)

#### Returns

`void`

***

### getStateForApp()

> **getStateForApp**(`app`, `addr`): `null` \| [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)

Defined in: [state/store.ts:44](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L44)

Retourne une entrée exacte d'état si présente et connue (clé complète, incluant `portId`).

#### Parameters

##### app

[`AppKey`](../../types/type-aliases/AppKey.md)

##### addr

[`MidiAddr`](../../types/interfaces/MidiAddr.md)

#### Returns

`null` \| [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)

***

### listStatesForApp()

> **listStatesForApp**(`app`): [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)[]

Defined in: [state/store.ts:55](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L55)

Liste toutes les entrées d'état connues pour une application.

#### Parameters

##### app

[`AppKey`](../../types/type-aliases/AppKey.md)

#### Returns

[`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)[]

***

### listStatesForApps()

> **listStatesForApps**(`apps`): `Map`\<[`AppKey`](../../types/type-aliases/AppKey.md), [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)[]\>

Defined in: [state/store.ts:64](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L64)

Liste les entrées d'état pour plusieurs applications.

#### Parameters

##### apps

[`AppKey`](../../types/type-aliases/AppKey.md)[]

#### Returns

`Map`\<[`AppKey`](../../types/type-aliases/AppKey.md), [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)[]\>

***

### subscribe()

> **subscribe**(`listener`): () => `void`

Defined in: [state/store.ts:76](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L76)

Abonne un listener au flux d'entrées confirmées par application.

#### Parameters

##### listener

(`entry`, `app`) => `void`

#### Returns

Fonction pour se désabonner

> (): `void`

##### Returns

`void`

***

### getKnownLatestForApp()

> **getKnownLatestForApp**(`app`, `status`, `channel?`, `data1?`): `null` \| [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)

Defined in: [state/store.ts:84](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/state/store.ts#L84)

Retourne la dernière valeur connue pour (status, channel, data1) quel que soit le portId.

#### Parameters

##### app

[`AppKey`](../../types/type-aliases/AppKey.md)

##### status

[`MidiStatus`](../../types/type-aliases/MidiStatus.md)

##### channel?

`number`

##### data1?

`number`

#### Returns

`null` \| [`MidiStateEntry`](../../types/interfaces/MidiStateEntry.md)
