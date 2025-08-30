import { logger } from "../../logger";

// TS minimal globals
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
declare function clearInterval(id: any): void;

export interface XInputProviderOptions {
  deviceIndex?: number; // 0..3
  sampleHz?: number; // default 60
  deadzone?: number; // default 0.15
  triggerThreshold?: number; // default 0.5
}

export type GamepadEvent =
  | { id: string; type: "button"; pressed: boolean }
  | { id: string; type: "axis"; value: number };

export interface GamepadProvider {
  subscribe(cb: (ev: GamepadEvent) => void): () => void;
  stop(): void;
}

/** Normalize a signed 16-bit axis to -1..+1 with deadzone. */
function normalizeAxis(v: number, deadzone = 0.15): number {
  const n = Math.max(-32768, Math.min(32767, (v as number) | 0)) / 32767;
  return Math.abs(n) < deadzone ? 0 : Math.max(-1, Math.min(1, n));
}

/** Normalize trigger 0..255 to 0..1. */
function normalizeTrigger(v: number): number {
  const n = Math.max(0, Math.min(255, (v as number) | 0)) / 255;
  return Math.max(0, Math.min(1, n));
}

/**
 * XInput polling provider using xinput-ffi.
 * Uses dynamic import to support ESM-only dependency in a CJS project.
 */
