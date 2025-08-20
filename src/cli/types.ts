import type { Router } from "../router";
import type { XTouchDriver } from "../xtouch/driver";

/**
 * Public context provided by the application to attach the CLI.
 */
export interface CliContext {
  router: Router;
  xtouch: XTouchDriver | null;
  onExit?: () => Promise<void> | void;
}


