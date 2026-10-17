/* GET /api/admin/questions/export → CSV download of every question, in the locked layout   (admin)
 * Saved with a UTF-8 BOM so Excel shows curly quotes and symbols correctly; import accepts it back unchanged. */
import Papa from 'papaparse';
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { listQuestions } from '@/lib/data/content';
import { CSV_HEADER, questionToCsvRow } from '@/lib/questions';
import { istDate } from '@/lib/time';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const qs = await listQuestions(g.user);
  const csv = Papa.unparse({ fields: [...CSV_HEADER], data: qs.map(questionToCsvRow) }, { newline: '\r\n' });
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pharma-ninja-questions-${istDate()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