export async function startXInputProvider(opts: XInputProviderOptions = {}): Promise<GamepadProvider> {
  let deviceIndex = Number.isFinite(opts.deviceIndex as number) ? Math.max(0, Math.min(3, (opts.deviceIndex as number) | 0)) : 0;
  const sampleHz = Number.isFinite(opts.sampleHz as number) ? Math.max(1, (opts.sampleHz as number) | 0) : 60;
  const deadzone = typeof opts.deadzone === "number" ? Math.max(0, Math.min(1, opts.deadzone)) : 0.15;
  const trigTh = typeof opts.triggerThreshold === "number" ? Math.max(0, Math.min(1, opts.triggerThreshold)) : 0.5;

  let timer: any = null;
  const listeners = new Set<(ev: GamepadEvent) => void>();

  let lastButtons = new Set<string>();
  let lastLX = 0, lastLY = 0, lastRX = 0, lastRY = 0, lastZL = 0, lastZR = 0;
  let lastZLPressed = false, lastZRPressed = false;

  const notify = (ev: GamepadEvent): void => {
    for (const cb of listeners) {
      try { cb(ev); } catch {}
    }
  };

  const mapButtonName = (name: string): string | null => {
    switch (name) {
      case "XINPUT_GAMEPAD_A": return "gamepad.btn.a";
      case "XINPUT_GAMEPAD_B": return "gamepad.btn.b";
      case "XINPUT_GAMEPAD_X": return "gamepad.btn.x";
      case "XINPUT_GAMEPAD_Y": return "gamepad.btn.y";
      case "XINPUT_GAMEPAD_DPAD_UP": return "gamepad.dpad.up";
      case "XINPUT_GAMEPAD_DPAD_DOWN": return "gamepad.dpad.down";
      case "XINPUT_GAMEPAD_DPAD_LEFT": return "gamepad.dpad.left";
      case "XINPUT_GAMEPAD_DPAD_RIGHT": return "gamepad.dpad.right";
      case "XINPUT_GAMEPAD_LEFT_SHOULDER": return "gamepad.btn.lb";
      case "XINPUT_GAMEPAD_RIGHT_SHOULDER": return "gamepad.btn.rb";
      case "XINPUT_GAMEPAD_LEFT_THUMB": return "gamepad.btn.l3";
      case "XINPUT_GAMEPAD_RIGHT_THUMB": return "gamepad.btn.r3";
      case "XINPUT_GAMEPAD_START": return "gamepad.btn.plus"; // START → plus
      case "XINPUT_GAMEPAD_BACK": return "gamepad.btn.minus"; // BACK → minus
      case "XINPUT_GAMEPAD_GUIDE": return "gamepad.btn.home"; // Guide → home
      default: return null;
    }
  };

  // Try to import xinput-ffi dynamically
  let XInput: any;
  try {
    XInput = await import("xinput-ffi");
  } catch (err) {
    logger.warn("Gamepad: impossible de charger 'xinput-ffi' — vérifier l'installation.", err as any);
    throw err;
  }

  // Resolve connected device if possible
  try {
    if (typeof XInput.listConnected === "function") {
      const connected: boolean[] = await XInput.listConnected();
      const firstIdx = connected.findIndex(Boolean);
      const useIdx = connected[deviceIndex] ? deviceIndex : (firstIdx >= 0 ? firstIdx : deviceIndex);
      const msg = `Gamepad(XInput): connected=${JSON.stringify(connected)} → using idx=${useIdx}`;
      try { logger.info(msg); } catch {}
      deviceIndex = useIdx;
    }
  } catch {
    // ignore
  }

  const getState = async (): Promise<any | null> => {
    try {
      // Try getStateEx (no options) then getState with translate
      if (typeof XInput.getStateEx === "function") {
        const st = await XInput.getStateEx({ userIndex: deviceIndex, translate: true }).catch(() => XInput.getStateEx());
        if (st) return st;
      }
      if (typeof XInput.getState === "function") {
        try { return await XInput.getState({ userIndex: deviceIndex, translate: true }); } catch {}
        try { return await XInput.getState(deviceIndex); } catch {}
      }
      return null;
    } catch { return null; }
  };

  // Button bit flags fallback (official XInput constants)
  const BTN_BITS: Array<[string, number]> = [
    ["XINPUT_GAMEPAD_DPAD_UP", 0x0001],
    ["XINPUT_GAMEPAD_DPAD_DOWN", 0x0002],
    ["XINPUT_GAMEPAD_DPAD_LEFT", 0x0004],
    ["XINPUT_GAMEPAD_DPAD_RIGHT", 0x0008],
    ["XINPUT_GAMEPAD_START", 0x0010],
    ["XINPUT_GAMEPAD_BACK", 0x0020],
    ["XINPUT_GAMEPAD_LEFT_THUMB", 0x0040],
    ["XINPUT_GAMEPAD_RIGHT_THUMB", 0x0080],
    ["XINPUT_GAMEPAD_LEFT_SHOULDER", 0x0100],
    ["XINPUT_GAMEPAD_RIGHT_SHOULDER", 0x0200],
    // 0x0400 often used for GUIDE in Ex, but not standard across DLLs
    ["XINPUT_GAMEPAD_A", 0x1000],
    ["XINPUT_GAMEPAD_B", 0x2000],
    ["XINPUT_GAMEPAD_X", 0x4000],
    ["XINPUT_GAMEPAD_Y", 0x8000],
  ];

  const decodeButtons = (wButtons: unknown): string[] => {
    if (Array.isArray(wButtons)) return wButtons as string[];
    const mask = Number(wButtons) | 0;
    if (!mask) return [];
    const names: string[] = [];
    for (const [name, bit] of BTN_BITS) { if (mask & bit) names.push(name); }
    return names;
  };

  let warnedNoState = false;
  const pollOnce = async (): Promise<void> => {
    const st = await getState();
    if (!st || !st.gamepad) {
      if (!warnedNoState) { try { logger.info(`Gamepad(XInput): aucun état pour idx=${deviceIndex}. Branchez/activez la manette.`); } catch {} warnedNoState = true; }
      return;
    }
    warnedNoState = false;
    const gp = st.gamepad as any;
    const buttonsArr: string[] = decodeButtons((gp as any).wButtons);
    const curButtons = new Set<string>(buttonsArr);

    // Buttons transitions
    for (const name of curButtons) {
      if (!lastButtons.has(name)) {
        const id = mapButtonName(name);
        if (id) notify({ id, type: "button", pressed: true });
      }
    }
    for (const name of Array.from(lastButtons)) {
      if (!curButtons.has(name)) {
        const id = mapButtonName(name);
        if (id) notify({ id, type: "button", pressed: false });
      }
    }
    lastButtons = curButtons;

    // Axes
    const lx = normalizeAxis(Number(gp.sThumbLX ?? 0), deadzone);
    const ly = normalizeAxis(Number(gp.sThumbLY ?? 0), deadzone);
    const rx = normalizeAxis(Number(gp.sThumbRX ?? 0), deadzone);
    const ry = normalizeAxis(Number(gp.sThumbRY ?? 0), deadzone);

    if (lx !== lastLX) { lastLX = lx; notify({ id: "gamepad.axis.lx", type: "axis", value: lx }); }
    if (ly !== lastLY) { lastLY = ly; notify({ id: "gamepad.axis.ly", type: "axis", value: ly }); }
    if (rx !== lastRX) { lastRX = rx; notify({ id: "gamepad.axis.rx", type: "axis", value: rx }); }
    if (ry !== lastRY) { lastRY = ry; notify({ id: "gamepad.axis.ry", type: "axis", value: ry }); }

    // Triggers
    const zl = normalizeTrigger(Number(gp.bLeftTrigger ?? 0));
    const zr = normalizeTrigger(Number(gp.bRightTrigger ?? 0));
    if (zl !== lastZL) { lastZL = zl; notify({ id: "gamepad.axis.zl", type: "axis", value: zl }); }
    if (zr !== lastZR) { lastZR = zr; notify({ id: "gamepad.axis.zr", type: "axis", value: zr }); }

    // Optional pseudo-buttons for triggers based on threshold
    const zlPressed = zl >= trigTh; const zrPressed = zr >= trigTh;
    if (zlPressed !== lastZLPressed) { lastZLPressed = zlPressed; notify({ id: "gamepad.btn.zl", type: "button", pressed: zlPressed }); }
    if (zrPressed !== lastZRPressed) { lastZRPressed = zrPressed; notify({ id: "gamepad.btn.zr", type: "button", pressed: zrPressed }); }
  };

  const start = (): void => {
    const intervalMs = Math.max(5, Math.round(1000 / sampleHz));
    if (timer) { try { clearInterval(timer); } catch {} timer = null; }
    timer = setInterval(() => { pollOnce().catch(() => {}); }, intervalMs);
    logger.info(`Gamepad(XInput): polling started (idx=${deviceIndex}, ${sampleHz} Hz, dz=${deadzone})`);
  };

  start();

  return {
    subscribe(cb) { listeners.add(cb); return () => { try { listeners.delete(cb); } catch {} }; },
    stop() { try { if (timer) clearInterval(timer); } catch {} timer = null; listeners.clear(); },
  };
}
