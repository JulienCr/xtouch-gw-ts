# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XTouch GW is a Node.js/TypeScript gateway that transforms a Behringer X-Touch MIDI control surface into a unified control interface for desktop applications (Voicemeeter, QLC+, OBS Studio). It provides bidirectional MIDI communication with motorized faders, LED feedback, page-based control mappings, hot-reloadable YAML configuration, and HID gamepad input support.

## Essential Commands

### Development
```bash
pnpm dev              # Watch mode development
pnpm build            # Compile TypeScript + copy YAML assets to dist/
pnpm start            # Run compiled dist/index.js
```

### Testing
```bash
pnpm test             # Run all tests with coverage
pnpm test:watch       # Watch mode
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests only
```

### Code Quality
```bash
pnpm check:types      # TypeScript type checking (no emit)
pnpm lint             # ESLint check
pnpm format:write     # Auto-fix Prettier formatting
pnpm deadcode         # Detect unused exports with Knip
```

### Process Management (Production)
```bash
pnpm pm2:start        # Start with PM2
pnpm pm2:restart      # Restart (use after config changes)
pnpm pm2:logs         # View logs
```

### Utilities
```bash
pnpm sniff:web        # Launch MIDI sniffer web interface
pnpm gamepad:calibrate # Calibrate HID gamepad controls
```

## Architecture Overview

### Core Components

**Router ([src/router.ts](src/router.ts))** - Central orchestrator that:
- Routes user input from X-Touch/gamepad to application drivers
- Manages page-based control mappings
- Forwards application feedback back to X-Touch with anti-echo logic
- Coordinates state synchronization across all components

**State Store ([src/state/](src/state/))** - Centralized MIDI state management:
- Maintains current MIDI values per application (keyed by app name)
- Persists snapshots to `.state/snapshot.json`
- Implements immutable state entries with timestamps
- Supports restoration after restart or page changes

**XTouch Driver ([src/xtouch/](src/xtouch/))** - Hardware abstraction layer:
- High-level API for faders, LCDs, LEDs, buttons
- Input mapping from physical controls to logical control IDs
- Fader positioning with smooth setpoint tracking
- Value overlay display on LCD strips
- CSV-based control matching (`docs/xtouch-matching.csv`)

**Application Drivers ([src/drivers/](src/drivers/))** - Uniform driver interface:
- `Driver` interface: `init()`, `execute()`, `sync()`, `onMidiFromApp()`
- OBS WebSocket driver with transform utilities
- QLC+ WebSocket driver
- MIDI bridge for direct passthrough
- Each driver emits feedback that flows back through the router

### Data Flow

```
User Input (X-Touch/Gamepad)
    ↓
InputMapper → Router.handleControl()
    ↓
[Action mode] → Driver.execute() → Application API
[MIDI mode] → MidiAppClient → MIDI port
    ↓
Application Feedback → Router.onMidiFromApp()
    ↓
StateStore.updateFromFeedback()
    ↓
forwardFromApp() → XTouchDriver (with anti-echo)
```

### Key Design Patterns

**Shadow State Pattern**: Router maintains "shadow" copies of last-sent MIDI values to prevent echoes and implement Last-Write-Wins conflict resolution.

**Anti-Echo System** ([src/router/antiEcho.ts](src/router/antiEcho.ts)): Time-windowed suppression (10-250ms by MIDI type) differentiates user actions from application feedback to prevent control loops.

**Page-Based Routing**: Multiple "pages" of control mappings can be hot-swapped via MIDI notes or CLI commands. Each page can have independent MIDI bridges or global passthrough.

**Optimistic Updates**: State updates immediately on send (before app confirms) to avoid desync during page changes.

## Configuration

**Main Config**: [config.yaml](config.yaml) - YAML configuration with hot-reload support
- `input` section: X-Touch MIDI port names
- `pages` section: Page definitions with control mappings
- `controls` section: Control mappings to actions or MIDI
- `apps` section: Application-specific settings (OBS, QLC+, etc.)
- `gamepad` section: HID device configuration

**State Persistence**: `.state/snapshot.json` - Auto-saved MIDI state snapshots

**CSV Mappings**: `docs/xtouch-matching.csv` - Physical control ID to MIDI message mappings

## Testing Strategy

