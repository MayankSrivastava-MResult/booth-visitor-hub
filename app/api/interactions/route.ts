/* POST /api/interactions: log a conversation, podcast guest, demo or note (staff, admin).
 * Body by type:
 *   conversation {badgeId, metBy, problemStatement?, domainTags[], interestLevel, nextStep?, followUpOwner?, followUpDate?}
 *   podcast      {badgeId, podcastTopic, notes?, podcastConsentSigned}
 *   demo         {badgeId, demoName, notes?}
 *   other        {badgeId, notes}
 * 201 {id} | 404 {error, notRegistered:true} | 400 {error, fields} */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { createInteraction } from '@/lib/data/interactions';
import { checkLists } from '@/lib/data/lists';
import { domainTagOptions, getSettings } from '@/lib/data/team';
import { error, json, readJson, zodFields } from '@/lib/http';
import { interactionSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const parsed = interactionSchema.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));

  const [settings, domainTags] = await Promise.all([getSettings(g.user), domainTagOptions(g.user)]);
  const listErr = checkLists(parsed.data, { podcastTopics: settings.podcastTopics, demos: settings.demos, domainTags });
  if (listErr) return error(400, 'Please check the highlighted fields.', listErr);

  const result = await createInteraction(g.user, parsed.data);
  if (!result.ok) return json({ error: 'This badge is not registered yet.', notRegistered: true }, 404);
  return json({ id: result.id }, 201);
}
