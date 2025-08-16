import { describe, it } from "vitest";
import fc from "fast-check";
import { pb14FromRaw, rawFromPb14 } from "../utils";

// Property: rawFromPb14(channel, v14) -> [st, lsb, msb] and pb14FromRaw(lsb, msb) == v14 (clamped)

describe("midi/utils pb14 property", () => {
	it("pb14FromRaw(rawFromPb14(...)) roundtrips for 0..16383 and channels 1..16", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 16 }), fc.integer({ min: 0, max: 16383 }), (ch, v) => {
				const [_, lsb, msb] = rawFromPb14(ch, v);
				const v2 = pb14FromRaw(lsb, msb);
				return v2 === v;
			})
		);
	});
});
