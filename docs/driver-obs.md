
# Spéc OBSDriver – contrôle X/Y/Scale via rotatifs 21–23

## Objectif

Piloter la position (x, y) et la taille d’un *scene item* OBS avec les trois derniers encodeurs (CC 21–23), même si l’item n’est pas visible à l’écran.

## Prérequis & API

* Connexion à obs-websocket v5 (port par défaut 4455). Client `obs-websocket-js` recommandé (support des batches).
* Requêtes utilisées :

  * `GetSceneItemId` → résolution `sceneItemId` à partir d’un `sceneName` + `sourceName`. 
  * `GetSceneItemTransform` (optionnel, pour init) → lire `positionX`, `positionY`, `scaleX`, `scaleY`. 
  * `SetSceneItemTransform` → écrire `positionX/Y`, `scaleX/Y` (ou `bounds*` si on veut contraindre la taille). 
* Notes :

  * Les coordonnées sont dans l’espace **base canvas** OBS (Settings → Video → Base (Canvas) Resolution).
  * On peut modifier un item dans **toute scène**, sans la rendre Preview/Program.


Parfait. Voici le **préambule “Connexion OBS WebSocket”** à intégrer à la spec de `OBSDriver`, basé sur ta config YAML.

# Connexion OBS WebSocket (v5+)

## Dépendance

* Lib cliente : `obs-websocket-js` (v5). Fournit `connect(url, password, { rpcVersion, eventSubscriptions })`, `call()`, `callBatch()`, et des événements (`Hello`, `Identified`, `ConnectionOpened/Closed`). ([GitHub][1])

## Paramétrage (config.yaml)

```yaml
obs:
  host: "127.0.0.1"
  port: 4455
  password: "aaaaaa"
```

* Construire l’URL : `ws://{host}:{port}`.
* Mot de passe requis si activé côté OBS (recommandé). Activer et régler dans **Tools → WebSocket Server Settings**. ([videosdk.live][2])

## Stratégie d’identification

* Appeler `connect("ws://host:port", password, { rpcVersion: 1, eventSubscriptions })`.
* `eventSubscriptions` par défaut : **tout sauf** flux volumineux ; ajouter `InputVolumeMeters` uniquement si nécessaire (non requis pour Transform). ([GitHub][1])
* Le handshake suit le schéma **Hello → Identify → Identified**. Si auth invalide, fermeture code `4005`. ([Gist][3])

## Cycle de vie `OBSDriver`

1. **init()**

   * Lire `obs.*` depuis `ConfigLoader`.
   * `connect(wsUrl, password, { rpcVersion: 1 })`.
   * Au succès (`Identified`) :

     * Résoudre/mettre en cache les `sceneItemId` nécessaires (`GetSceneItemId`) pour toutes les cibles déclarées par la page active.
     * (Optionnel) Lire l’état initial (`GetSceneItemTransform`) pour feedback.
     * Émettre `info` : version et RPC négociés. ([GitHub][1])
2. **Exécution**

   * Envoyer les requêtes avec `call()` ; grouper rafales courtes via `callBatch()` pour X/Y/Scale. ([GitHub][1])
3. **Reconnexion**

   * Sur `ConnectionClosed` : backoff exponentiel (e.g. 1s, 2s, 5s, 10s, max 30s) + retry automatique.
   * À la reconnexion : re-résoudre les `sceneItemId` et réémettre feedback initial (marquer `stale` pendant l’absence).
4. **Arrêt**

   * `disconnect()` propre si l’app se ferme.

## Santé & surveillance

* Journaliser les événements internes : `ConnectionOpened`, `Hello`, `Identified`, `ConnectionClosed`. ([GitHub][1])
* (Optionnel) **Keep-alive soft** : ping léger périodique via une requête non disruptive (ex. `GetVersion`) si tu veux détecter plus vite les coupures réseau ; sinon, s’appuyer sur les fermetures WS natives.

## Gestion des erreurs

* **Auth invalide** → log `error` clair + pas de retry tant que le password n’a pas changé. ([Gist][3])
* **Incompatibilité RPC** → passer `rpcVersion: 1` dans `connect` pour forcer la compatibilité (OBS 28+). ([GitHub][1])
* **Cible introuvable** (`GetSceneItemId` échoue) → marquer la cible `stale`, réessayer une fois, sinon `warn` et ignorer jusqu’au prochain hot-reload ou changement de page.

## Sécurité

* Toujours protéger le serveur WS par mot de passe (éviter contrôle à distance non autorisé). ([videosdk.live][2])
* Ne pas exposer le port 4455 publiquement ; si besoin, tunnel chiffré (ex. SSH) ou passerelle locale.

## Valeurs recommandées (par défaut)

* `rpcVersion`: **1**. ([GitHub][1])
* `eventSubscriptions`: **All** (sans `InputVolumeMeters`) – pas utile pour le transform, réduit le trafic. ([GitHub][1])
* Backoff reconnexion : `1s → 2s → 5s → 10s → 20s → 30s (cap)`.

---

