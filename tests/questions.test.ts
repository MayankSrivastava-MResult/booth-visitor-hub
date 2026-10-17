/* Proves the Hub's question rules (lib/questions.ts) match Pharma Ninja's own
 * validate.js exactly. The game's checks are taken straight from its source
 * file (not copied), so if validate.js changes this test notices. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvRowsToQuestions, questionErrors, questionToCsvRow, type QuestionInput } from '@/lib/questions';

const root = path.resolve(import.meta.dirname, '..');
const validateSrc = fs.readFileSync(path.join(root, 'pharma-ninja-src/src/validate.js'), 'utf8');
// The per-question block of validate.js: from "const errs=[];" up to the per-domain tally.
const block = validateSrc.slice(validateSrc.indexOf('const errs=[];'), validateSrc.indexOf('per[q.domainId]='));
const gameCheck = new Function('q', 'D', `${block}; return errs;`) as (q: unknown, D: { id: string }[]) => string[];

const ctx: { D?: { id: string }[]; Q?: QuestionInput[] } = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'pharma-ninja-src/src/data.js'), 'utf8') + ';this.D = SEED_DOMAINS; this.Q = SEED_QUESTIONS;', ctx);
const D = ctx.D!, SEED = ctx.Q!;
const ids = new Set(D.map((d) => d.id));

/** Game verdict, ignoring its seed-only "source must start with TEST" rule. */
const gameOk = (q: QuestionInput) => gameCheck(q, D).filter((e) => e !== 'source').length === 0;
const hubOk = (q: QuestionInput) => questionErrors(q, ids).length === 0;

const base = SEED.find((q) => q.id === 'qc-02')!;   // a valid 5-option question
const variants: [string, Partial<QuestionInput>][] = [
  ['text exactly 120', { questionText: 'x'.repeat(120) }],
  ['text 121', { questionText: 'x'.repeat(121) }],
  ['3 options', { options: ['A', 'B', 'C'], correctIndex: 0 }],
  ['6 options', { options: ['A', 'B', 'C', 'D', 'E', 'F'] }],
  ['option exactly 28 chars', { options: ['x'.repeat(28), 'B', 'C', 'D'], correctIndex: 0 }],
  ['option 29 chars', { options: ['x'.repeat(29), 'B', 'C', 'D'], correctIndex: 0 }],
  ['option 4 words', { options: ['one two three four', 'B', 'C', 'D'], correctIndex: 0 }],
  ['option 5 words', { options: ['one two three four five', 'B', 'C', 'D'], correctIndex: 0 }],
  ['option with surrounding spaces, 4 words', { options: ['  a b c d  ', 'B', 'C', 'D'], correctIndex: 0 }],
  ['duplicate options', { options: ['A', 'A', 'C', 'D'], correctIndex: 0 }],
  ['correctIndex -1', { correctIndex: -1 }],
  ['correctIndex = length', { correctIndex: 5 }],
  ['difficulty 0', { difficulty: 0 }],
  ['difficulty 4', { difficulty: 4 }],
  ['unknown domain', { domainId: 'nope' }],
  ['curly quote counts as 1 char', { options: ['Investigator’s Brochure x', 'B', 'C', 'D'], correctIndex: 0 }],
];

describe('Hub rules = Pharma Ninja validate.js', () => {
  it('agree on all 45 seed questions (all valid)', () => {
    expect(SEED).toHaveLength(45);
    for (const q of SEED) { expect(gameOk(q), q.id).toBe(true); expect(hubOk(q), q.id).toBe(true); }
  });
  it.each(variants)('agree on: %s', (_label, change) => {
    const q = { ...base, ...change } as QuestionInput;
    expect(hubOk(q)).toBe(gameOk(q));
  });
  it('the Hub is stricter only about blanks (which the game never checks)', () => {
    expect(hubOk({ ...base, questionText: '   ' })).toBe(false);
    expect(hubOk({ ...base, options: ['', 'B', 'C', 'D'], correctIndex: 1 })).toBe(false);
  });
});

describe('CSV layout', () => {
  it('round-trips every seed question unchanged', () => {
    const csv = Papa.unparse({ fields: [...CSV_HEADER], data: SEED.map(questionToCsvRow) });
    const [header, ...rows] = Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' }).data;
    expect(header).toEqual([...CSV_HEADER]);
    const back = csvRowsToQuestions(rows, ids);
    expect(back.every((r) => r.question)).toBe(true);
    expect(back.map((r) => r.question)).toEqual(SEED.map((q) => ({ ...q })));
  });
  it('lists every reason a row is skipped', () => {
    const rows = [
      ['x-1', 'quality', 'Q?', 'A', 'B', 'C', 'D', '', '5', '2', '', 'TEST', 'yes'],          // correct option 5 of 4
      ['x-2', 'nope', 'Q?', 'A', 'B', 'C', 'D', '', '1', '9', '', 'TEST', 'maybe'],          // domain, difficulty, enabled
      ['x-3', 'quality', 'Q?', 'A', '', 'C', 'D', 'E', '1', '1', '', 'TEST', 'yes'],         // gap in options
      ['x-1', 'quality', 'Q?', 'A', 'B', 'C', 'D', '', '1', '1', '', 'TEST', 'yes'],         // repeated id
    ];
    const r = csvRowsToQuestions(rows, ids);
    expect(r.map((x) => x.row)).toEqual([2, 3, 4, 5]);
    expect(r[0].reasons).toContain('correct option is not one of the options');
    expect(r[1].reasons).toEqual(expect.arrayContaining(['unknown domainId "nope"', 'difficulty must be 1, 2 or 3', 'enabled must be yes or no']));
    expect(r[2].reasons).toContain('option 2 is empty');
    expect(r[3].reasons).toContain('same id appears earlier in this file');
  });
});
