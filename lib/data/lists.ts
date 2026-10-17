/* Checks an interaction against the admin-managed pick lists (podcast topics,
 * demos, domain tags). If a list is still empty, free text is accepted so
 * logging is never blocked before the admin has filled it in. */
import type { InteractionInput } from '../validation';

export function checkLists(i: InteractionInput, lists: { podcastTopics: string[]; demos: string[]; domainTags: string[] }): Record<string, string> | null {
  if (i.type === 'podcast' && lists.podcastTopics.length && !lists.podcastTopics.includes(i.podcastTopic))
    return { podcastTopic: 'Pick a topic from the list.' };
  if (i.type === 'demo' && lists.demos.length && !lists.demos.includes(i.demoName))
    return { demoName: 'Pick a demo from the list.' };
  if (i.type === 'conversation' && i.domainTags.some((t) => !lists.domainTags.includes(t)))
    return { domainTags: 'Pick domain tags from the list.' };
  return null;
}
