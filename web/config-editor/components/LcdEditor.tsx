"use client";
import React from "react";

type Label = string | { upper?: string; lower?: string };

function toLines(label: Label): { upper: string; lower: string } {
  if (typeof label === "string") {
    const [u = "", l = ""] = label.split(/\r?\n/, 2);
    return { upper: u, lower: l };
  }
  return { upper: label?.upper || "", lower: label?.lower || "" };
}

function toConfigString(upper: string, lower: string): string {
  return lower ? `${upper}\n${lower}` : upper;
}

function enforceAscii7(s: string): string {
  const padded = (s ?? "").slice(0, 7);
  let out = "";
  for (let i = 0; i < padded.length; i += 1) {
    const code = padded.charCodeAt(i);
    out += code >= 0x20 && code <= 0x7e ? padded[i] : " ";
  }
  return out;
}

export default function LcdEditor({
  labels,
  onChange,
}: {
  labels: Label[];
  onChange: (labels: Label[]) => void;
}) {
  const items: Label[] = Array.from({ length: 8 }).map((_, i) => labels[i] ?? "");

  function updateAt(index: number, next: Label) {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {items.map((lab, i) => {
        const { upper, lower } = toLines(lab);
        return (
          <div key={i} className="rounded-md border bg-[#1b1b1b] p-2 shadow-inner">
            <div className="text-[10px] text-gray-400 mb-1">LCD {i + 1}</div>
            <input
              value={upper}
              maxLength={7}
              onChange={(e) => updateAt(i, toConfigString(enforceAscii7(e.target.value), lower))}
              className="w-full bg-transparent outline-none border-0 text-[#7cff7c] font-mono text-[12px] tracking-widest leading-[1] px-1 py-1 rounded"
              style={{ letterSpacing: "2px" }}
              placeholder="haut"
            />
            <input
              value={lower}
              maxLength={7}
              onChange={(e) => updateAt(i, toConfigString(upper, enforceAscii7(e.target.value)))}
              className="w-full bg-transparent outline-none border-0 text-[#7cff7c] font-mono text-[12px] tracking-widest leading-[1] px-1 py-1 rounded"
              style={{ letterSpacing: "2px" }}
              placeholder="bas"
            />
            <div className="mt-1 text-[10px] text-gray-400">7 caractères max par ligne</div>
          </div>
        );
      })}
    </div>
  );
}


