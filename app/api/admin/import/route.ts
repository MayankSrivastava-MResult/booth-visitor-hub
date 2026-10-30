/* POST /api/admin/import {csv: "<file text>"} | {xlsx: "<base64>"}   (admin) pre-seed visitors from the
 * organisers' list (an Excel file: its first sheet).
 * Header row required; columns are matched by name, in any order, others ignored:
 *   Full name (or Name, or First name + Last name), Company (or Organisation),
 *   Job title (or Title, Designation), Email, Mobile (or Phone), LinkedIn
 * Name and company are required. An optional value that is not valid (e.g. a malformed
 * mobile number) is left out and the row is still added. People already in the Hub
 * (same email, or same name and company) are skipped.
 * Imported visitors have no consent recorded until a team member completes their registration.
 * → 200 {added, alreadyThere, skipped:[{row, reasons[]}], cleared:[{row, fields[]}]} | 400 {error} */
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { importVisitors } from '@/lib/data/visitors';
import { error, json, readJson } from '@/lib/http';
import { importRowSchema, type ImportRow } from '@/lib/validation';

const COLUMNS: Record<string, keyof ImportRow | 'firstName' | 'lastName'> = {
  fullname: 'fullName', name: 'fullName', participantname: 'fullName', delegatename: 'fullName', attendeename: 'fullName',
  firstname: 'firstName', lastname: 'lastName', surname: 'lastName',
  company: 'company', companyname: 'company', organisation: 'company', organization: 'company', organisationname: 'company', organizationname: 'company',
  jobtitle: 'jobTitle', title: 'jobTitle', designation: 'jobTitle', position: 'jobTitle', role: 'jobTitle',
  email: 'email', emailaddress: 'email', workemail: 'email', emailid: 'email',
  mobile: 'mobile', mobilenumber: 'mobile', phone: 'mobile', phonenumber: 'mobile', contactnumber: 'mobile',
  linkedin: 'linkedinUrl', linkedinurl: 'linkedinUrl', linkedinprofile: 'linkedinUrl',
};
const OPTIONAL = new Set(['jobTitle', 'email', 'mobile', 'linkedinUrl']);
const FIELD_LABEL: Record<string, string> = { jobTitle: 'job title', email: 'email', mobile: 'mobile', linkedinUrl: 'LinkedIn' };

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const body = await readJson(req, 4 * 1024 * 1024) as { csv?: unknown; xlsx?: unknown } | undefined;
  let table: string[][];
  if (typeof body?.csv === 'string') {
    table = Papa.parse<string[]>(body.csv.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' }).data;
  } else if (typeof body?.xlsx === 'string') {
    const t = await readSheet(body.xlsx);
    if (!t) return error(400, 'That Excel file could not be read. Save it as .xlsx or CSV and try again.');
    table = t;
  } else return error(400, 'Choose a CSV or Excel file (max 3 MB).');
  const [header, ...rows] = table;
  const cols = (header ?? []).map((h) => COLUMNS[h.toLowerCase().replace(/[^a-z]/g, '')]);
  const has = (k: string) => cols.includes(k as never);
  if (!(has('fullName') || has('firstName')) || !has('company')) {
    return error(400, 'The first row must name the columns, including Full name (or First name and Last name) and Company.');
  }
  if (!rows.length) return error(400, 'The file has a header but no rows.');
  if (rows.length > 5000) return error(400, 'Too many rows (max 5000).');

  const valid: ImportRow[] = [];
  const skipped: { row: number; reasons: string[] }[] = [];
  const cleared: { row: number; fields: string[] }[] = [];
  rows.forEach((cells, i) => {
    const row = i + 2;   // spreadsheet row number (the header is row 1)
    const rec: Record<string, string> = {};
    cols.forEach((k, j) => { if (k && cells[j]?.trim() && !rec[k]) rec[k] = cells[j].trim(); });
    if (!rec.fullName && (rec.firstName || rec.lastName)) rec.fullName = [rec.firstName, rec.lastName].filter(Boolean).join(' ');
    delete rec.firstName; delete rec.lastName;

    let p = importRowSchema.safeParse(rec);
    const bad = p.success ? [] : [...new Set(p.error.issues.map((x) => String(x.path[0])))];
    if (!p.success && bad.every((f) => OPTIONAL.has(f))) {
      bad.forEach((f) => delete rec[f]);
      p = importRowSchema.safeParse(rec);
      if (p.success) cleared.push({ row, fields: bad.map((f) => FIELD_LABEL[f]) });
    }
    if (p.success) valid.push(p.data);
    else skipped.push({ row, reasons: p.error.issues.map((x) => x.message) });
  });

  const added = valid.length ? await importVisitors(g.user, valid) : 0;
  return json({ added, alreadyThere: valid.length - added, skipped, cleared });
}

/** The first worksheet of an .xlsx file as rows of text; blank rows dropped. */
async function readSheet(base64: string): Promise<string[][] | null> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(base64, 'base64') as never);
    const ws = wb.worksheets[0];
    if (!ws) return null;
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(r.getCell(c).text ?? '');
      if (cells.some((x) => x.trim())) out.push(cells);
    });
    return out;
  } catch {
    return null;
  }
}
