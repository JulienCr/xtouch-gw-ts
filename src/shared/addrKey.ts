import type { MidiAddr } from "../state";
import { addrKey as addrKeyWithPort } from "../state";

/**
 * Construit une clé d'adressage MIDI indépendante du port pour les usages internes
 * (anti-echo, latence, regroupements), de la forme "status|channel|data1".
 * Ne pas utiliser pour l'indexation du StateStore (qui nécessite le portId).
 */
export function addrKeyWithoutPort(addr: Pick<MidiAddr, "status" | "channel" | "data1">): string {
  const s = addr.status;
  const ch = addr.channel ?? 0;
  const d1 = addr.data1 ?? 0;
  return `${s}|${ch}|${d1}`;
}

export { addrKeyWithPort };