- Tests colocated in `_tests/` subdirectories next to source
- Pattern: `**/_tests/**/*.test.ts`
- Coverage targets: 80% lines/functions/branches, 100% statements
- CLI, sniffer, and heavy runtime modules excluded from coverage

## Technical Constraints

- **Node.js**: ≥22.0.0 required
- **Module System**: CommonJS (not ESM) for native module compatibility
- **TypeScript**: Strict mode enabled with consistent-type-imports
- **MIDI Library**: `@julusian/midi` (RtMidi bindings) - no auto-discovery, ports must be explicitly configured
- **HID Library**: `node-hid` for gamepad input (Windows-focused)

## Important Implementation Details

### MIDI Value Conversions
Use utilities in [src/midi/convert.ts](src/midi/convert.ts):
- `to14bit()` / `from14bit()` - Combine/split MSB+LSB for fader precision
- `to7bit()` / `from7bit()` - Standard MIDI 0-127 range
- Always preserve LSB in state entries for fader controls

### Control Mapping Resolution
Controls can specify either:
1. **Action mode**: `action: "driverMethod"` - Calls driver method directly
2. **MIDI mode**: `midi: {type, channel, cc/note, value}` - Sends raw MIDI

MIDI mode supports:
- Direct values: `value: 127`
- Templates: `value: "{value}"` - Uses control's current value
- Offsets: `offset: 30` - Adjusts CC/note number by control index

### LCD Management
LCD has 8 strips (channels 1-8), each with:
- Top line (7 chars) - Set via `setLcdText(channel, text, line: "top")`
- Bottom line (7 chars) - Set via `setLcdText(channel, text, line: "bottom")`
- Background color - Set via `setLcdColor(channel, color)` (RGB or named)

Value overlay automatically displays fader values when enabled in config.

### State Synchronization
When switching pages or drivers reconnect:
1. Router calls `driver.sync(currentState)` for each driver
2. Driver examines state entries relevant to it
3. Driver applies state to application
4. No need to manually restore - framework handles it

### Anti-Echo Configuration
Timeouts in [src/router/antiEcho.ts](src/router/antiEcho.ts):
- Faders (PitchBend): 250ms window
- Encoders (CC): 100ms window
- Other controls: 10ms window
Adjust if experiencing phantom feedback or missed updates.

## CLI Usage

The application includes an interactive REPL (see [docs/CLI.md](docs/CLI.md)). Common commands:
- `page <name>` - Switch to page
- `state` - Dump current state
- `drivers` - List active drivers
- `reload` - Reload configuration
- `help` - Show all commands

CLI auto-detaches when running under PM2 to avoid blocking the process manager.

## Documentation

- [README.md](README.md) - Project overview and quick start (French)
- [docs/specifications.md](docs/specifications.md) - Detailed architecture with Mermaid diagrams
- [docs/flows.md](docs/flows.md) - Sequence diagrams for key operations
- [MEMORY.md](MEMORY.md) - Development journal with lessons learned
- TypeDoc: Run `pnpm docs:build` to generate API documentation

## Common Gotchas

1. **MIDI Port Names**: Must match exactly as shown by OS (including "MIDIIN2"/"MIDIOUT2" suffixes on Windows). Use sniffer to verify.

2. **Hot Reload Scope**: Configuration hot-reloads but doesn't restart drivers. Use `pnpm pm2:restart` after driver-level config changes.

3. **Fader Resolution**: X-Touch faders use 14-bit (MSB+LSB), not 7-bit. Always use `to14bit()`/`from14bit()` conversions.

4. **State Persistence**: State snapshots save on graceful shutdown. PM2 stop signals ensure clean saves.

5. **Page Bridges**: Per-page `midiBridge` entries create isolated MIDI passthrough. Set `globalMidiBridge: true` in config for shared bridge across pages.

6. **Control ID Format**: Use exact control IDs from `docs/xtouch-matching.csv` (e.g., `fader.1`, `encoder.1`, `vpot.1`). Case-sensitive.

7. **Driver Feedback**: Drivers must call `this.onMidiFromApp()` for feedback to reach X-Touch. Missing calls = no fader movement from app changes.

8. **TypeScript Imports**: Use `import type` for type-only imports (enforced by ESLint rule `consistent-type-imports`).
