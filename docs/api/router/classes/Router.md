[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [router](../README.md) / Router

# Class: Router

Defined in: [router.ts:23](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L23)

Routeur principal orchestrant la navigation de pages, l'ingestion des feedbacks
applicatifs et la restitution vers le X‑Touch.

Invariants clés:
- La source de vérité des états applicatifs est alimentée uniquement par `onMidiFromApp()`
- Le refresh de page rejoue les états connus (Notes→CC→SysEx→PB) sans doublons (anti‑echo)
- La politique Last‑Write‑Wins protège les actions utilisateur locales récentes

## Constructors

### Constructor

> **new Router**(`initialConfig`): `Router`

Defined in: [router.ts:54](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L54)

Crée un `Router` avec une configuration d'app (pages, mapping, paging, etc.).

#### Parameters

##### initialConfig

[`AppConfig`](../../config/interfaces/AppConfig.md)

Configuration applicative initiale

#### Returns

`Router`

## Methods

### registerDriver()

> **registerDriver**(`key`, `driver`): `void`

Defined in: [router.ts:67](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L67)

Enregistre un driver applicatif, disponible pour `handleControl()`.

#### Parameters

##### key

`string`

Clé d'application (ex: "voicemeeter", "qlc", "obs")

##### driver

[`Driver`](../../types/interfaces/Driver.md)

Implémentation de driver

#### Returns

`void`

***

### getActivePage()

> **getActivePage**(): `undefined` \| [`PageConfig`](../../config/interfaces/PageConfig.md)

Defined in: [router.ts:72](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L72)

Retourne la configuration de la page active.

#### Returns

`undefined` \| [`PageConfig`](../../config/interfaces/PageConfig.md)

***

### getActivePageName()

> **getActivePageName**(): `string`

Defined in: [router.ts:77](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L77)

Retourne le nom de la page active, ou "(none)" si aucune page.

#### Returns

`string`

***

### listPages()

> **listPages**(): `string`[]

Defined in: [router.ts:82](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L82)

Liste les noms des pages disponibles.

#### Returns

`string`[]

***

### setActivePage()

> **setActivePage**(`nameOrIndex`): `boolean`

Defined in: [router.ts:90](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L90)

Définit la page active par index ou par nom et déclenche un refresh.

#### Parameters

##### nameOrIndex

`string` | `number`

#### Returns

`boolean`

true si le changement a été effectué

***

### nextPage()

> **nextPage**(): `void`

Defined in: [router.ts:111](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L111)

Passe à la page suivante (circulaire) et rafraîchit.

#### Returns

`void`

***

### prevPage()

> **prevPage**(): `void`

Defined in: [router.ts:119](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L119)

Passe à la page précédente (circulaire) et rafraîchit.

#### Returns

`void`

***

### handleControl()

> **handleControl**(`controlId`, `value?`): `Promise`\<`void`\>

Defined in: [router.ts:132](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L132)

Exécute l'action mappée pour un contrôle logique de la page courante.

#### Parameters

##### controlId

`string`

Identifiant de contrôle logique (clé du mapping)

##### value?

`unknown`

Valeur facultative associée

#### Returns

`Promise`\<`void`\>

***

### updateConfig()

> **updateConfig**(`next`): `Promise`\<`void`\>

Defined in: [router.ts:153](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L153)

Met à jour la configuration et notifie les drivers.

#### Parameters

##### next

[`AppConfig`](../../config/interfaces/AppConfig.md)

#### Returns

`Promise`\<`void`\>

***

### attachXTouch()

> **attachXTouch**(`xt`): `void`

Defined in: [router.ts:166](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L166)

Attache le driver X‑Touch au router et prépare l'émetteur.

#### Parameters

##### xt

[`XTouchDriver`](../../xtouch/driver/classes/XTouchDriver.md)

#### Returns

`void`

***

### onMidiFromApp()

> **onMidiFromApp**(`appKey`, `raw`, `portId`): `void`

Defined in: [router.ts:180](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L180)

Ingestion d'un feedback MIDI brut provenant d'une application (Voicemeeter/QLC/OBS...).
Met à jour le StateStore et, si pertinent pour la page active, rejoue vers X‑Touch.

#### Parameters

##### appKey

`string`

##### raw

`number`[]

##### portId

`string`

#### Returns

`void`

***

### markAppShadowForOutgoing()

> **markAppShadowForOutgoing**(`appKey`, `raw`, `portId`): `void`

Defined in: [router.ts:216](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L216)

Marque le dernier message émis vers une app (shadow) pour l'anti‑echo et la latence RTT.

#### Parameters

##### appKey

`string`

##### raw

`number`[]

##### portId

`string`

#### Returns

`void`

***

### markUserActionFromRaw()

> **markUserActionFromRaw**(`raw`): `void`

Defined in: [router.ts:227](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L227)

Marque une action locale (X‑Touch) à partir d'une trame brute, pour appliquer LWW.

#### Parameters

##### raw

`number`[]

#### Returns

`void`

***

### refreshPage()

> **refreshPage**(): `void`

Defined in: [router.ts:246](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/router.ts#L246)

Rafraîchit complètement la page active (replay des états connus vers X‑Touch).

#### Returns

`void`
