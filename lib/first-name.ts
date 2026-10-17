/* First name from a full name: the first word, skipping common honorifics.
 * Same rule as the database function hub.first_name (migration 0003). */
const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'prof']);

export function firstName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return words.find((w) => !HONORIFICS.has(w.toLowerCase().replace(/\.$/, ''))) ?? words[0] ?? '';
}
