/* Excel export (admin). One workbook with these sheets:
 *   Visitors, Conversations, Podcast guests, Demos, Other notes, Game rounds,
 *   Game plays, Unmatched badge IDs.
 * Optional date filter = IST calendar days, inclusive. With a filter, the
 * Visitors sheet lists everyone registered OR with any touchpoint in the
 * range, and its counts cover that range. All times are shown in IST. */
import ExcelJS from 'exceljs';
import { asUser, type Tx } from '../db';
import type { SessionUser } from '../session';
import { istRange } from '../time';

type Col = { header: string; key: string; width?: number };
type Row = Record<string, unknown>;

const IST = (col: string) => `to_char(${col} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`;

async function queries(tx: Tx, start: Date | null, end: Date | null) {
  // Every query takes the same two parameters: $1 = range start, $2 = range end (either may be null).
  // Only fixed column names are interpolated into the SQL text, never user input.
  const q = (text: string) => tx.unsafe<Row[]>(text, [start, end] as never[]);
  const R = (col: string) => `(($1::timestamptz is null or ${col} >= $1::timestamptz) and ($2::timestamptz is null or ${col} < $2::timestamptz))`;

  const visitors = await q(`
    with iv as (select * from hub.interactions i where ${R('i.occurred_at')}),
         gr as (select * from hub.game_rounds g where ${R('g.played_at')})
    select v.badge_id, v.full_name, v.company, v.job_title, v.email, v.mobile, v.linkedin_url,
           case when v.consent_given then 'yes' else 'no' end as consent, v.consent_version, ${IST('v.consent_at')} as consent_at,
           case when v.marketing_opt_in then 'yes' else 'no' end as marketing_opt_in,
           ${IST('v.created_at')} as registered_at, v.registration_mode,
           coalesce(cb.display_name, 'self (QR)') as created_by,
           (select count(*) from iv where iv.badge_id = v.badge_id and iv.type = 'conversation')::int as conversations,
           (select count(*) from iv where iv.badge_id = v.badge_id and iv.type = 'podcast')::int as podcast,
           (select count(*) from iv where iv.badge_id = v.badge_id and iv.type = 'demo')::int as demos,
           (select count(*) from iv where iv.badge_id = v.badge_id and iv.type = 'other')::int as other_notes,
           (select count(*) from gr where gr.badge_id = v.badge_id)::int as game_rounds,
           (select max(score) from gr where gr.badge_id = v.badge_id) as best_score,
           (select interest_level from iv where iv.badge_id = v.badge_id and iv.type = 'conversation' order by occurred_at desc limit 1) as latest_interest,
           (select next_step from iv where iv.badge_id = v.badge_id and iv.next_step is not null order by occurred_at desc limit 1) as latest_next_step
    from hub.visitors v left join hub.app_users cb on cb.id = v.created_by
    where ${R('v.created_at')} or exists (select 1 from iv where iv.badge_id = v.badge_id) or exists (select 1 from gr where gr.badge_id = v.badge_id)
    order by v.created_at`);

  const base = (type: string, extra: string) => q(`
    select ${IST('i.occurred_at')} as at, i.badge_id, v.full_name, v.company, v.job_title, ${extra},
           cb.display_name as logged_by
    from hub.interactions i join hub.visitors v on v.badge_id = i.badge_id join hub.app_users cb on cb.id = i.created_by
    left join hub.app_users mb on mb.id = i.met_by left join hub.app_users fo on fo.id = i.follow_up_owner
    where i.type = '${type}' and ${R('i.occurred_at')}
    order by i.occurred_at`);

  const conversations = await base('conversation', `mb.display_name as met_by, i.problem_statement,
    array_to_string(i.domain_tags, ', ') as domain_tags, i.interest_level, i.next_step, fo.display_name as follow_up_owner,
    to_char(i.follow_up_date, 'YYYY-MM-DD') as follow_up_date`);
  const podcast = await base('podcast', `v.linkedin_url, i.podcast_topic as topic,
    case when i.podcast_consent_signed then 'yes' else 'no' end as consent_form_signed, i.notes`);
  const demos = await base('demo', `i.demo_name as demo, i.notes`);
  const other = await base('other', `i.notes`);

  const rounds = await q(`
    select ${IST('g.played_at')} as played_at, g.round_id, g.display_name, g.badge_id,
           case when g.badge_confirmed then 'yes' else 'no' end as badge_confirmed,
           case when g.badge_id is null then '' when v.badge_id is null then 'no' else 'yes' end as registered,
           v.full_name, coalesce(d.name, g.domain_id) as domain, g.score, g.questions, g.correct, g.longest_streak, g.end_reason,
           sb.display_name as sent_by, ${IST('g.received_at')} as synced_at
    from hub.game_rounds g left join hub.visitors v on v.badge_id = g.badge_id
    left join hub.domains d on d.id = g.domain_id left join hub.app_users sb on sb.id = g.created_by
    where ${R('g.played_at')}
    order by g.played_at`);

  const plays = await q(`
    select ${IST('p.played_at')} as played_at, p.round_id, g.display_name, g.badge_id, coalesce(d.name, g.domain_id) as domain,
           p.seq + 1 as question_no, p.question_id, p.question_text, p.result, p.ms_to_slice, g.score as round_score
    from hub.game_plays p join hub.game_rounds g on g.round_id = p.round_id left join hub.domains d on d.id = g.domain_id
    where ${R('g.played_at')}
    order by g.played_at, p.seq`);

  const unmatched = await q(`
    select g.badge_id, count(*)::int as rounds, string_agg(distinct g.display_name, ', ') as display_names,
           max(g.score) as best_score, ${IST('min(g.played_at)')} as first_played, ${IST('max(g.played_at)')} as last_played
    from hub.game_rounds g
    where g.badge_id is not null and not exists (select 1 from hub.visitors v where v.badge_id = g.badge_id) and ${R('g.played_at')}
    group by g.badge_id
    order by min(g.played_at)`);

  return { visitors, conversations, podcast, demos, other, rounds, plays, unmatched };
}

