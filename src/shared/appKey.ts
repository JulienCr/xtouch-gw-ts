/**
 * Résolution de l'app key en fonction des noms de ports.
 *
 * Règle commune: si le texte (to+from) contient "qlc", "voicemeeter"/"xtouch-gw", ou "obs".
 */
export function resolveAppKey(toPort: string, fromPort: string): "voicemeeter" | "qlc" | "obs" | "midi-bridge" {
	const to = (toPort || "").toLowerCase();
	const from = (fromPort || "").toLowerCase();
	const txt = `${to} ${from}`;
	if (txt.includes("qlc")) return "qlc";
	if (txt.includes("xtouch-gw") || txt.includes("voicemeeter")) return "voicemeeter";
	if (txt.includes("obs")) return "obs";
	return "midi-bridge";
}

/**
 * Variante simplifiée lorsqu'on n'a qu'un seul nom de port (IN/OUT unique).
 */
export function resolveAppKeyFromPort(port: string): "voicemeeter" | "qlc" | "obs" | "midi-bridge" {
	const p = (port || "").toLowerCase();
	if (p.includes("qlc")) return "qlc";
	if (p.includes("xtouch-gw") || p.includes("voicemeeter")) return "voicemeeter";
	if (p.includes("obs")) return "obs";
	return "midi-bridge";
}


