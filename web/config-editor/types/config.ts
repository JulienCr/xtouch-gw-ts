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

export interface AppConfig {
  midi: {
    input_port: string;
    output_port: string;
  };
  features?: { vm_sync?: boolean };
  paging?: { channel?: number; prev_note?: number; next_note?: number };
  pages: PageConfig[];
}

export const defaultConfig = (): AppConfig => ({
  midi: { input_port: "UM-One", output_port: "UM-One" },
  features: { vm_sync: false },
  paging: { channel: 1, prev_note: 46, next_note: 47 },
  pages: [
    { name: "Default", controls: {}, lcd: { labels: [] }, passthroughs: [] },
  ],
});


