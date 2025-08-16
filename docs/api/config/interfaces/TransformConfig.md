[**xtouch-gw v0.1.0**](../../README.md)

***

[xtouch-gw](../../README.md) / [config](../README.md) / TransformConfig

# Interface: TransformConfig

Defined in: [config.ts:73](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L73)

Transformations applicables aux messages MIDI sortants.

## Properties

### pb\_to\_note?

> `optional` **pb\_to\_note**: `object`

Defined in: [config.ts:78](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L78)

Convertit les messages Pitch Bend (14 bits) en Note On sur le même canal, avec vélocité mappée 0..127.
Utile pour QLC+ qui ne gère pas Pitch Bend.

#### note?

> `optional` **note**: `number`

Numéro de note à utiliser (0..127). Par défaut 0 si non fourni.

***

### pb\_to\_cc?

> `optional` **pb\_to\_cc**: `object`

Defined in: [config.ts:87](https://github.com/JulienCr/xtouch-gw/blob/4762a61efc98f67cb78942b4a0e2d9f4848bdf43/src/config.ts#L87)

Convertit les messages Pitch Bend (14 bits) en Control Change, avec valeur 0..127.
Permet de cibler un canal fixe et un contrôleur dépendant du canal source.

#### target\_channel?

> `optional` **target\_channel**: `number`

Canal cible (1..16). Défaut: 1

#### base\_cc?

> `optional` **base\_cc**: `string` \| `number`

CC de base: CC = base_cc + (channel_source - 1).
Exemple: base_cc=45 → ch1→46, ch2→47, ch3→48, ch4→49, etc.
Défaut: 45 pour coller à l'exemple utilisateur.

#### cc\_by\_channel?

> `optional` **cc\_by\_channel**: `Record`\<`number`, `string` \| `number`\>

Mapping explicite prioritaire si défini. Ex: { 1: 46, 2: 47, 4: 49 }
