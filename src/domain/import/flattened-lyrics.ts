/**
 * Setlist Helper's CSV export replaces every newline inside a field with two spaces.
 * A run of n spaces is (n mod 2) trailing spaces followed by floor(n / 2) newlines.
 * Text that already contains line breaks (HTML export, hand-made CSV) is returned as is.
 */
export function restoreLineBreaks(text: string): string {
  if (/[\r\n]/.test(text)) return text;
  return text.replace(/ {2,}/g, (run) => " ".repeat(run.length % 2) + "\n".repeat(run.length >> 1));
}
