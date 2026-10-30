// Converts the question-bank spreadsheet (one sheet per domain) into the Hub's
// question CSV (the same layout as Game settings → Export), ready to import.
//
//   node scripts/questions-from-xlsx.mjs "Pharma Ninja.xlsx" [questions.csv]
//
// Spreadsheet columns, matched by name in any order: S.No, Domain, Difficulty
// (Easy / Moderate / Difficult), Questions, Option 1–4, Correct Option or Correct
// Answer (A–D, 1–4 or "Option 2"), Source, Verified (Yes), Corrections.
//   - id = S.No (e.g. CT-001), so importing a corrected file updates questions
//   - domain = the Domain column (or the sheet name), matched to the game's domain names
//     ("and" and "&" are treated alike)
//   - enabled = yes only when Verified is Yes and Corrections is empty; the rest are
//     imported switched off, to review and enable in the Hub
// Rows the Hub would reject (same rules as lib/questions.ts) are left out and listed,
// with the reason, in <output>-problems.csv. Nothing is sent anywhere.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

const [input, outArg] = process.argv.slice(2);
if (!input) { console.error('Usage: node scripts/questions-from-xlsx.mjs <file.xlsx> [out.csv]'); process.exit(1); }
const out = outArg ?? input.replace(/\.xlsx$/i, '') + ' - import.csv';
const problemsOut = out.replace(/\.csv$/i, '') + ' - problems.csv';

const HEADER = ['id', 'domainId', 'questionText', 'option1', 'option2', 'option3', 'option4', 'option5',
  'correctOption', 'difficulty', 'explanation', 'source', 'enabled'];
const LEVEL = { easy: 1, moderate: 2, medium: 2, difficult: 3, hard: 3 };
const key = (s) => s.toLowerCase().replace(/\band\b/g, '&').replace(/[^a-z0-9&]+/g, '');

// The game's domains (ids and names) from its seed data.
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../pharma-ninja-src/src/data.js'), 'utf8') + ';this.D = SEED_DOMAINS;', ctx);
const domainByName = new Map(ctx.D.map((d) => [key(d.name), d.id]));

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map((r) => r.text).join('') : ''));
  return String(v);
};
const clean = (s) => text(s).replace(/\s+/g, ' ').trim();

/** Same checks as the Hub (lib/questions.ts questionErrors). */
function problems(q) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(q.id)) e.push('S.No must be 1–40 letters, digits, - or _');
  if (!q.domainId) e.push('domain not recognised');
  if (!q.questionText) e.push('question is empty');
  if (q.questionText.length > 170) e.push(`question is ${q.questionText.length} characters (max 170)`);
  q.options.forEach((o, i) => {
    if (!o) e.push(`option ${i + 1} is empty`);
    else if (o.length > 100) e.push(`option ${i + 1} is ${o.length} characters (max 100)`);
  });
  if (new Set(q.options).size !== q.options.length) e.push('two options are identical');
  if (!(q.correct >= 1 && q.correct <= 4)) e.push('correct answer not readable (use A–D, 1–4 or "Option 1"–"Option 4")');
  if (![1, 2, 3].includes(q.difficulty)) e.push('difficulty must be Easy, Moderate or Difficult');
  if (q.source.length > 200) e.push(`source is ${q.source.length} characters (max 200)`);
  return e;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const rows = [], bad = [], seen = new Set(), tally = {};
for (const ws of wb.worksheets) {
  const head = (ws.getRow(1).values ?? []).slice(1).map((h) => clean(h).toLowerCase());
  const col = (re) => { const i = head.findIndex((h) => re.test(h)); return i < 0 ? null : i + 1; };
  const c = { id: col(/^s\.?\s*no/), domain: col(/^domain/), diff: col(/^difficulty/), q: col(/^question/),
    opts: [1, 2, 3, 4].map((n) => col(new RegExp(`^option\\s*${n}$`))), correct: col(/^correct/), source: col(/^source/),
    verified: col(/^ver/), corrections: col(/^(correction|suggestion)/) };
  if (!c.q || c.opts.includes(null) || !c.correct || !c.diff) { console.log(`Skipped sheet "${ws.name}": missing Questions, Option 1–4, Correct or Difficulty column`); continue; }
  const get = (r, k) => (k ? clean(r.getCell(k).value) : '');
  ws.eachRow((r, n) => {
    if (n === 1 || !get(r, c.q)) return;
    const domainName = get(r, c.domain) || ws.name;
    const a = get(r, c.correct).toUpperCase().replace(/^OPTION\s*/, '');
    const q = {
      id: get(r, c.id), domainId: domainByName.get(key(domainName)) ?? domainByName.get(key(ws.name)) ?? '',
      questionText: get(r, c.q), options: c.opts.map((k) => get(r, k)),
      correct: /^[A-D]$/.test(a) ? a.charCodeAt(0) - 64 : /^[1-4]$/.test(a) ? Number(a) : 0,
      difficulty: LEVEL[get(r, c.diff).toLowerCase()] ?? 0, source: get(r, c.source),
      enabled: /^yes$/i.test(get(r, c.verified)) && !get(r, c.corrections),
    };
    const why = problems(q);
    if (q.id && seen.has(q.id)) why.push('same S.No appears earlier');
    seen.add(q.id);
    if (why.length) { bad.push({ sheet: ws.name, sno: q.id, row: n, problems: why.join('; '), question: q.questionText }); return; }
    rows.push([q.id, q.domainId, q.questionText, ...q.options, '', String(q.correct), String(q.difficulty), '', q.source, q.enabled ? 'yes' : 'no']);
    const t = (tally[domainName] ??= { 1: [0, 0], 2: [0, 0], 3: [0, 0] });
    t[q.difficulty][0]++; if (q.enabled) t[q.difficulty][1]++;
  });
}

fs.writeFileSync(out, '﻿' + Papa.unparse({ fields: HEADER, data: rows }, { newline: '\r\n' }));
fs.writeFileSync(problemsOut, '﻿' + Papa.unparse(bad, { newline: '\r\n' }));
console.log(`\n${rows.length} questions written to ${out}`);
console.log('Per domain (Easy / Moderate / Difficult; switched on in brackets):');
for (const [d, t] of Object.entries(tally)) console.log(`  ${d.padEnd(26)} ${t[1][0]} (${t[1][1]}) / ${t[2][0]} (${t[2][1]}) / ${t[3][0]} (${t[3][1]})`);
console.log(`\n${bad.length} left out (listed in ${problemsOut})`);
for (const b of bad) console.log(`  ${b.sheet} ${b.sno}: ${b.problems}`);
