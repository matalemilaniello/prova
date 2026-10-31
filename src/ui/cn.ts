/** Unisce classi CSS ignorando i valori falsi. */
export function cn(...parts: Array<string | boolean | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}
