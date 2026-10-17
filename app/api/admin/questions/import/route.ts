/* POST /api/admin/questions/import {csv: "<file text>"}   (admin)
 * The CSV must use exactly the locked layout (header row required):
 *   id, domainId, questionText, option1..option5, correctOption (1–5), difficulty, explanation, source, enabled (yes/no)
 * Rows that break a rule are listed with the reason and skipped; valid rows are saved
 * (an existing id is updated). → 200 {created, updated, skipped:[{row, id, reasons[]}]} | 400 {error} */
import Papa from 'papaparse';
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { domainIds, upsertQuestions } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';
import { CSV_HEADER, csvRowsToQuestions } from '@/lib/questions';

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const body = await readJson(req, 2 * 1024 * 1024) as { csv?: unknown } | undefined;
  if (!body || typeof body.csv !== 'string') return error(400, 'Choose a CSV file (max 2 MB).');

  const parsed = Papa.parse<string[]>(body.csv.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const [header, ...rows] = parsed.data;
  const got = (header ?? []).map((h) => h.trim());
  if (got.join(',') !== CSV_HEADER.join(',')) {
    return error(400, `The first row must be exactly: ${CSV_HEADER.join(', ')}`);
  }
  if (!rows.length) return error(400, 'The file has a header but no questions.');
  if (rows.length > 5000) return error(400, 'Too many rows (max 5000).');

  const results = csvRowsToQuestions(rows, await domainIds(g.user));
  const valid = results.filter((r) => r.question).map((r) => r.question!);
  const { created, updated } = valid.length ? await upsertQuestions(g.user, valid) : { created: 0, updated: 0 };
  const skipped = results.filter((r) => !r.question).map(({ row, id, reasons }) => ({ row, id, reasons }));
  return json({ created, updated, skipped });
}
