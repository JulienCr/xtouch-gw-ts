import type { Input, Output } from "@julusian/midi";

export function findPortIndexByNameFragment<T extends Input | Output>(
  device: T,
  nameFragment: string
): number | null {
  const needle = nameFragment.trim().toLowerCase();
  const count = device.getPortCount();
  for (let i = 0; i < count; i += 1) {
    const name = device.getPortName(i) ?? "";
    if (name.toLowerCase().includes(needle)) return i;
  }
  return null;
}


