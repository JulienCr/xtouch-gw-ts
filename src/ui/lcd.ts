import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";

export type PageLcdLabel = string | { upper?: string; lower?: string };

export function applyLcdForActivePage(router: Router, x: XTouchDriver): void {
  const page = router.getActivePage();
  const labels = (page as any)?.lcd?.labels as PageLcdLabel[] | undefined;
  if (Array.isArray(labels) && labels.length > 0) {
    for (let i = 0; i < 8; i += 1) {
      const item = labels[i];
      if (typeof item === "string") {
        const [upper, lower] = item.split(/\r?\n/, 2);
        x.sendLcdStripText(i, upper || "", lower || "");
      } else if (item && ((item as any).upper || (item as any).lower)) {
        const it = item as { upper?: string; lower?: string };
        x.sendLcdStripText(i, it.upper || "", it.lower || "");
      } else {
        x.sendLcdStripText(i, "", "");
      }
    }
  } else {
    x.sendLcdStripText(0, router.getActivePageName());
  }
}


