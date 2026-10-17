/* Game content rules, matching Pharma Ninja's own pharma-ninja-src/src/validate.js:
 *   - questionText at most 120 characters
 *   - 4 or 5 options; each option at most 4 words AND at most 28 characters; no duplicates
 *   - exactly one correct option (a valid correctIndex)
 *   - difficulty 1, 2 or 3
 *   - domain must exist
 * validate.js also requires source to start with "TEST"; that rule is for the seed
 * file only and is deliberately NOT applied here (real content would fail it).
 * Additionally the Hub rejects blank text and blank options, which the game never checks.
 * tests/questions.test.ts runs both validators side by side to prove they agree. */

export const ICON_KEYS = ['clipboard', 'shield', 'factory', 'flask', 'chip', 'cloud', 'chart', 'globe'] as const;
export const QUESTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export const DOMAIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;

export type QuestionInput = {
  id: string; domainId: string; questionText: string; options: string[]; correctIndex: number;
  difficulty: number; explanation: string; source: string; enabled: boolean;
};
export type DomainInput = {
  id: string; name: string; description: string; iconKey: string; accent: string; enabled: boolean; sortOrder: number;
};

/** All rule violations for one question (empty array = valid). */
export function questionErrors(q: QuestionInput, domainIds: Set<string>): string[] {
  const errs: string[] = [];
  if (!QUESTION_ID_RE.test(q.id ?? '')) errs.push('id must be 1–40 letters, digits, - or _');
  if (!domainIds.has(q.domainId)) errs.push(`unknown domainId "${q.domainId}"`);
  const text = q.questionText ?? '';
  if (!text.trim()) errs.push('questionText is empty');
  if (text.length > 120) errs.push(`questionText is ${text.length} characters (max 120)`);
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length < 4 || opts.length > 5) errs.push(`${opts.length} options (need 4 or 5)`);
  opts.forEach((o, i) => {
    if (!o || !o.trim()) { errs.push(`option ${i + 1} is empty`); return; }
    const words = o.trim().split(/\s+/).length;
    if (words > 4) errs.push(`option ${i + 1} "${o}" has ${words} words (max 4)`);
    if (o.length > 28) errs.push(`option ${i + 1} "${o}" is ${o.length} characters (max 28)`);
  });
  if (new Set(opts).size !== opts.length) errs.push('two options are identical');
  if (!(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < opts.length)) errs.push('correct option is not one of the options');
  if (![1, 2, 3].includes(q.difficulty)) errs.push('difficulty must be 1, 2 or 3');
  if ((q.explanation ?? '').length > 1000) errs.push('explanation is too long (max 1000)');
  if ((q.source ?? '').length > 200) errs.push('source is too long (max 200)');
  return errs;
}

export function domainErrors(d: DomainInput): string[] {
  const errs: string[] = [];
  if (!DOMAIN_ID_RE.test(d.id ?? '')) errs.push('id must be 1–24 lowercase letters, digits or -');
  if (!d.name?.trim() || d.name.length > 40) errs.push('name is required (max 40)');
  if (!d.description?.trim() || d.description.length > 80) errs.push('short description is required (max 80)');
  if (!(ICON_KEYS as readonly string[]).includes(d.iconKey)) errs.push(`icon must be one of: ${ICON_KEYS.join(', ')}`);
  if (!/^#[0-9A-Fa-f]{6}$/.test(d.accent ?? '')) errs.push('accent must be a colour like #F7943E');
  if (!Number.isInteger(d.sortOrder)) errs.push('sort order must be a whole number');
  return errs;
}

/* ---------------------------------------------------------------------
 * CSV: the locked layout, one row per question.
 * ------------------------------------------------------------------- */
export const CSV_HEADER = ['id', 'domainId', 'questionText', 'option1', 'option2', 'option3', 'option4', 'option5',
  'correctOption', 'difficulty', 'explanation', 'source', 'enabled'] as const;

export type CsvRowResult = { row: number; id: string; question?: QuestionInput; reasons: string[] };

/** Turn parsed CSV rows (header already checked) into questions or reasons for skipping. */
export function csvRowsToQuestions(rows: string[][], domainIds: Set<string>): CsvRowResult[] {
  const seen = new Set<string>();
  return rows.map((cells, i) => {
    const row = i + 2;                                      // spreadsheet row number (header is row 1)
    const get = (k: (typeof CSV_HEADER)[number]) => (cells[CSV_HEADER.indexOf(k)] ?? '');
    const id = get('id').trim();
    const reasons: string[] = [];
    if (cells.length !== CSV_HEADER.length) reasons.push(`has ${cells.length} columns (need ${CSV_HEADER.length})`);
    const options = [get('option1'), get('option2'), get('option3'), get('option4'), get('option5')].map((o) => o.trim());
    if (options[4] === '') options.pop();                    // option5 empty → 4-option question
    const correctRaw = get('correctOption').trim(), diffRaw = get('difficulty').trim(), enabledRaw = get('enabled').trim().toLowerCase();
    if (!/^[1-5]$/.test(correctRaw)) reasons.push('correctOption must be 1–5');
    if (!/^[1-3]$/.test(diffRaw)) reasons.push('difficulty must be 1, 2 or 3');
    if (enabledRaw !== 'yes' && enabledRaw !== 'no') reasons.push('enabled must be yes or no');
    // A blank option1–option4 is reported by questionErrors ("option N is empty").
    const q: QuestionInput = {
      id, domainId: get('domainId').trim(), questionText: get('questionText').trim(), options,
      correctIndex: Number(correctRaw) - 1, difficulty: Number(diffRaw),
      explanation: get('explanation').trim(), source: get('source').trim(), enabled: enabledRaw === 'yes',
    };
    for (const e of questionErrors(q, domainIds)) if (!reasons.includes(e)) reasons.push(e);
    if (id && seen.has(id)) reasons.push('same id appears earlier in this file');
    if (id) seen.add(id);
    return reasons.length ? { row, id, reasons } : { row, id, question: q, reasons };
  });
}

/** One CSV row per question, in the locked layout. */
export function questionToCsvRow(q: QuestionInput): string[] {
  const o = [...q.options, '', '', '', '', ''].slice(0, 5);
  return [q.id, q.domainId, q.questionText, ...o, String(q.correctIndex + 1), String(q.difficulty), q.explanation, q.source, q.enabled ? 'yes' : 'no'];
}
