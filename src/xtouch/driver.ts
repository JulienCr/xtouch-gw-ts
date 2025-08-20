import { Input, Output } from "@julusian/midi";
import { logger } from "../logger";
import { decodeMidi, PitchBendEvent } from "../midi/decoder";
import { findPortIndexByNameFragment } from "../midi/ports";
import * as xtapi from "./api";
// LCD/7-seg helpers déportés dans xtouch/api

/**
 * Ports MIDI à utiliser pour se connecter à la X‑Touch.
 * Les noms sont des fragments (sous-chaînes) utilisés pour retrouver l'index du port.
 */
export interface XTouchPortsConfig {
  /** Sous-chaîne à rechercher dans la liste des entrées MIDI */
  inputName: string;
  /** Sous-chaîne à rechercher dans la liste des sorties MIDI */
  outputName: string;
}

/**
 * Options de comportement du driver X‑Touch.
 */
export interface XTouchOptions {
  /** Écho local des Pitch Bend pour stabiliser les faders en l'absence de feedback externe (défaut: true) */
  echoPitchBend?: boolean;
  /** Écho local des Notes/CC pour un retour LED/anneaux immédiat (défaut: true) */
  echoButtonsAndEncoders?: boolean;
}

/**
 * Callback appelé à chaque message MIDI entrant de la X‑Touch.
 * @param deltaSeconds Temps en secondes depuis le message précédent
 * @param data Trame MIDI brute (3 octets typiquement, plus pour SysEx)
 */
export type MessageHandler = (deltaSeconds: number, data: number[]) => void;


// ascii7/text helpers déplacés dans xtouch/api

/**
 * Driver bas niveau pour dialoguer avec la Behringer X‑Touch (MIDI in/out, LCD, afficheur 7‑segments).
 */
export class XTouchDriver {
  private input: Input | null = null;
  private output: Output | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private readonly options: Required<XTouchOptions>;
  private suppressPitchBendUntilMs = 0;
  private connectedInputName: string | null = null;
  private connectedOutputName: string | null = null;

  constructor(private readonly ports: XTouchPortsConfig, options?: XTouchOptions) {
    this.options = {
      echoPitchBend: options?.echoPitchBend ?? true,
      echoButtonsAndEncoders: options?.echoButtonsAndEncoders ?? true,
    };
  }

  /**
   * Ouvre les ports MIDI et démarre l'écoute des messages entrants.
   * @throws Erreur si l'un des ports configurés est introuvable
   */
  start(): void {
    // Ouvrir Output d'abord pour pouvoir envoyer du feedback immédiatement
    const out = new Output();
    const outIdx = findPortIndexByNameFragment(out, this.ports.outputName);
    if (outIdx == null) {
      out.closePort?.();
      throw new Error(
        `Port MIDI sortie introuvable pour '${this.ports.outputName}'. Vérifiez config.yaml > midi.output_port.`
      );
    }
    out.openPort(outIdx);
    this.output = out;
    this.connectedOutputName = out.getPortName(outIdx);
    logger.info(`X-Touch OUTPUT connecté sur '${this.connectedOutputName}' (#${outIdx}).`);

    // Ouvrir Input et écouter
    const inp = new Input();
    const inIdx = findPortIndexByNameFragment(inp, this.ports.inputName);
    if (inIdx == null) {
      inp.closePort?.();
      this.output.closePort();
      this.output = null;
      throw new Error(
        `Port MIDI entrée introuvable pour '${this.ports.inputName}'. Vérifiez config.yaml > midi.input_port.`
      );
    }
    inp.ignoreTypes(false, false, false);
    inp.on("message", (deltaSeconds: number, data: number[]) => {
      this.handleIncomingMessage(deltaSeconds, data);
    });
    inp.openPort(inIdx);
    this.input = inp;
    this.connectedInputName = inp.getPortName(inIdx);
    logger.info(`X-Touch INPUT connecté sur '${this.connectedInputName}' (#${inIdx}).`);
  }

