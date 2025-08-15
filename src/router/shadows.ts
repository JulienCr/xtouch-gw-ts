import type { MidiStateEntry, MidiValue } from "../state";
import { addrKeyWithoutPort } from "../shared/addrKey";

/**
 * Gestion des ombres par application et clés d'adresses X‑Touch/App (sans port).
 */
export function makeAppShadows() {
  const appShadows = new Map<string, Map<string, { value: MidiValue; ts: number }>>();

  function getAppShadow(appKey: string): Map<string, { value: MidiValue; ts: number }> {
    let m = appShadows.get(appKey);
    if (!m) {
      m = new Map();
      appShadows.set(appKey, m);
    }
    return m;
  }

  function addrKeyForXTouch(addr: MidiStateEntry["addr"]): string {
    return addrKeyWithoutPort(addr as any);
  }

  function addrKeyForApp(addr: MidiStateEntry["addr"]): string {
    // Anti-echo/latence côté app: ignorer le portId pour associer l'aller (to_port) et le retour (from_port)
    return addrKeyWithoutPort(addr as any);
  }

  return { getAppShadow, addrKeyForXTouch, addrKeyForApp } as const;
}


