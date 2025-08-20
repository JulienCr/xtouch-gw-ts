import type { CliContext } from "../types";

export const routerHandlers = {
	async emit(rest: string[], ctx: CliContext) {
		const controlId = rest[0];
		const valueRaw = rest[1];
		const value = valueRaw !== undefined ? Number(valueRaw) : undefined;
		await ctx.router.handleControl(controlId, Number.isFinite(value as number) ? (value as number) : valueRaw);
	},
};