  /**
   * Ignore les PitchBend entrants pendant `ms` millisecondes (anti-boucle moteurs → QLC).
   */
  /** Ignore temporairement les Pitch Bend entrants (anti‑boucle moteurs → QLC).
   * @param ms Durée d'ignorance en millisecondes
   */
  squelchPitchBend(ms: number): void {
    this.suppressPitchBendUntilMs = Math.max(this.suppressPitchBendUntilMs, Date.now() + Math.max(0, ms));
  }

  /** Indique si les Pitch Bend entrants sont actuellement ignorés. */
  isPitchBendSquelched(): boolean {
    return Date.now() < this.suppressPitchBendUntilMs;
  }

  /**
   * S'abonne aux messages MIDI entrants de la X‑Touch.
   * @param handler Callback recevant le delta temps et les octets MIDI
   * @returns Une fonction de désinscription
   */
  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Envoie une trame MIDI brute vers la X‑Touch. */
  sendRawMessage(bytes: number[]): void {
    if (!this.output) return;
    this.output.sendMessage(bytes);
  }

  sendNoteOn(channel: number, note: number, velocity: number): void {
    if (!this.output) return;
    xtapi.sendNoteOn(this, channel, note, velocity);
  }

  /**
   * Envoie un Control Change (0..127) sur un canal donné.
   * @param channel Canal MIDI 1..16
   * @param controller Numéro de CC 0..127
   * @param value Valeur 0..127
   */
  sendControlChange(channel: number, controller: number, value: number): void {
    if (!this.output) return;
    xtapi.sendControlChange(this, channel, controller, value);
  }

  /**
   * Envoie un Pitch Bend 14 bits (0..16383) sur un canal.
   * Alias générique de {@link setFader14}.
   */
  sendPitchBend14(channel1to16: number, value14: number): void {
    this.setFader14(channel1to16, value14);
  }

  /**
   * Envoie un Pitch Bend (alias convivial) – redirige vers sendPitchBend14.
   * @param channel Canal MIDI 1..16
   * @param value14 Valeur 14 bits 0..16383
   */
  sendPitchBend(channel: number, value14: number): void { this.sendPitchBend14(channel, value14); }

  /**
   * Envoie un Note Off (équivalent à Note On vélocité 0 selon les firmwares).
   * @param channel Canal MIDI 1..16
   * @param note Note 0..127
   */
  sendNoteOff(channel: number, note: number): void {
    this.sendNoteOn(channel, note, 0);
  }

  /**
   * Allume une plage de notes à la vélocité donnée (par défaut 127).
   */
  async setButtonsOnRange(
    channel = 1,
    firstNote = 0,
    lastNote = 101,
    velocity = 127,
    interMessageDelayMs = 2,
  ): Promise<void> {
    await this.setAllButtonsVelocity(channel, firstNote, lastNote, velocity, interMessageDelayMs);
  }

  /**
   * Éteint une plage de notes (vel=0).
   */
  async setButtonsOffRange(
    channel = 1,
    firstNote = 0,
    lastNote = 101,
    interMessageDelayMs = 2,
  ): Promise<void> {
    await this.setAllButtonsVelocity(channel, firstNote, lastNote, 0, interMessageDelayMs);
  }

  /**
   * Règle toutes les notes d'un intervalle à une même vélocité (par défaut 0 = OFF).
   * @param channel Canal MIDI 1..16 (défaut 1)
   * @param firstNote Première note (défaut 0)
   * @param lastNote Dernière note incluse (défaut 101)
   * @param velocity Vélocité 0..127 (défaut 0)
   * @param interMessageDelayMs Délai entre messages, pour éviter le flood (défaut 2ms)
   */
  async setAllButtonsVelocity(channel = 1, firstNote = 0, lastNote = 101, velocity = 0, interMessageDelayMs = 2): Promise<void> {
    if (!this.output) return;
    await xtapi.setAllButtonsVelocity(this, channel, firstNote, lastNote, velocity, interMessageDelayMs);
  }

  /**
   * Met à zéro plusieurs faders (Pitch Bend = 0) pour les canaux donnés (défaut 1..9).
   */
  async resetFadersToZero(channels: number[] = [1,2,3,4,5,6,7,8,9]): Promise<void> {
    if (!this.output) return;
    await xtapi.resetFadersToZero(this, channels);
  }