const c = (header: string, key: string, width = 16): Col => ({ header, key, width });
const WHO = [c('Badge ID', 'badge_id', 14), c('Name', 'full_name', 22), c('Company', 'company', 22), c('Job title', 'job_title', 22)];

export async function buildExport(admin: SessionUser, from?: string | null, to?: string | null): Promise<Buffer> {
  const { start, end } = istRange(from, to);
  const d = await asUser(admin, (tx) => queries(tx, start, end));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MResult Booth Hub';
  wb.created = new Date();
  const sheet = (name: string, cols: Col[], rows: Row[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols;
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  };

  sheet('Visitors', [...WHO, c('Email', 'email', 26), c('Mobile', 'mobile'), c('LinkedIn', 'linkedin_url', 30),
    c('Consent', 'consent', 9), c('Consent version', 'consent_version', 9), c('Consent at (IST)', 'consent_at'),
    c('Marketing opt-in', 'marketing_opt_in', 9), c('Registered at (IST)', 'registered_at'), c('Registration', 'registration_mode', 10),
    c('Created by', 'created_by'), c('Conversations', 'conversations', 9), c('Podcast', 'podcast', 9), c('Demos', 'demos', 9),
    c('Other notes', 'other_notes', 9), c('Game rounds', 'game_rounds', 9), c('Best game score', 'best_score', 10),
    c('Latest interest', 'latest_interest', 10), c('Latest next step', 'latest_next_step', 30)], d.visitors);
  sheet('Conversations', [c('When (IST)', 'at'), ...WHO, c('Met by', 'met_by'), c('Problem statement', 'problem_statement', 40),
    c('Domain tags', 'domain_tags', 24), c('Interest', 'interest_level', 9), c('Next step', 'next_step', 30),
    c('Follow-up owner', 'follow_up_owner'), c('Follow-up date', 'follow_up_date', 12), c('Logged by', 'logged_by')], d.conversations);
  sheet('Podcast guests', [c('When (IST)', 'at'), ...WHO, c('LinkedIn', 'linkedin_url', 30), c('Topic', 'topic', 28),
    c('Consent form signed', 'consent_form_signed', 10), c('Notes', 'notes', 40), c('Logged by', 'logged_by')], d.podcast);
  sheet('Demos', [c('When (IST)', 'at'), ...WHO, c('Demo', 'demo', 28), c('Notes', 'notes', 40), c('Logged by', 'logged_by')], d.demos);
  sheet('Other notes', [c('When (IST)', 'at'), ...WHO, c('Note', 'notes', 60), c('Logged by', 'logged_by')], d.other);
  sheet('Game rounds', [c('Played at (IST)', 'played_at'), c('Round ID', 'round_id', 14), c('Display name', 'display_name'),
    c('Badge ID', 'badge_id', 14), c('Badge confirmed', 'badge_confirmed', 9), c('Registered', 'registered', 9), c('Visitor name', 'full_name', 22),
    c('Domain', 'domain', 22), c('Score', 'score', 9), c('Questions', 'questions', 9), c('Correct', 'correct', 9),
    c('Longest streak', 'longest_streak', 9), c('End reason', 'end_reason', 10), c('Sent by (account)', 'sent_by'), c('Synced at (IST)', 'synced_at')], d.rounds);
  sheet('Game plays', [c('Played at (IST)', 'played_at'), c('Round ID', 'round_id', 14), c('Display name', 'display_name'),
    c('Badge ID', 'badge_id', 14), c('Domain', 'domain', 22), c('Question no.', 'question_no', 9), c('Question ID', 'question_id', 12),
    c('Question', 'question_text', 50), c('Result', 'result', 10), c('ms to slice', 'ms_to_slice', 10), c('Round score', 'round_score', 10)], d.plays);
  sheet('Unmatched badge IDs', [c('Badge ID', 'badge_id', 14), c('Rounds', 'rounds', 9), c('Display names', 'display_names', 30),
    c('Best score', 'best_score', 10), c('First played (IST)', 'first_played'), c('Last played (IST)', 'last_played')], d.unmatched);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
