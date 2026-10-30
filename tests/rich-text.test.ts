/* Meeting minutes: only simple formatting tags survive, nothing executable, and the
 * plain-text version for Excel keeps lists readable. */
import { describe, expect, it } from 'vitest';
import { minutesEmpty, minutesToText, sanitizeMinutes } from '@/lib/rich-text';

describe('sanitizeMinutes', () => {
  it('keeps bold, italic, underline, lists and lines, without attributes', () => {
    expect(sanitizeMinutes('<div><b style="color:red">Budget</b> <i>approved</i> <u class="x">today</u></div><ol><li>One</li></ol><ul><li>Two</li></ul><br>'))
      .toBe('<div><b>Budget</b> <i>approved</i> <u>today</u></div><ol><li>One</li></ol><ul><li>Two</li></ul><br>');
  });
  it('removes scripts, event handlers, links, images and styles', () => {
    const out = sanitizeMinutes('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">click</a>'
      + '<b onclick="alert(1)">x</b><style>body{}</style><svg onload=alert(1)><iframe src=//evil></iframe>');
    expect(out).toBe('click<b>x</b>');
    expect(out).not.toMatch(/script|onerror|onclick|javascript|onload|iframe|<a|<img|<svg/i);
  });
  it('escapes stray angle brackets and ampersands but keeps entities the editor wrote', () => {
    expect(sanitizeMinutes('a &lt; b &amp; c&nbsp;d & e < f')).toBe('a &lt; b &amp; c&nbsp;d &amp; e &lt; f');
    expect(sanitizeMinutes('<b title="x>y">t</b>')).toBe('<b>y"&gt;t</b>');
  });
  it('treats editor leftovers as empty', () => {
    expect(minutesEmpty('<div><br></div>')).toBe(true);
    expect(minutesEmpty('&nbsp;')).toBe(true);
    expect(minutesEmpty('<b>x</b>')).toBe(false);
  });
});

describe('minutesToText (Excel)', () => {
  it('turns lines and lists into readable text', () => {
    expect(minutesToText('<div>Discussed <b>pricing</b> &amp; scope</div><ol><li>Send deck</li><li>Book demo</li></ol><ul><li>CFO joins</li></ul><div>End</div>'))
      .toBe('Discussed pricing & scope\n1. Send deck\n2. Book demo\n• CFO joins\nEnd');
    expect(minutesToText(null)).toBe('');
  });
});
