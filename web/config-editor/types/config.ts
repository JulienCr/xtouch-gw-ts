export type MidiEventTypeName =
  | "noteOn"
  | "noteOff"
  | "controlChange"
  | "programChange"
  | "channelAftertouch"
  | "polyAftertouch"
  | "pitchBend";

export interface MidiFilterConfig {
  channels?: number[];
  types?: MidiEventTypeName[];
  includeNotes?: number[];
  excludeNotes?: number[];
}

export interface TransformConfig {
  pb_to_note?: {
    note?: number;
  };
  pb_to_cc?: {
    target_channel?: number;
    base_cc?: number | string;
    cc_by_channel?: Record<number, number | string>;
  };
}

export interface PassthroughConfig {
  driver: string;
  to_port: string;
  from_port: string;
  filter?: MidiFilterConfig;
  optional?: boolean;
  transform?: TransformConfig;
}

export interface ControlMidiSpec {
  type: "cc" | "note" | "pb";
  channel: number;
  cc?: number;
  note?: number;
}

export interface ControlMapping {
  app: string;
  action?: string;
  params?: unknown[];
  midi?: ControlMidiSpec;
  indicator?: { signal: string; equals?: unknown; in?: unknown[]; truthy?: boolean };
}

export interface PageConfig {
  name: string;
  passthrough?: PassthroughConfig;
  passthroughs?: PassthroughConfig[];
  controls: Record<string, unknown>;
  lcd?: {
    labels?: Array<string | { upper?: string; lower?: string }>;
    colors?: Array<number | string>;
  };
}

export interface GlobalPageDefaults {
  controls?: Record<string, unknown>;
  lcd?: {
    labels?: Array<string | { upper?: string; lower?: string }>;
    colors?: Array<number | string>;
  };
  passthrough?: PassthroughConfig;
  passthroughs?: PassthroughConfig[];
}

export interface AppConfig {
  midi: {
    input_port: string;
    output_port: string;
  };
  paging?: { channel?: number; prev_note?: number; next_note?: number };
  pages_global?: GlobalPageDefaults;
  pages: PageConfig[];
}

export const defaultConfig = (): AppConfig => ({
  midi: { input_port: "UM-One", output_port: "UM-One" },
  paging: { channel: 1, prev_note: 46, next_note: 47 },
  pages: [
    { name: "Default", controls: {}, lcd: { labels: [] }, passthroughs: [] },
  ],
});


