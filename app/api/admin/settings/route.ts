/* GET /api/admin/settings → {badgePattern, badgeHint, consentVersion, noticeText, marketingText, podcastTopics[], demos[]}  (admin)
 * PUT /api/admin/settings  same fields (minus consentVersion) → 200 {consentVersion}
 * Changing either consent text creates a new consent version. */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getSettings, saveSettings } from '@/lib/data/team';
import { error, json, readJson, zodFields } from '@/lib/http';
import { settingsSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json(await getSettings(g.user));
}

export async function PUT(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const parsed = settingsSchema.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  return json({ consentVersion: await saveSettings(g.user, parsed.data) });
}
