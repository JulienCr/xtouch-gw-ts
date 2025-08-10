"use client";
import { useEffect, useState } from "react";

export function useMidiPorts() {
  const [inputs, setInputs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/midi-ports", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Erreur MIDI ports");
        if (!disposed) {
          setInputs(data.inputs || []);
          setOutputs(data.outputs || []);
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    run();
    return () => {
      disposed = true;
    };
  }, []);

  return { inputs, outputs, loading, error };
}


