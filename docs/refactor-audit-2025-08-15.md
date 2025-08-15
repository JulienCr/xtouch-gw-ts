# Audit de refactorisation – duplications, factorisations et code mort

Date: 2025-08-15
Dépôt: xtouch-gw-v2
Branche: master

Résumé exécutif
- Globalement, la base a déjà été bien factorisée (latence, listeners background, bridges de page). Il reste quelques duplications légères et opportunités de mutualisation utilitaire.
- Quelques points de code potentiellement mort/faiblement utilisé sont identifiés ci-dessous pour vérification.

1) Code dupliqué (ou très similaire)
- Clefs d’adressage MIDI sans portId
  - Fichiers: src/router.ts (addrKeyForXTouch, addrKeyForApp)
  - Détail: deux fonctions construisent "status|ch|d1" (avec ou sans port). src/state.ts expose déjà addrKey(addr) incluant portId.
  - Action proposée: créer src/shared/addrKey.ts avec:
    - addrKeyWithPort(addr) → actuel de state.ts (ou réexporter)
    - addrKeyWithoutPort(addr) → remplace addrKeyForXTouch/addrKeyForApp
    - Mise à jour des usages dans Router.

- Calculs PitchBend value14 et (lsb,msb)
  - Fichiers: src/state.ts (buildEntryFromRaw), src/router.ts (entryToRawForXTouch), src/drivers/midiBridge.ts (setpoint moteur calc value14)
  - Détail: la logique “value14 = (msb<<7)|(lsb)” et l’inverse apparaît 3x.
  - Action proposée: ajouter helpers dans src/midi/utils.ts:
    - pb14FromRaw(lsb:number, msb:number): number
    - rawFromPb14(channel:number, value14:number): [status, lsb, msb]
    - Remplacer les calculs inline pour DRY et lisibilité.

- Détection typeNibble/status (Note/CC/PB)
  - Fichiers: src/state.ts, src/router.ts, src/drivers/midiBridge.ts
  - Détail: extraction du type à partir du premier octet répétée.
  - Action proposée: exposer helpers dans src/midi/utils.ts:
    - getTypeNibble(status): 0x8/0x9/0xB/0xE
    - isNoteOn/off, isCC, isPB

2) Logiques dupliquées factorisables
- Anti-echo fenêtres par statut + comparaison valeurs + shadow
  - Contexte: Router gère xtouchShadow et appShadows; la logique de fenêtre (antiLoopWindowMsByStatus) est centrale.
  - Amélioration: exposer la fenêtre via getAntiLoopMs (déjà fait via router/latency.ts). Vérifier usages pour éviter durcissement de valeurs (ex: 60 par défaut) en plusieurs endroits.

- Listeners background retry/backoff
  - Contexte: déjà factorisé dans src/midi/backgroundListeners.ts — OK.
  - Suggestion: fournir une petite API pour limiter les logs de DEBUG par message (rate-limit) si besoin.

- Construction des bridges de page
  - Contexte: déjà factorisé avec src/bridges/pageBridges.ts — OK.

3) Code mort ou probablement non utilisé
- src/midi/transform.ts: vérifier si tous les chemins sont utilisés après suppression du reverse transform vers X‑Touch.
  - Si des fonctions de “reverse” subsistent, prévoir une purge.
- src/midi/sniffer.ts: utilisé par la CLI (learn/midi-ports/open/close) — à confirmer. Si non utilisé, retirer ou documenter son usage.
- config copy.yaml: semble être un doublon de config. À supprimer ou déplacer sous docs/ARCHIVES.

4) Petites incohérences et nettoyages
- Router.ensureLatencyMeters et attachLatencyExtensions
  - OK, plus de duplication de classe LatencyMeter (unifié dans src/router/latency.ts).
- Constantes “60 par défaut” pour anti-loop window
  - Présentes à plusieurs endroits comme fallback. Centraliser via getAntiLoopMs(status) et éviter les littéraux.
- Commentaires/fallbacks NoteOff
  - Router: commentaire et code pour ne plus renvoyer NoteOff — cohérent. Garder aligné avec les options d’écho local dans XTouchDriver.

5) Plan d’action proposé (ordonné) et avancement

Avancement réalisé (2025-08-15):
- Étape 1 (Utilities MIDI): FAIT
  - Ajout pb14FromRaw, rawFromPb14, getTypeNibble, isPB/isCC/isNoteOn/isNoteOff (src/midi/utils.ts)
  - Intégration dans state.ts (buildEntryFromRaw), router.ts (entryToRawForXTouch), drivers/midiBridge.ts (setpoint moteurs)
- Étape 2 (Clés d’adressage): PARTIELLEMENT FAIT
  - Création src/shared/addrKey.ts avec addrKeyWithoutPort (+ réexport addrKeyWithPort)
  - Router utilise maintenant addrKeyWithoutPort (remplace les implémentations internes)
- Étape 3 (Nettoyage): À FAIRE
  - Revue src/midi/transform.ts pour dead code reverse
  - Revue src/midi/sniffer.ts pour usage réel côté CLI; archiver si inutile
  - Supprimer/mouvoir “config copy.yaml” → docs/ARCHIVES/
- Étape 4 (Lint et tests manuels): À FAIRE
  - pnpm lint, vérifier compilation TS
  - Test manuel de paging, échos LED, faders, CLI latence

Reste à faire (détails):
- Remplacer les derniers calculs/constantes littérales (fall back anti-loop 60ms) par des appels à getAntiLoopMs si nécessaire
- Ajouter/compléter la JSDoc sur les méthodes publiques d’autres modules (drivers, utils de config) si besoin
- Optionnel: utilitaire de logging MIDI centralisé pour harmoniser les traces (human/hex)

6) Estimation d’effort
- Étapes 1–2: ~1–2h (modifs localisées, faible risque)
- Étape 3: ~30–60min (recherche usages + PRune)
- Étape 4: ~20–30min

Notes
- Les règles utilisateur: pnpm préféré; ne pas lancer le build/dev automatiquement — respecté. Ne pas commiter sans l'accord de l'utilisateur.

