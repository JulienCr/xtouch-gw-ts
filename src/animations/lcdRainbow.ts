export interface LcdRainbowOptions {
  durationMs: number;
  fps: number;
  stepDelayMs?: number; // si fourni, prend le pas sur fps pour contrôler la vitesse
  stripCount?: number; // default 8
  palette?: number[]; // mapping indices (0..7) to device colors, default [0..7]
  textUpper?: (stripIndex0to7: number) => string;
  textLower?: (stripIndex0to7: number) => string;
}

export interface LcdRainbowSender {
  setColors: (colors: number[]) => void;
  setText?: (stripIndex0to7: number, upper: string, lower: string) => void;
}

/**
 * Anime un dégradé arc‑en‑ciel (palette 8 couleurs) qui "circule" sur les 8 strips LCD.
 * Optionnellement, écrit un texte par strip au démarrage (upper/lower).
 */
export async function playLcdRainbow(sender: LcdRainbowSender, opts: LcdRainbowOptions): Promise<void> {
  const start = Date.now();
  const fps = Math.max(1, Math.min(120, Math.floor(opts.fps)));
  const frameDelay = opts.stepDelayMs != null
    ? Math.max(1, Math.floor(opts.stepDelayMs))
    : Math.max(5, Math.floor(1000 / fps));
  const n = Math.max(1, Math.min(8, Math.floor(opts.stripCount ?? 8)));
  const palette = (opts.palette && opts.palette.length >= 8) ? opts.palette.slice(0, 8) : [0,1,2,3,4,5,6,7];

  // Texte initial si fourni
  if (typeof sender.setText === "function") {
    for (let i = 0; i < n; i++) {
      const upper = opts.textUpper ? opts.textUpper(i) : "";
      const lower = opts.textLower ? opts.textLower(i) : "";
      sender.setText(i, upper, lower);
    }
  }

  // Décalage d'une "vague" de palette (shift circulaire)
  let shift = 0;
  while (Date.now() - start < opts.durationMs) {
    const colors: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (i + shift) & 7; // modulo 8, palette 8 couleurs
      colors.push(palette[idx]);
    }
    sender.setColors(colors);
    shift = (shift + 1) & 7;
    await delay(frameDelay);
  }
}

function delay(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }


