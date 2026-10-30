/* Meeting minutes: simple formatted text from the Log interaction editor.
 * Only these tags are kept, never with attributes: b strong i em u ol ul li p div br.
 * Every other tag is dropped (its text kept), and any stray < or > is escaped, so
 * the stored HTML can be shown on the visitor page safely. */

const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ol', 'ul', 'li', 'p', 'div', 'br']);
const TAG = /<\s*(\/?)\s*([a-zA-Z0-9]+)[^>]*>/g;
const DROP_WITH_CONTENT = /<(script|style|template|iframe|object|noscript)[\s\S]*?<\/\1\s*>/gi;

/** Escape text between tags: keep valid entities (the editor's own &amp; &nbsp; …), escape the rest. */
function escapeText(t: string): string {
  return t.replace(/&(?!(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Keep only the allowed tags, without attributes. */
export function sanitizeMinutes(html: string): string {
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, '');
  let out = '', last = 0;
  for (const m of src.matchAll(TAG)) {
    out += escapeText(src.slice(last, m.index));
    const name = m[2].toLowerCase();
    if (ALLOWED.has(name)) out += name === 'br' ? '<br>' : `<${m[1]}${name}>`;
    last = m.index + m[0].length;
  }
  out += escapeText(src.slice(last));
  return out.trim();
}

/** Plain text version (Excel export): one line per paragraph or list item, lists numbered or bulleted. */
export function minutesToText(html: string | null): string {
  if (!html) return '';
  const lists: { ordered: boolean; n: number }[] = [];
  let text = '';
  for (const part of html.split(/(<[^>]+>)/)) {
    const m = /^<(\/?)([a-z]+)>$/.exec(part);
    if (!m) { text += part; continue; }
    const [, close, tag] = m;
    if (tag === 'ol' || tag === 'ul') { if (close) lists.pop(); else lists.push({ ordered: tag === 'ol', n: 0 }); text += '\n'; }
    else if (tag === 'li' && !close) {
      const l = lists[lists.length - 1];
      text += `\n${'  '.repeat(Math.max(0, lists.length - 1))}${l?.ordered ? `${++l.n}.` : '•'} `;
    } else if (tag === 'br' || ((tag === 'p' || tag === 'div') && close)) text += '\n';
  }
  return text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).join('\n');
}

/** True when the minutes have no visible text (an editor left with only <br> or empty items). */
export const minutesEmpty = (html: string | null | undefined) => !html || !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