  /**
   * Réinitialise l'état de la surface: éteint tous les boutons et remet les faders à 0.
   * @param options Paramètres du reset (canal/notes/faders)
   */
  async resetAll(options?: { buttonsChannel?: number; firstNote?: number; lastNote?: number; interMessageDelayMs?: number; faderChannels?: number[]; }): Promise<void> {
    if (!this.output) return;
    await xtapi.resetAll(this, options);
  }

  /**
   * Positionne un fader via un Pitch Bend 14 bits.
   * @param channel1to16 Canal MIDI (1..16)
   * @param value14 Valeur 14 bits (0..16383)
   */
  setFader14(channel1to16: number, value14: number): void {
    if (!this.output) return;
    const ch = Math.max(1, Math.min(16, channel1to16));
    const v = Math.max(0, Math.min(16383, Math.floor(value14)));
    // Pitch Bend: status E0 + channel-1, LSB, MSB
    const status = 0xE0 + (ch - 1);
    const lsb = v & 0x7F;
    const msb = (v >> 7) & 0x7F;
    this.output.sendMessage([status, lsb, msb]);
  }

  /** Écrit du texte sur un strip LCD (ligne haute/basse). */
  sendLcdStripText(stripIndex0to7: number, upper: string, lower = ""): void {
    if (!this.output) return;
    xtapi.sendLcdStripText(this, stripIndex0to7, upper, lower);
  }

  /** Définis les couleurs des 8 LCD (firmware >= 1.22). */
  setLcdColors(colors: number[]): void {
    if (!this.output) return;
    xtapi.setLcdColors(this, colors);
  }

  /** Met à jour le grand afficheur 7-segments (timecode). */
  setSevenSegmentText(text: string, options?: { deviceId?: number; dots1?: number; dots2?: number }): void {
    if (!this.output) return;
    xtapi.setSevenSegmentText(this, text, options);
  }

  /** Ferme proprement les ports MIDI et vide les abonnements. */
  stop(): void {
    try {
      this.input?.closePort();
    } catch {}
    try {
      this.output?.closePort();
    } catch {}
    this.input = null;
    this.output = null;
    this.connectedInputName = null;
    this.connectedOutputName = null;
    this.handlers.clear();
    logger.info("X-Touch: ports MIDI fermés.");
  }

  /** Traite un message MIDI entrant (échos locaux + callbacks). */
  private handleIncomingMessage(deltaSeconds: number, data: number[]): void {
    // Notifier callbacks (bridge, sniffer, etc.)
    const now = Date.now();
    const status = data[0] ?? 0;
    const typeNibble = (status & 0xf0) >> 4;
    const isPitchBend = typeNibble === 0xE;

    if (!(isPitchBend && now < this.suppressPitchBendUntilMs)) {
      for (const h of this.handlers) {
        try { h(deltaSeconds, data); } catch (err) { logger.warn("X-Touch handler error:", err as any); }
      }
    }

    // Écho PitchBend local si activé
    if (this.options.echoPitchBend) {
      const decoded = decodeMidi(data);
      if (decoded.type === "pitchBend") {
        const pb = decoded as PitchBendEvent;
        if (pb.channel) this.setFader14(pb.channel, pb.value14);
      }
    }

    // Écho Note/CC local
    if (this.options.echoButtonsAndEncoders) {
      const status2 = data[0] ?? 0;
      const typeNibble2 = (status2 & 0xf0) >> 4;
      if (typeNibble2 === 0xB) {
        try { this.output?.sendMessage(data); } catch {}
      } else if (typeNibble2 === 0x9 || typeNibble2 === 0x8) {
        const vel = data[2] ?? 0;
        const isPress = typeNibble2 === 0x9 && vel > 0;
        if (isPress) { try { this.output?.sendMessage(data); } catch {} }
      }
    }
  }

  /**
   * Retourne les noms des ports MIDI actuellement connectés.
   * Utile pour les en‑têtes contextuels de la CLI.
   */
  getConnectedPortNames(): { input: string | null; output: string | null } {
    return { input: this.connectedInputName, output: this.connectedOutputName };
  }
}


