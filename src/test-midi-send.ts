import { logger } from "./logger";
import type { RawSender } from "./xtouch/api";
import { runMidiTest } from "./test-utils/runMidiTest";
import type { MidiTestOptions } from "./test-utils/runMidiTest";

// ============================
// Constantes d'édition rapide
// ============================
/** Chaîne à rechercher dans le nom du port sortie MIDI (null = utiliser config.yaml). */
const PORT_NAME_FRAGMENT_OVERRIDE: string | null = null;

/** Délai par défaut (ms) entre deux commandes si aucune commande Wait n'est fournie. */
const DEFAULT_DELAY_MS = 150;

/** Afficher les messages MIDI en hex dans les logs. */
const LOG_HEX = true;
type DeviceMode = "mcu" | "ctrl";
let CURRENT_DEVICE_MODE: DeviceMode = "mcu"; // sera surchargé via config.yaml dans runMidiTest

/** Durée du wave final sur les 9 faders (ms). Mettre 0 pour désactiver. */
const WAVE_DURATION_MS = 4000;
/** Images par seconde pour le wave. */
const WAVE_FPS = 60;
/**
 * Définition des 9 faders pour le wave.
 * - En MCU: canaux Pitch Bend 1..9
 * - En CTRL: CC par fader (par défaut 0..8 sur le canal 1)
 */
const WAVE_FADER_CHANNELS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const WAVE_CTRL_CHANNEL = 1;
const WAVE_CTRL_CC_NUMBERS: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Active le test LED + wave intégré en fin de séquence. */
const BUTTONS_TEST_ENABLED = true;
const BUTTONS_TEST_CHANNEL = 1;
const BUTTONS_TEST_FIRST_NOTE = 0;
const BUTTONS_TEST_LAST_NOTE = 101;
const BUTTONS_TEST_INTER_MSG_DELAY_MS = 2; // anti flood

/** Séquence custom (parser simple) */
const NOTE = 51;
const TEST_SEQUENCE: string[] = [
  // `NoteOff ch=1 note=${NOTE}`,
  // `NoteOn ch=1 note=${NOTE} velocity=64`, // clignotte (mode CTRL)
  // "Wait ms=3000",
  // `NoteOff ch=1 note=${NOTE}`,
] 

/**
 * Exécute la séquence de test en envoyant les messages MIDI.
 * Si un `sender` est fourni (ex: `XTouchDriver`), la pipeline de l'app est utilisée.
 * Sinon, ouverture temporaire d'un port Output brut.
 */
async function testMidiSend(sender?: RawSender, override?: Partial<MidiTestOptions>) {
  const envMode = (process.env.MIDI_TEST_MODE || "").toLowerCase();
  const allowed = new Set(["all","custom","buttons","faders","lcd"]);
  const withMode = allowed.has(envMode as any) ? { testMode: envMode as MidiTestOptions["testMode"] } : {};
  await runMidiTest(sender, {
    portNameFragmentOverride: PORT_NAME_FRAGMENT_OVERRIDE,
    defaultDelayMs: DEFAULT_DELAY_MS,
    logHex: LOG_HEX,
    deviceMode: CURRENT_DEVICE_MODE,
    waveDurationMs: WAVE_DURATION_MS,
    waveFps: WAVE_FPS,
    waveFaderChannels: WAVE_FADER_CHANNELS,
    waveCtrlChannel: WAVE_CTRL_CHANNEL,
    waveCtrlCcNumbers: WAVE_CTRL_CC_NUMBERS,
    buttonsTestEnabled: BUTTONS_TEST_ENABLED,
    buttonsChannel: BUTTONS_TEST_CHANNEL,
    buttonsFirstNote: BUTTONS_TEST_FIRST_NOTE,
    buttonsLastNote: BUTTONS_TEST_LAST_NOTE,
    buttonsInterMsgDelayMs: BUTTONS_TEST_INTER_MSG_DELAY_MS,
    customSequence: TEST_SEQUENCE,
    ...withMode,
    ...(override || {}),
  });
}

// Exécuter le test directement (script toujours appelé via pnpm/tsx)
// Standalone execution: utilise le mode Output brut si lancé via tsx directement
const invokedDirectly = (typeof require !== "undefined" && require.main === module) ||
  (typeof process !== "undefined" && typeof process.argv?.[1] === "string" && process.argv[1].toLowerCase().includes("test-midi-send"));
if (invokedDirectly) testMidiSend().catch((error) => {
  logger.error("Erreur fatale:", error);
  process.exit(1);
});

export { testMidiSend };
