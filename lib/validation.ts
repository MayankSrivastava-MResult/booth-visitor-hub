/* Input validation for everything the API accepts. The database has CHECK
 * constraints as a backstop, but these give friendly per-field messages. */
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from './password';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A visitor is identified by their email address, stored trimmed and lower-case. */
export const normaliseEmail = (s: string) => s.trim().toLowerCase();
export const looksLikeEmail = (s: string) => EMAIL_RE.test(s) && s.length <= 254;

/** Visitor email from a URL segment (decoded at most once, normalised, length-capped). */
export function emailFromParam(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* already decoded */ }
  return normaliseEmail(s).slice(0, 254);
}

const required = (label: string, max: number) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long (max ${max}).`);

const optionalText = (max: number) =>
  z.string().trim().max(max, `Too long (max ${max}).`).optional().nullable().transform((v) => (v ? v : null));

const email = z.string({ error: 'Email is required.' }).transform(normaliseEmail)
  .refine((v) => v.length > 0, 'Email is required.')
  .refine(looksLikeEmail, 'Enter a valid email address.');

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

/** Visitor registration (public form and staff-assisted). The email is the visitor's identity. */
export function registrationSchema() {
  return z.object({
    email,
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

/** Admin edit of a visitor (consent fields are not editable; a changed email moves the whole record). */
export function visitorEditSchema() {
  return registrationSchema().omit({ consent: true, consentVersion: true, marketingOptIn: true })
    .extend({ marketingOptIn: z.boolean() });
}

const uuid = z.string().regex(UUID_RE, 'Pick a team member.');
const visitorRef = z.string({ error: 'Pick a visitor.' }).transform(normaliseEmail).refine(looksLikeEmail, 'Pick a visitor.');

/** Log interaction: one shape per type. */
export const interactionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('conversation'),
    visitorEmail: visitorRef,
    metBy: uuid,
    problemStatement: optionalText(4000),
    domainTags: z.array(z.string().trim().min(1).max(60)).max(20).optional().default([]),
    interestLevel: z.enum(['hot', 'warm', 'cold'], { error: 'Pick Hot, Warm or Cold.' }),
    nextStep: optionalText(1000),
    followUpOwner: uuid.optional().nullable().transform((v) => v ?? null),
    followUpDate: z.string().regex(DATE_RE, 'Use a valid date.').optional().nullable().or(z.literal('')).transform((v) => v || null),
  }),
  z.object({
    type: z.literal('podcast'),
    visitorEmail: visitorRef,
    podcastTopic: required('Topic', 200),
    notes: optionalText(4000),
    podcastConsentSigned: z.boolean({ error: 'Say whether the consent form is signed.' }),
  }),
  z.object({
    type: z.literal('demo'),
    visitorEmail: visitorRef,
    demoName: required('Demo', 200),
    notes: optionalText(4000),
  }),
  z.object({
    type: z.literal('other'),
    visitorEmail: visitorRef,
    notes: required('Note', 4000),
  }),
]);
export type InteractionInput = z.infer<typeof interactionSchema>;

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
