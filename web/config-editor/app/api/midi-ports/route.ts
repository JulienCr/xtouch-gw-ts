import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Dynamic import to avoid bundling native module
    const midi = await import("@julusian/midi");
    const { Input, Output } = midi as any;
    const input = new Input();
    const output = new Output();
    const inputs: string[] = [];
    const outputs: string[] = [];
    for (let i = 0; i < input.getPortCount(); i++) inputs.push(input.getPortName(i));
    for (let i = 0; i < output.getPortCount(); i++) outputs.push(output.getPortName(i));
    input.closePort?.();
    output.closePort?.();
    return NextResponse.json({ ok: true, inputs, outputs });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}


