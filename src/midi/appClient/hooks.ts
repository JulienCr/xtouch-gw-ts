export type MidiClientHooks = {
  /** Called after a successful OUT send to an app. */
  onOutgoing?: (app: string, bytes: number[], portId: string) => void;
  /** Called when an IN feedback message is received for an app. */
  onFeedback?: (app: string, raw: number[], portId: string) => void;
  /** Decide whether outgoing messages should be forwarded to the app/router layer. Default: true. */
  shouldForwardOutgoing?: (app: string) => boolean;
  /** Decide whether we should open a feedback IN port for this app. Default: true. */
  shouldOpenFeedback?: (app: string) => boolean;
  /** Notify PB sent so orchestrator can schedule fader setpoints. */
  onPitchBendSent?: (channel1to16: number, value14: number) => void;
};

export function defaultHooks(): MidiClientHooks {
  return {
    onOutgoing: undefined,
    onFeedback: undefined,
    shouldForwardOutgoing: () => true,
    shouldOpenFeedback: () => true,
    onPitchBendSent: undefined,
  };
}

