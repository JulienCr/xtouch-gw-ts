import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";

export type PageLcdLabel = string | { upper?: string; lower?: string };

export function applyLcdForActivePage(router: Router, x: XTouchDriver): void {
  const page = router.getActivePage();
  const labels = (page as any)?.lcd?.labels as PageLcdLabel[] | undefined;
  const colorsRaw = (page as any)?.lcd?.colors as Array<number | string> | undefined;
  const pageName = router.getActivePageName?.() ?? (page as any)?.name ?? "";
  // Always start by clearing all strips to avoid leaks from previous pages
  for (let i = 0; i < 8; i += 1) {
    x.sendLcdStripText(i, "", "");
  }

  if (Array.isArray(labels) && labels.length > 0) {
    for (let i = 0; i < 8; i += 1) {
      const item = labels[i];
      if (typeof item === "string") {
        const [upper, lower] = item.split(/\r?\n/, 2);
        x.sendLcdStripText(i, upper || "", lower || "");
      } else if (item && ((item as any).upper || (item as any).lower)) {
        const it = item as { upper?: string; lower?: string };
        x.sendLcdStripText(i, it.upper || "", it.lower || "");
      }
    }
  }

  // Apply colors: if provided use them, otherwise clear all (0)
  const colors: number[] = [];
  if (Array.isArray(colorsRaw) && colorsRaw.length > 0) {
    for (let i = 0; i < 8; i += 1) {
      const v = colorsRaw[i];
      const n = typeof v === "string" ? Number(v) : v;
      colors.push(Number.isFinite(n as number) ? Math.max(0, Math.min(7, Number(n))) : 0);
    }
  } else {
    for (let i = 0; i < 8; i += 1) colors.push(0);
  }
  x.setLcdColors(colors);

  // Grand afficheur 7-segments: afficher le nom de la page centré (si supporté)
  try {
    x.setSevenSegmentText(pageName);
  } catch {}
}


