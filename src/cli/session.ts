import type { MidiInputSniffer } from "../midi/sniffer";

export interface SessionState {
	midiSniffer: MidiInputSniffer | null;
	pendingLearnControlId: string | null;
}

export function createInitialSession(): SessionState {
	return { midiSniffer: null, pendingLearnControlId: null };
}


