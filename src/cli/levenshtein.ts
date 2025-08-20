/**
 * Distance de Levenshtein (ins/del/sub coût 1) pour suggestions.
 *
 * @param a Chaîne source (minuscule recommandé)
 * @param b Chaîne cible (minuscule recommandé)
 * @returns Nombre minimal d'opérations pour transformer a en b
 */
export function levenshtein(a: string, b: string): number {
	const m = a.length, n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			dp[i][j] = Math.min(
				dp[i - 1][j] + 1,
				dp[i][j - 1] + 1,
				dp[i - 1][j - 1] + cost,
			);
		}
	}
	return dp[m][n];
}


