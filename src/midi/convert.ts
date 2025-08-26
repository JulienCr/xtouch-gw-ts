/**
 * JSDoc: Helpers de conversion 14 bits ↔ 7/8 bits, pourcentages et normalized.
 *
 * Toutes les fonctions sont pures, bornent leurs entrées et renvoient des entiers là où attendu.
 * Ces helpers servent de source de vérité pour éviter la divergence d'arrondis.
 */

/**
 * Convertit une valeur 14 bits (0..16383) vers 7 bits (0..127).
 */
export function to7bitFrom14bit(value14: number): number {
  const v = Math.max(0, Math.min(16383, value14 | 0));
  return Math.round((v / 16383) * 127);
}

/**
 * Convertit une valeur 7 bits (0..127) vers 14 bits (0..16383).
 */
export function to14bitFrom7bit(value7: number): number {
  const v = Math.max(0, Math.min(127, value7 | 0));
  return Math.round((v / 127) * 16383);
}

/**
 * Convertit 14 bits vers pourcentage 0..100 (entier).
 */
export function toPercentFrom14bit(value14: number): number {
  const v = Math.max(0, Math.min(16383, value14 | 0));
  return Math.round((v / 16383) * 100);
}

/**
 * Convertit 14 bits vers 8 bits 0..255 (entier).
 */
export function to8bitFrom14bit(value14: number): number {
  const v = Math.max(0, Math.min(16383, value14 | 0));
  return Math.round((v / 16383) * 255);
}

/**
 * Convertit 14 bits vers normalized 0..1 (nombre flottant borné).
 */
export function toNormalizedFrom14bit(value14: number): number {
  const v = Math.max(0, Math.min(16383, value14 | 0));
  return v / 16383;
}

/**
 * Convertit normalized 0..1 vers 14 bits 0..16383.
 */
export function to14bitFromNormalized(normalized: number): number {
  const v = Math.max(0, Math.min(1, Number(normalized)));
  return Math.round(v * 16383);
}

/**
 * Convertit normalized 0..1 vers 7 bits 0..127.
 */
export function to7bitFromNormalized(normalized: number): number {
  const v = Math.max(0, Math.min(1, Number(normalized)));
  return Math.round(v * 127);
}

// Réexport utilitaires PB 14 bits pour centralisation
export { pb14FromRaw, rawFromPb14 } from "./utils";


