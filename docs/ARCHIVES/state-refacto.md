Top, j’ai passé ton code au peigne fin. Voici ce qui **ne colle pas** avec ce qu’on a décidé, puis **quoi changer** (sans écrire de code ici, juste la spec de refactor que Cursor implémentera).

# Diagnostic (écarts vs spec)

1. **Pas de notion “known/unknown/stale/origin”**

   * Tu ne sais pas si une valeur vient d’un **feedback app** (source de vérité), si elle est **inconnue**, ou si elle est un **stale** rechargé depuis le disque.
   * Conséquence : impossible d’appliquer **Reset→Replay** proprement (reset uniquement si *unknown*).

2. **Valeurs par défaut injectées côté State**

   * `getDefaultStateEntry()` renvoie 0 pour PB/CC/Note. Ça **simule** un état qui n’existe pas encore côté app.
   * On avait décidé : **le State ne fabrique jamais** de valeurs. Les “OFF/0/HOLD” ne s’envoient **qu’au moment du reset de page**, pas dans le store.

3. **Anti-boucle mal positionné et incomplet**

   * `shouldIgnoreFeedback()` ignore des **feedbacks entrants** si égaux à `lastSentToXTouch`.
   * Or on veut **toujours stocker** le feedback app (c’est notre vérité), et **décider au Router** s’il faut le **re-forward** vers X-Touch.
   * Il manque en plus un cache **`lastSentToApp[app]`** (pour bloquer l’echo qu’on reçoit juste après avoir envoyé à l’app).

4. **Pas de timestamp côté “last sent”**

   * Tu stockes la **dernière valeur envoyée** à la X-Touch, mais **pas l’instant**.
   * La règle est : **ignorer** une re-émission si **identique** et **Δt < 50 ms**. Il faut donc `value + ts`.

5. **Adresse incomplète (portId absent)**

   * `MidiAddr` ne contient pas `portId`. Or on a **un port feedback par app** (et potentiellement plus d’un).
   * Le key doit inclure `portId` pour éviter collisions et faciliter le debug.

6. **Couche “transform” mélangée au State**

   * `entryToRawForXTouch()` dans `StateStore` mélange stockage et “comment on parle à la X-Touch”.
   * Les **transforms app→xtouch** et **xtouch→app** doivent vivre dans le **Router** (ou un `TransformRegistry`), pas dans le State.

7. **SysEx peu contextualisé**

   * Tu stockes le payload + hash (ok), mais l’`addr` SysEx n’embarque pas `portId` et tu ne marques pas **known/stale/origin**.
   * Pour le refresh LCD, on veut rejouer le **payload brut** dès qu’il est **known** (et *hold* sinon).

8. **DEFAULT\_STATES lourds et peu utiles**

   * Ils créent un faux sentiment d’état “complet”. On n’en a pas besoin pour la logique **reset** (c’est géré au Router).

9. **`status: 'unknown'` défini mais jamais utilisé**

   * Mort ou source d’ambiguïté.

# Refactor — Spec à implémenter (sans changer ton YAML)

## A) Types & clés

