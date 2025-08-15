import { getTypeNibble, pb14FromRaw } from "../midi/utils";
import type { AppKey, MidiAddr, MidiStateEntry, MidiStatus } from "./types";
import { addrKey, computeHash } from "./types";

/**
 * Stocke l'état MIDI-only par application et notifie les abonnés à chaque mise à jour.
 */
export class StateStore {
  private readonly appStates: Map<AppKey, Map<string, MidiStateEntry>> = new Map();
  private readonly subscribers: Set<(entry: MidiStateEntry, app: AppKey) => void> = new Set();

  constructor() {
    this.initializeAppStates();
  }

  private initializeAppStates(): void {
    for (const app of ["voicemeeter", "qlc", "obs", "midi-bridge"] as AppKey[]) {
      this.appStates.set(app, new Map());
    }
  }

  /**
   * Enregistre un feedback d'application et publie aux abonnés.
   */
  updateFromFeedback(app: AppKey, entry: MidiStateEntry): void {
    const appState = this.appStates.get(app);
    if (!appState) throw new Error(`Application '${app}' non reconnue`);
    const k = addrKey(entry.addr);
    const stored: MidiStateEntry = {
      ...entry,
      origin: "app",
      known: true,
      stale: false,
    };
    appState.set(k, stored);
    for (const fn of this.subscribers) {
      try { fn(stored, app); } catch {}
    }
  }

  getStateForApp(app: AppKey, addr: MidiAddr): MidiStateEntry | null {
    const appState = this.appStates.get(app);
    if (!appState) return null;
    const k = addrKey(addr);
    const entry = appState.get(k);
    return entry && entry.known ? entry : null;
  }

  listStatesForApp(app: AppKey): MidiStateEntry[] {
    const appState = this.appStates.get(app);
    if (!appState) return [];
    return Array.from(appState.values());
  }

  listStatesForApps(apps: AppKey[]): Map<AppKey, MidiStateEntry[]> {
    const result = new Map<AppKey, MidiStateEntry[]>();
    for (const app of apps) {
      result.set(app, this.listStatesForApp(app));
    }
    return result;
  }

  subscribe(listener: (entry: MidiStateEntry, app: AppKey) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  /**
   * Retourne la dernière valeur connue pour (status, channel, data1) quel que soit le portId.
   */
  getKnownLatestForApp(
    app: AppKey,
    status: MidiStatus,
    channel?: number,
    data1?: number
  ): MidiStateEntry | null {
    const appState = this.appStates.get(app);
    if (!appState) return null;
    let best: MidiStateEntry | null = null;
    for (const entry of appState.values()) {
      const a = entry.addr;
      if (a.status !== status) continue;
      if (channel !== undefined && (a.channel ?? 0) !== channel) continue;
      if (data1 !== undefined && (a.data1 ?? 0) !== data1) continue;
      if (!entry.known) continue;
      if (!best || entry.ts > best.ts) best = entry;
    }
    return best;
  }
}


