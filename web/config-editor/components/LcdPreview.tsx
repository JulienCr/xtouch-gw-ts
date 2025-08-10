"use client";
import React from "react";

function clampAscii(text: string): string {
  // X-Touch LCD = 7 chars par ligne, ASCII visible uniquement
  const padded = (text ?? "").padEnd(7).slice(0, 7);
  return padded
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code <= 0x7e ? ch : " ";
    })
    .join("");
}

export function LcdCell({ value }: { value: string | { upper?: string; lower?: string } }) {
  const upperLower = typeof value === "string" ? value.split(/\r?\n/, 2) : [value?.upper || "", value?.lower || ""];
  const upper = clampAscii(upperLower[0] || "");
  const lower = clampAscii(upperLower[1] || "");
  return (
    <div className="rounded-md border bg-[#1b1b1b] text-[#7cff7c] font-mono text-[12px] leading-[1] p-2 shadow-inner">
      <div className="h-[14px] tracking-widest" style={{ letterSpacing: "2px" }}>{upper}</div>
      <div className="h-[14px] tracking-widest" style={{ letterSpacing: "2px" }}>{lower}</div>
    </div>
  );
}

export default function LcdPreview({ labels }: { labels: Array<string | { upper?: string; lower?: string }> }) {
  const padded = [...labels];
  while (padded.length < 8) padded.push("");
  return (
    <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
      {padded.slice(0, 8).map((v, i) => (
        <LcdCell key={i} value={v as any} />
      ))}
    </div>
  );
}