* `MidiAddr` \**= { portId: string; status: 'note'|'cc'|'pb'|'sysex'; channel?: number; data1?: number }` 
  *(Pour PB,`data1=0\` par convention.)*

* `MidiStateEntry` \*\*= { addr: MidiAddr; value: number|string|Uint8Array; ts: number; origin: 'app'|'xtouch'; known: boolean; stale?: boolean }\`

  * `known=true` uniquement si **feedback app** (ou data rechargée depuis journal + marquée `stale`).
  * `origin` = `'app'` pour feedback; `'xtouch'` pour traces internes si on veut journaller ce qu’on a envoyé (optionnel).

* `AddrKey` **= `${portId}|${status}|${channel??0}|${data1??0}`**
  *(String unique, stable, lisible.)*

## B) Comportements State (simples et stricts)

* `updateFromFeedback(app, entry)` :

  * **Toujours** écrire en RAM : `known=true`, `origin='app'`, `stale=false`.
  * Publier l’event (pour journal et SSE viewer).

* `getStateForApp(app, addr)` :

  * **Ne jamais générer de valeur par défaut**.
  * Retourne **l’entry connue** ou **null**.

* **Supprimer** `getDefaultStateEntry()` et **retirer** `DEFAULT_STATES`.
  → Les valeurs par défaut **ne vivent pas dans le State** ; elles sont **émises** par le **Router** pendant le **Reset**.

## C) Anti-boucle (déplacé + complété)

* Dans le **Router** (pas dans `StateStore`) :

  * `XTouchShadow: Map<AddrKey, { value: MidiValue; ts: number }>`

    * Sert à **ne pas réémettre** deux fois la même chose vers la X-Touch si **identique** et **Δt<50 ms**.
  * `AppShadow[app]: Map<AddrKey, { value; ts }>`

    * Sert à **ne pas réémettre** vers l’app quand on propage un geste X-Touch qui reviendrait immédiatement en echo.

* Règle :

  * **Toujours** accepter et stocker le **feedback app** (state RAM).
  * **Décider** d’émettre vers l’autre côté en regardant le **shadow** correspondant (valeur + fenêtre de 50 ms).
  * Le **StateStore** n’a plus de `shouldIgnoreFeedback()`.

## D) Reset→Replay (inchangé, mais dépend de `known`)

* Au **switch de page** :

  1. **RESET** ciblé (Notes→CC→LCD→PB) **uniquement pour les addr `unknown`** :

     * Notes → **OFF**, CC → **0**, LCD → **HOLD**, PB → **HOLD**.
  2. **REPLAY** des addr **`known`** via **`xform_in`** (app→xtouch) si différent du `XTouchShadow`.

* Les **transforms** (`pb↔cc`, `note`, `ring`, `sysex_passthrough`) résident dans le Router (ou `TransformRegistry`).

  * `StateStore` ne convertit rien.

## E) Persistance (intégration)

* Lors de `updateFromFeedback()` → publier un **JournalEntry** append-only.
* Au **boot** :

  * Charger `snapshot + journal`; hydrater RAM avec `known=true`, `stale=true`.
  * Tant que l’app n’a pas envoyé du frais, ces valeurs peuvent être **ignorées** par le **Reset** (politique `REPLAY_STALE=false`).

## F) API utiles (StateStore)

* `get(app, addrKey): MidiStateEntry | null`
* `list(app): Iterable<MidiStateEntry>`
* `subscribe(listener)` pour publier les updates (journal + SSE)
* **Pas** d’API qui génère des defaults.

## G) Nettoyage

* Retirer `unknown` du type `MidiStatus`.
* Retirer `entryToRawForXTouch()` du State (à déplacer dans Router).
* `buildEntryFromRaw()` :

  * Ajouter `portId` (donné par le driver appelant).
  * Remplir `origin='app'`, `known=true` (ou laisser le StateStore l’ajouter à l’update).

# Effets attendus

* **Reset fiable** (OFF/0/HOLD uniquement pour *unknown*), **sans polluer** le state.
* **Replay exact** dès qu’un feedback existe (et sans re-boucler).
* **Anti-boucle** robuste (Δt basé sur **nos envois** avec **timestamp**, et non sur le dernier feedback).
* **Clés stables** grâce à `portId`.
* **Viewer web** simple : il affiche **uniquement** des valeurs **connues** (et `stale` si issues du snapshot).

# CHECKLIST

1. [ ] **Types** : étendre `MidiAddr` (+`portId`) et `MidiStateEntry` (+`known`, `origin`, `stale?`).
2. [ ] **StateStore** :
   * [ ] supprimer `DEFAULT_STATES` + `getDefaultStateEntry()`.
   * [ ] getStateForApp()` → retour **known only** (ou `null`).
   * [ ] enlever `shouldIgnoreFeedback()` et déplacer la logique côté Router.
3. [ ] **Router** :
   * [ ] créer `XTouchShadow` et `AppShadow`.
   * [ ] appliquer la fenêtre **50 ms** avant ré-émission.
   * [ ] centraliser les **transforms** `in/out`.
   * [ ] implémenter **Reset→Replay** basé sur `known`.
4. [ ] **Drivers** : passer `portId` à `buildEntryFromRaw()`.
5. [ ] **Persistance** : journaliser à chaque `updateFromFeedback()`; marquer `stale` au boot.

