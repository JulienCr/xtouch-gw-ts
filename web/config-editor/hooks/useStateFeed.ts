import { useEffect, useState } from "react";

export type MidiAddr = {
  portId: string;
  status: "note" | "cc" | "pb" | "sysex";
  channel?: number;
  data1?: number;
};

export type MidiStateEntry = {
  addr: MidiAddr;
  value: number | number[];
  ts?: number;
  known?: boolean;
  origin?: string;
};

export type Snapshot = {
  ts: number;
  apps: Record<string, MidiStateEntry[]>;
};

function parseEventData(data: string): Snapshot | null {
  try {
    return JSON.parse(data) as Snapshot;
  } catch {
    return null;
  }
}

export function useStateFeed() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    // Initial fetch
    fetch("/api/state/snapshot")
      .then((r) => r.json())
      .then((json) => {
        if (!closed) setSnapshot(json);
      })
      .catch((e) => setError(String(e)));

    // SSE connection
    const es = new EventSource("/api/state/sse");
    es.onmessage = (ev) => {
      const json = parseEventData(ev.data);
      if (json && !closed) setSnapshot(json);
    };
    es.onerror = () => {
      // Will retry automatically
    };

    return () => {
      closed = true;
      try { es.close(); } catch {}
    };
  }, []);

  return { snapshot, error };
}