[1]: https://github.com/obs-websocket-community-projects/obs-websocket-js "GitHub - obs-websocket-community-projects/obs-websocket-js: Consumes https://github.com/obsproject/obs-websocket"
[2]: https://www.videosdk.live/developer-hub/websocket/obs-websocket "How to Setup and Use OBS WebSocket?"
[3]: https://gist.github.com/tt2468/59390b99e7841b28f56dffb3dd622ec9 "obs-websocket API v5.0.0 - GitHub Gist"


## Mapping rotatifs 

* **CC21 → X** : incrémente/décrémente `positionX`
* **CC22 → Y** : incrémente/décrémente `positionY`
* **CC23 → Scale** : modifie `scaleX` et `scaleY` de manière uniforme (lock ratio).

  * *Option alternative* : `Scale` mappé sur `boundsWidth/Height` si on veut une taille en pixels plutôt qu’un facteur d’échelle.

### Granularité & accélération

* Pas de base : 2–5 px par tick (configurable).
* Accélération : multiplier par 4 si rotation rapide (détection delta-t < 50 ms).
* Bouton d’encodeur pressé (si dispo) :

  * CC21 press → snap `positionX` à une grille (ex. 10 px).
  * CC22 press → snap `positionY`.
  * CC23 press → reset scale à **1.0** (ou à un preset).

## Résolution et cache d’ID

* Au `init()` :

  1. Pour chaque entrée de config `target: { scene: string, source: string }`, appeler `GetSceneItemId` et **cacher** `sceneItemId`.
  2. Lire `GetSceneItemTransform` pour envoyer un **feedback initial** (afficher valeurs actuelles sur LCD si prévu). 
* Sur hot-reload : ré-résoudre les IDs modifiés, sinon conserver.

## Envoi & coalescing

* Coalescer les ticks d’encodeur sur une fenêtre **10–20 ms** pour éviter le flood.
* Utiliser `obs-websocket-js` **`callBatch()`** en mode *serial realtime* pour grouper X/Y/Scale si plusieurs valeurs changent quasi simultanément (un seul round-trip).
* Anti-boucle : tag `origin` côté Router comme d’habitude.

## Stratégie d’écriture

* Calculer localement la nouvelle transform à partir du **dernier état connu** (cache) pour éviter un `Get*` à chaque tick.
* Émettre `SetSceneItemTransform` avec uniquement les champs nécessaires, ex. :

  ```json
  {
    "requestType": "SetSceneItemTransform",
    "requestData": {
      "sceneName": "<scene>",
      "sceneItemId": <id>,
      "sceneItemTransform": {
        "positionX": <x>,
        "positionY": <y>,
        "scaleX": <s>,
        "scaleY": <s>
      }
    }
  }
  ```

  (structure conforme protocole v5).

## Particularités / bords

* **Items dupliqués** (même source plusieurs fois) : la config doit viser un **`sceneItemId`** précis (ou un `sourceName` + politique « premier trouvé »). 
* **Groups & Nested Scenes** : `sceneItemId` reste la clé ; si on vise un item dans un group, toujours référencé par l’ID retourné sur la scène parente.
* **Bounds vs Scale** : si l’overlay doit garder une taille « pixel » stable, préférer `boundsType = OBS_BOUNDS_SCALE_INNER` + `boundsWidth/Height`. Sinon, agir sur `scaleX/Y`. (les champs sont dans `sceneItemTransform` v5). 
* **Studio Mode** : aucune contrainte : on peut écrire sur n’importe quelle scène non visible (comportement voulu).

## Contrats d’interface (côté GW)

* **Config YAML** (extrait) :

  ```yaml
  pages:
    - name: "OBS Transform"
      controls:
        enc6: { app: "obs", action: "nudgeX", params: ["Scene A", "LowerThird"] }
        enc7: { app: "obs", action: "nudgeY", params: ["Scene A", "LowerThird"] }
        enc8: { app: "obs", action: "scaleUniform", params: ["Scene A", "LowerThird"] }
  ```
* **Actions OBSDriver** :

  * `resolveItem(scene, source) -> sceneItemId`
  * `nudgeX(id, delta)` / `nudgeY(id, delta)` / `scaleUniform(id, factorDelta)`
    - `scaleUniform` applique désormais un facteur multiplicatif relatif: `scale *= (1 + factorDelta)`
    - Si des `boundsWidth/Height` sont actifs sur l’item, le facteur est appliqué aux bounds (pixels) au lieu de `scaleX/Y`, avec repositionnement pour conserver le centre
  * `snapGrid(id, grid)` / `resetScale(id)`
  * `sendInitialFeedback()` → publie X/Y/Scale actuels (optionnel, pour LCD).

Exemple avec pas explicites (recommandé) :

```yaml
pages:
  - name: "OBS Transform"
    controls:
      enc6: { app: "obs", action: "nudgeX", params: ["Scene A", "LowerThird", 2] }
      enc7: { app: "obs", action: "nudgeY", params: ["Scene A", "LowerThird", 2] }
      enc8: { app: "obs", action: "scaleUniform", params: ["Scene A", "LowerThird", 0.02] }
```

## Tolérance aux erreurs

* Si `SetSceneItemTransform` renvoie erreur (item absent, scène renommée), marquer la cible **stale**, tenter `resolveItem()` une fois, sinon log `warn` et ignorer jusqu’au prochain hot-reload.
* Débits élevés : si OBS lag, réduire la fenêtre de coalescing ou le pas.

---

