/* Input validation for everything the API accepts. The database has CHECK
 * constraints as a backstop, but these give friendly per-field messages. */
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from './password';
import { minutesEmpty, sanitizeMinutes } from './rich-text';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Emails are stored trimmed and lower-case. */
export const normaliseEmail = (s: string) => s.trim().toLowerCase();
export const looksLikeEmail = (s: string) => EMAIL_RE.test(s) && s.length <= 254;
export const isUuid = (s: string) => UUID_RE.test(s);

const required = (label: string, max: number) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long (max ${max}).`);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Too long (max ${max}).`).optional().nullable().transform((v) => (v ? v : null));

const email = z.string({ error: 'Email is required.' }).transform(normaliseEmail)
  .refine((v) => v.length > 0, 'Email is required.')
  .refine(looksLikeEmail, 'Enter a valid email address.');

/** A visitor's email is optional (the organisers' list has none); unique when given. */
const optionalEmail = z.string().optional().nullable().transform((v) => (v?.trim() ? normaliseEmail(v) : null))
  .refine((v) => v === null || looksLikeEmail(v), 'Enter a valid email address, or leave it empty.');

const mobile = z.string().trim().optional().nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || (/^\+?[0-9 ()-]{6,24}$/.test(v) && v.replace(/\D/g, '').length >= 6 && v.replace(/\D/g, '').length <= 15),
    'Enter a valid mobile number.');

/** LinkedIn profile URL; accepts "linkedin.com/in/…" without https:// and stores the full https URL. */
const linkedin = z.string().trim().max(300).optional().nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) throw new Error();
      u.protocol = 'https:';
      return u.toString();
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a LinkedIn profile link (linkedin.com/…).' });
      return z.NEVER;
    }
  });

export type RegistrationConfig = { consentVersion: number; noticeText: string; marketingText: string };

/** Visitor registration (public form, staff-assisted, and completing a pre-seeded visitor). */
export function registrationSchema() {
  return z.object({
    email: optionalEmail,
    fullName: required('Full name', 120),
    company: required('Company', 120),
    jobTitle: required('Job title', 120),
    mobile,
    linkedinUrl: linkedin,
    consent: z.literal(true, { error: 'Please tick the box to agree.' }),
    marketingOptIn: z.boolean().optional().default(false),
    consentVersion: z.number().int(),
  });
}
export type Registration = z.infer<ReturnType<typeof registrationSchema>>;

/** Admin edit of a visitor (consent fields are not editable; a changed email takes the game rounds along).
 *  Job title may be left empty only for someone pre-seeded without one (otherwise the current one is kept). */
export function visitorEditSchema() {
  return registrationSchema().omit({ consent: true, consentVersion: true, marketingOptIn: true })
    .extend({ jobTitle: optionalText(120), marketingOptIn: z.boolean() });
}
export type VisitorEdit = z.infer<ReturnType<typeof visitorEditSchema>>;

const uuid = z.string().regex(UUID_RE, 'Pick a team member.');
const visitorRef = z.string({ error: 'Pick a visitor.' }).regex(UUID_RE, 'Pick a visitor.');

/** Log interaction: one shape per type. */
export const interactionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('conversation'),
    visitorId: visitorRef,
    metBy: uuid,
    problemStatement: optionalText(4000),
    domainTags: z.array(z.string().trim().min(1).max(60)).max(20).optional().default([]),
    // optional: a conversation is saved while it is typed, and the interest is often picked last
    interestLevel: z.enum(['hot', 'warm', 'cold'], { error: 'Pick Hot, Warm or Cold.' }).optional().nullable().transform((v) => v ?? null),
    minutes: z.string().max(60000, 'Minutes are too long.').optional().nullable()
      .transform((v) => (v && !minutesEmpty(v) ? sanitizeMinutes(v) : null))
      .refine((v) => v === null || v.length <= 20000, 'Minutes are too long (about 20,000 characters max).'),
    nextStep: optionalText(1000),
    followUpOwner: uuid.optional().nullable().transform((v) => v ?? null),
    followUpDate: z.string().regex(DATE_RE, 'Use a valid date.').optional().nullable().or(z.literal('')).transform((v) => v || null),
  }),
  z.object({
    type: z.literal('podcast'),
    visitorId: visitorRef,
    podcastTopic: required('Topic', 200),
    notes: optionalText(4000),
    podcastConsentSigned: z.boolean({ error: 'Say whether the consent form is signed.' }),
  }),
  z.object({
    type: z.literal('demo'),
    visitorId: visitorRef,
    demoName: required('Demo', 200),
    notes: optionalText(4000),
  }),
  z.object({
    type: z.literal('other'),
    visitorId: visitorRef,
    notes: required('Note', 4000),
  }),
]);
export type InteractionInput = z.infer<typeof interactionSchema>;

/** A follow-up date must be today or later (IST). `keep` = a date already stored, which an edit may leave as it is. */
export function followUpDateError(i: InteractionInput, today: string, keep: string | null = null): Record<string, string> | null {
  if (i.type !== 'conversation' || !i.followUpDate || i.followUpDate >= today || i.followUpDate === keep) return null;
  return { followUpDate: 'Pick today or a later date.' };
}

/** User management. */
export const newUserSchema = z.object({
  email: email.transform((v) => v.toLowerCase()),
  displayName: required('Name', 80),
  role: z.enum(['admin', 'staff', 'game']),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});
export const editUserSchema = z.object({
  displayName: required('Name', 80).optional(),
  role: z.enum(['admin', 'staff', 'game']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`).max(200).optional(),
});

/** Admin settings. */
const listOfNames = z.array(z.string().trim().min(1).max(200)).max(50)
  .transform((a) => Array.from(new Set(a)));
export const settingsSchema = z.object({
  noticeText: required('Consent notice', 3000),
  marketingText: required('Marketing consent text', 1000),
  podcastTopics: listOfNames,
  demos: listOfNames,
});

export const isoDate = z.string().regex(DATE_RE);

/** One row of the pre-seed import (the organisers' list): name and company required. */
export const importRowSchema = z.object({
  fullName: required('Full name', 120),
  company: required('Company', 120),
  jobTitle: optionalText(120),
  email: optionalEmail,
  mobile,
  linkedinUrl: linkedin,
});
export type ImportRow = z.infer<typeof importRowSchema>;
