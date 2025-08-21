## Schémas de flux (Mermaid)

Ces schémas résument les flux principaux de l’application. Ils sont dérivés du code actuel (`src/app.ts`, `src/app/bootstrap.ts`, `src/app/navigation.ts`, `src/router.ts`, `src/router/page.ts`, `src/drivers/*`, `src/services/controlMidiSender.ts`).

### Démarrage de l'application

```mermaid
flowchart TD
  A["Process start"] --> B["setLogLevel from env"]
  B --> C["findConfigPath then loadConfig"]
  C --> D["Router(cfg) + expose __router__"]
  D --> E["setupStatePersistence(router)"]
  E --> F["initDrivers: Console, QLC, OBS"]
  F --> G["initControlMidiSender(cfg)"]
  G --> H{"cfg.pages exists?"}
  H -- yes --> I["router.setActivePage(0)"]
  H -- no --> I2["no page"]
  I --> J["startXTouchAndNavigation(router, cfg)"]
  I2 --> J

  subgraph startXTouchAndNavigation
    J1["Create XTouchDriver + start"] --> J2["xtapi.resetAll"]
    J2 --> J3["router.attachXTouch"]
    J3 --> J4["apply LCD + LEDs F1..F8/Prev-Next"]
    J4 --> J5["attachNavigation(onAfterPageChange)"]
  end

  J --> K["attachInputMapper"]
  K --> L["attachIndicators + refreshIndicators"]
  L --> M{"Page passthroughs?"}
  M -- no --> N["Enable global Voicemeeter bridge"]
  M -- yes --> O["Build MidiBridge(s) for page"]
  N --> P["Rebuild background listeners"]
  O --> P
  P --> Q["router.refreshPage()"]
  Q --> R["attach CLI + signals"]
  R --> S["return cleanup()"]

  C -. Hot reload .-> C2["watchConfig"]
  C2 --> C3["router.updateConfig + reconfigure controlMidiSender"]
  C3 --> C4["Reapply LCD/LEDs/InputMapper/Indicators"]
  C4 --> P
```

### Changement de page

```mermaid
flowchart TD
  A["X-Touch NoteOn (Prev/Next or F1..F8) on paging channel"] --> B["attachNavigation"]
  B --> C{"Prev/Next or F-key?"}
  C -->|Prev| D["router.prevPage()"]
  C -->|Next| E["router.nextPage()"]
  C -->|F1..F8| F["router.setActivePage(index)"]
  D --> G["Router: activePageIndex updated"]
  E --> G
  F --> G
  G --> H["router.refreshPage()"]
  B --> I["updatePrevNextLeds"]
  I --> J["onAfterPageChange"]

  subgraph onAfterPageChange_bootstrap_ts
    J1["updateFKeyLedsForActivePage"]
    J2["applyLcdForActivePage"]
    J3["rebuild background listeners"]
    J4["controlMidiSender.reconcileForPage(page)"]
    J5{"passthrough(s)?"}
    J1 --> J2 --> J3 --> J4 --> J5
    J5 -- yes --> J6["shutdown old bridges + build new ones"]
    J5 -- no --> J7["shutdown old bridges"]
    J6 --> J8["router.refreshPage()"]
    J7 --> J8
    J8 --> J9["refreshIndicators()"]
  end
```

### Flux OBS (actions + indicateurs)

```mermaid
flowchart TD
  subgraph Actions_Router_to_ObsDriver
    A1["X-Touch input"] --> A2["inputMapper to router.handleControl"]
    A2 -->|mapping.action obs.*| A3["getDriver('obs').execute(action, params, ctx)"]
    A3 -->|setScene/changeScene| A4["obs.call(SetCurrentProgramScene or SetCurrentPreviewScene)"]
    A3 -->|toggleStudioMode| A5["obs.call(Get/SetStudioModeEnabled)"]
    A3 -->|nudgeX/nudgeY/scaleUniform| A6["resolveItemId then readCurrent then buildTransformUpdate then obs.call(SetSceneItemTransform)"]
  end

  subgraph Indicators_from_ObsDriver
    B1["attachIndicators: subscribeIndicators"] --> B2["refreshIndicatorSignals: studioMode, program, preview"]
    B2 --> B3["emit obs.selectedScene"]
    B3 --> B4["attachIndicators: update LEDs from mapping .indicator"]
    B5["OBS WS events: CurrentProgramSceneChanged / CurrentPreviewSceneChanged / StudioModeStateChanged"]
    B5 --> B2
  end
```

### Flux QLC+ (passthrough et envoi direct MIDI)

```mermaid
flowchart TD
  subgraph Passthrough_par_page_MidiBridgeDriver
    P1["X-Touch to MIDI data"] --> P2["filter.match"]
    P2 --> P3["applyTransform (pb_to_cc / pb_to_note)"]
    P3 --> P4["send to QLC OUT port"]
    P4 --> P5["scheduleFaderSetpoint if PB"]
    P4 --> P6["markAppOutgoingAndForward (shadow + forward)"]
    P7["QLC IN port feedback"] --> P8["router.onMidiFromApp('qlc', raw)"]
    P8 --> P9["forwardFromApp then transformAppToXTouch (CC to PB mapping)"]
    P9 --> P10["Emit to X-Touch if relevant"]
  end

  subgraph Direct_controls_midi
    D1["router.handleControl (mapping.midi app=qlc)"] --> D2["sendControlMidi"]
    D2 --> D3["MidiAppClient.send to QLC OUT port"]
    D3 --> D4["scheduleFaderSetpoint (PB source)"]
    D3 --> D5["shadow/forward via Router"]
    D6["QLC feedback"] --> P8
  end
```


