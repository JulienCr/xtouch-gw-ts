import type { PageConfig } from "../config";
import type { StateStore, MidiStateEntry, MidiStatus, AppKey } from "../state";
import { getAppsForPage, getChannelsForApp, resolvePbToCcMappingForApp, transformAppToXTouch } from "./page";

/**
 * Construit la liste ordonnée d'entrées à émettre vers X‑Touch pour refléter l'état de la page.
 *
 * Règles de priorité (inchangées):
 * - PB: PB connu = 3 > CC mappé = 2 > ZERO = 1
 * - Notes/CC: valeur connue = 2 > reset OFF/0 = 1
 */
export function planRefresh(page: PageConfig, state: StateStore): MidiStateEntry[] {
  type PlanEntry = { entry: MidiStateEntry; priority: number };
  const notePlan = new Map<string, PlanEntry>(); // key: note|ch|d1
  const ccPlan = new Map<string, PlanEntry>();   // key: cc|ch|d1
  const pbPlan = new Map<number, PlanEntry>();   // key: fader channel (1..9)

  const pushNoteCandidate = (e: MidiStateEntry, prio: number) => {
    const k = `note|${e.addr.channel ?? 0}|${e.addr.data1 ?? 0}`;
    const cur = notePlan.get(k);
    if (!cur || prio > cur.priority || (prio === cur.priority && (e.ts ?? 0) > (cur.entry.ts ?? 0))) {
      notePlan.set(k, { entry: e, priority: prio });
    }
  };
  const pushCcCandidate = (e: MidiStateEntry, prio: number) => {
    const k = `cc|${e.addr.channel ?? 0}|${e.addr.data1 ?? 0}`;
    const cur = ccPlan.get(k);
    if (!cur || prio > cur.priority || (prio === cur.priority && (e.ts ?? 0) > (cur.entry.ts ?? 0))) {
      ccPlan.set(k, { entry: e, priority: prio });
    }
  };
  const pushPbCandidate = (ch: number, e: MidiStateEntry, prio: number) => {
    const cur = pbPlan.get(ch);
    if (!cur || prio > cur.priority || (prio === cur.priority && (e.ts ?? 0) > (cur.entry.ts ?? 0))) {
      pbPlan.set(ch, { entry: e, priority: prio });
    }
  };

  const appsInPage = getAppsForPage(page);
  for (const app of appsInPage) {
    const channels = getChannelsForApp(page, app);
    const mapping = resolvePbToCcMappingForApp(page, app);

    // PB plan (priorité: PB connu = 3 > CC mappé = 2 > ZERO = 1)
    for (const ch of channels) {
      const latestPb = state.getKnownLatestForApp(app, "pb", ch, 0);
      if (latestPb) {
        const transformed = transformAppToXTouch(page, app, latestPb);
        if (transformed) pushPbCandidate(ch, transformed, 3);
        continue;
      }
      const ccNum = mapping?.map.get(ch);
      if (ccNum != null) {
        const latestCcSameCh = state.getKnownLatestForApp(app, "cc", ch, ccNum);
        const latestCcAnyCh = latestCcSameCh || state.getKnownLatestForApp(app, "cc", undefined, ccNum);
        if (latestCcAnyCh) {
          const transformed = transformAppToXTouch(page, app, latestCcAnyCh);
          if (transformed) { pushPbCandidate(ch, transformed, 2); }
        }
        continue;
      }
      // Aucun état connu et pas de mapping → proposer PB=0 (faible priorité)
      const zero: MidiStateEntry = { addr: { portId: app, status: "pb", channel: ch, data1: 0 }, value: 0, ts: Date.now(), origin: "xtouch", known: false } as MidiStateEntry;
      pushPbCandidate(ch, zero, 1);
    }

    // Notes: 0..31 sur canaux pertinents (priorité: connu = 2 > reset OFF = 1)
    for (const ch of channels) {
      for (let note = 0; note <= 31; note++) {
        const latestExact = state.getKnownLatestForApp(app, "note", ch, note);
        const latestAnyCh = latestExact || state.getKnownLatestForApp(app, "note", undefined, note);
        if (latestAnyCh) {
          const e = transformAppToXTouch(page, app, latestAnyCh);
          if (e) pushNoteCandidate(e, 2);
        } else {
          const addr = { portId: app, status: "note" as MidiStatus, channel: ch, data1: note } as MidiStateEntry["addr"];
          pushNoteCandidate({ addr, value: 0, ts: Date.now(), origin: "xtouch", known: false } as MidiStateEntry, 1);
        }
      }
    }

    // CC (rings): 0..31 sur canaux pertinents (priorité: connu = 2 > reset 0 = 1)
    for (const ch of channels) {
      for (let cc = 0; cc <= 31; cc++) {
        const latestExact = state.getKnownLatestForApp(app, "cc", ch, cc);
        const latestAnyCh = latestExact || state.getKnownLatestForApp(app, "cc", undefined, cc);
        if (latestAnyCh) {
          const e = transformAppToXTouch(page, app, latestAnyCh);
          if (e) pushCcCandidate(e, 2);
        } else {
          const addr = { portId: app, status: "cc" as MidiStatus, channel: ch, data1: cc } as MidiStateEntry["addr"];
          pushCcCandidate({ addr, value: 0, ts: Date.now(), origin: "xtouch", known: false } as MidiStateEntry, 1);
        }
      }
    }
  }

  // Matérialiser les plans en une liste unique d'entrées à envoyer
  const entriesToSend: MidiStateEntry[] = [];
  for (const { entry } of notePlan.values()) entriesToSend.push(entry);
  for (const { entry } of ccPlan.values()) entriesToSend.push(entry);
  for (const { entry } of pbPlan.values()) entriesToSend.push(entry);
  return entriesToSend;
}


