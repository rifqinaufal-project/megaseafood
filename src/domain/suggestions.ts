/** Saran dari data yang sudah tersimpan, terbaru lebih dahulu tanpa duplikasi. */
export function recentSuggestions(values: (string | undefined | null)[], limit = 50): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [...values].reverse()) {
    const text = value?.trim();
    if (!text) continue;
    const key = text.toLocaleLowerCase("id-ID");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}
