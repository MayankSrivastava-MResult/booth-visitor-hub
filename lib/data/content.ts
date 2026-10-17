/* Game content admin: domains and questions (admin only; enforced here and by RLS).
 * Ids never change once created: game devices and synced rounds refer to them. */
import { asUser, pgCode, PG } from '../db';
import type { DomainInput, QuestionInput } from '../questions';
import type { SessionUser } from '../session';

export type Domain = DomainInput & { questionCount: number; enabledQuestionCount: number };

export async function listDomains(user: SessionUser): Promise<Domain[]> {
  return asUser(user, (tx) => tx<Domain[]>`
    select d.id, d.name, d.description, d.icon_key as "iconKey", d.accent, d.enabled, d.sort_order as "sortOrder",
           (select count(*)::int from hub.questions q where q.domain_id = d.id) as "questionCount",
           (select count(*)::int from hub.questions q where q.domain_id = d.id and q.enabled) as "enabledQuestionCount"
    from hub.domains d order by d.sort_order, d.id`);
}

export async function domainIds(user: SessionUser): Promise<Set<string>> {
  const rows = await asUser(user, (tx) => tx<{ id: string }[]>`select id from hub.domains`);
  return new Set(rows.map((r) => r.id));
}

export async function createDomain(user: SessionUser, d: DomainInput): Promise<'ok' | 'exists'> {
  try {
    await asUser(user, (tx) => tx`
      insert into hub.domains (id, name, description, icon_key, accent, enabled, sort_order, created_by)
      values (${d.id}, ${d.name}, ${d.description}, ${d.iconKey}, ${d.accent.toUpperCase()}, ${d.enabled}, ${d.sortOrder}, ${user.id})`);
    return 'ok';
  } catch (e) {
    if (pgCode(e) === PG.uniqueViolation) return 'exists';
    throw e;
  }
}

export async function updateDomain(user: SessionUser, id: string, d: Omit<DomainInput, 'id'>): Promise<boolean> {
  const rows = await asUser(user, (tx) => tx`
    update hub.domains set name = ${d.name}, description = ${d.description}, icon_key = ${d.iconKey},
      accent = ${d.accent.toUpperCase()}, enabled = ${d.enabled}, sort_order = ${d.sortOrder}, updated_by = ${user.id}
    where id = ${id} returning id`);
  return rows.length === 1;
}

/** A domain can only be deleted once it has no questions (disable it instead to hide it). */
export async function deleteDomain(user: SessionUser, id: string): Promise<'ok' | 'not_found' | 'has_questions'> {
  try {
    const rows = await asUser(user, (tx) => tx`delete from hub.domains where id = ${id} returning id`);
    return rows.length ? 'ok' : 'not_found';
  } catch (e) {
    if (pgCode(e) === PG.foreignKeyViolation) return 'has_questions';
    throw e;
  }
}

export async function listQuestions(user: SessionUser, domainId?: string | null): Promise<QuestionInput[]> {
  return asUser(user, (tx) => tx<QuestionInput[]>`
    select q.id, q.domain_id as "domainId", q.question_text as "questionText", q.options, q.correct_index as "correctIndex",
           q.difficulty, q.explanation, q.source, q.enabled
    from hub.questions q
    left join hub.domains d on d.id = q.domain_id
    where ${!domainId} or q.domain_id = ${domainId ?? ''}
    order by d.sort_order, q.domain_id, q.difficulty, q.id`);
}

export async function createQuestion(user: SessionUser, q: QuestionInput): Promise<'ok' | 'exists'> {
  try {
    await asUser(user, (tx) => tx`
      insert into hub.questions (id, domain_id, question_text, options, correct_index, difficulty, explanation, source, enabled, created_by)
      values (${q.id}, ${q.domainId}, ${q.questionText}, ${tx.array(q.options)}::text[], ${q.correctIndex}, ${q.difficulty},
              ${q.explanation}, ${q.source}, ${q.enabled}, ${user.id})`);
    return 'ok';
  } catch (e) {
    if (pgCode(e) === PG.uniqueViolation) return 'exists';
    throw e;
  }
}

export async function updateQuestion(user: SessionUser, id: string, q: QuestionInput): Promise<boolean> {
  const rows = await asUser(user, (tx) => tx`
    update hub.questions set domain_id = ${q.domainId}, question_text = ${q.questionText}, options = ${tx.array(q.options)}::text[],
      correct_index = ${q.correctIndex}, difficulty = ${q.difficulty}, explanation = ${q.explanation}, source = ${q.source},
      enabled = ${q.enabled}, updated_by = ${user.id}
    where id = ${id} returning id`);
  return rows.length === 1;
}

export async function deleteQuestion(user: SessionUser, id: string): Promise<boolean> {
  const rows = await asUser(user, (tx) => tx`delete from hub.questions where id = ${id} returning id`);
  return rows.length === 1;
}

/** Insert new ids, update existing ones. All rows in one transaction. */
export async function upsertQuestions(user: SessionUser, qs: QuestionInput[]): Promise<{ created: number; updated: number }> {
  return asUser(user, async (tx) => {
    let created = 0, updated = 0;
    for (const q of qs) {
      const [r] = await tx<{ inserted: boolean }[]>`
        insert into hub.questions (id, domain_id, question_text, options, correct_index, difficulty, explanation, source, enabled, created_by)
        values (${q.id}, ${q.domainId}, ${q.questionText}, ${tx.array(q.options)}::text[], ${q.correctIndex}, ${q.difficulty},
                ${q.explanation}, ${q.source}, ${q.enabled}, ${user.id})
        on conflict (id) do update set domain_id = excluded.domain_id, question_text = excluded.question_text,
          options = excluded.options, correct_index = excluded.correct_index, difficulty = excluded.difficulty,
          explanation = excluded.explanation, source = excluded.source, enabled = excluded.enabled, updated_by = ${user.id}
        returning (xmax = 0) as inserted`;
      if (r.inserted) created++; else updated++;
    }
    return { created, updated };
  });
}

/** Questions whose source starts with "TEST" (case-sensitive, like the game's seed rule). */
export async function countTestQuestions(user: SessionUser): Promise<number> {
  const [r] = await asUser(user, (tx) => tx<{ n: number }[]>`select count(*)::int as n from hub.questions where starts_with(source, 'TEST')`);
  return r.n;
}

export async function deleteTestQuestions(user: SessionUser): Promise<number> {
  const rows = await asUser(user, (tx) => tx`delete from hub.questions where starts_with(source, 'TEST') returning id`);
  return rows.length;
}
