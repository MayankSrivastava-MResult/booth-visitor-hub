/* Parses admin request bodies for domains and questions into the typed
 * shapes, then applies the game's content rules (lib/questions.ts). */
import { z } from 'zod';
import type { DomainInput, QuestionInput } from './questions';

const str = (max: number) => z.string().max(max * 4).transform((s) => s.trim());

export const domainBody = z.object({
  id: z.string().trim().toLowerCase(),
  name: str(40), description: str(80), iconKey: z.string(), accent: z.string().trim(),
  enabled: z.boolean(), sortOrder: z.number().int(),
}) satisfies z.ZodType<DomainInput, unknown>;

export const questionBody = z.object({
  id: z.string().trim(),
  domainId: z.string().trim(),
  questionText: str(120),
  options: z.array(z.string().max(200).transform((s) => s.trim())).max(5),
  correctIndex: z.number().int(),
  difficulty: z.number().int(),
  explanation: str(1000).optional().default(''),
  source: str(200).optional().default(''),
  enabled: z.boolean(),
}).transform((q) => ({ ...q, options: q.options[4] === '' ? q.options.slice(0, 4) : q.options })) satisfies z.ZodType<QuestionInput, unknown>;
