# Handoff: PHARMA NINJA booth game for MResult — what is built through Milestone 1

## Context & goal
Mayank Srivastava (MResult Technologies, an analytics, technology and consulting firm for life sciences) owns PHARMA NINJA, a Fruit Ninja-style quiz game on a large touch screen for MResult's Gold Sponsor booth (Booth G1) at the Global Pharma Partnering Summit 2026, Hyderabad, 2–3 November 2026, with setup on 1 November. Players slice falling answer capsules. The game's job is to draw people into the booth, hold them there, and show which domains they care about and how much they know, so the team can follow up. MResult attends as one firm: nothing is framed around any internal business unit. The game evolves a prototype by Mayank's colleague Darshan (Pharma_Ninja_Code.txt, a single-file vanilla-JS "Clinical Ops Hub" tap quiz). The user wrote a detailed brief with locked decisions and four checkpoints. Checkpoint 1 (review and visual direction) and Milestone 2 in the brief's numbering, the "Wednesday prototype", are done. In this document the Wednesday prototype is called **Milestone 1**, as in the conversation; the brief's task list numbers it step 2. The user now wants this handoff for a "prompt builder" chat.

**Before anything else:** ask the user to attach their original brief (the `<context>`, `<starting_point>`, `<locked_decisions>`, `<design_direction>`, `<task>`, `<constraints>` and `<done_when>` document). It is the source of truth and is not reproduced in full here.

## Key decisions made (do not reopen)
From the brief (locked):
- **Round and questions:** one domain per round, 75 s round, 3 lives. One question at a time, pinned at the top. 4–5 options fall as two-tone capsules, staggered. Questions come in difficulty order 1→3, shuffled within each level, with no repeats in a round.
- **Scoring:** base 100 points, decaying linearly with fall progress, floor 20. Streak multiplier: ×1.5 after 3 correct in a row, ×2 after 5. A wrong slice costs 1 life. If every capsule falls unsliced, there is no penalty, the streak resets, and the next question comes.
- **Slicing:** detected from pointer trails with a minimum swipe velocity, so taps don't count.
- **Attract mode:** after 30 s idle, a demo loop runs with the live leaderboard and "Touch to play".
- **Leaderboard:** live top 10 for today, by display name only. It resets by calendar date in Asia/Kolkata time. History is kept for export.
- **Visitor identity:** an optional external visitorId, from a URL parameter or a field on the name-entry screen. Lead capture is a separate system.
- **Name entry:** uses a built-in on-screen keyboard.
- **Data-driven content:** domains and questions are managed through an admin screen.
- **Admin access:** behind a PIN, opened by long-pressing the top-left corner for 3 s.
- **Validation:** exactly one correct option; 4–5 options; each option ≤ 4 words AND ≤ 28 characters; question text about 120 characters at most.
- **Exports:** CSV import/export of the question bank; CSV export of leaderboard history and a play log (timestamp, displayName, visitorId, domain, questionId, correct/incorrect/missed, ms-to-slice, round score).
- **Sound:** music and effects generated with the Web Audio API, no audio files. Admin controls cover music, effects and a QUIET MODE that mutes everything instantly.
- **Offline:** must run with zero network: IndexedDB with a localStorage fallback, and no Google Fonts at runtime.
- **Screen and input:** primary target is a large landscape touch screen whose top edge is at most 6 ft from the floor; layout must also adapt to other sizes and portrait. Pointer Events throughout.
- **Tech:** Phaser 3 at a pinned exact version, in a single self-contained HTML file.
- **Scope:** no features, game modes, analytics, accounts or network calls beyond the brief.
- **Domains (8):** Clinical Trials; Quality & Compliance; Manufacturing & Supply; R&D & Lab Science; GenAI & Agents; Data & Cloud; Pharma Business; India & Global Pharma.
- **Test content:** Darshan's 10 questions, shortened, are the Clinical Trials test content. Every other domain gets 5 general-knowledge test questions. Every test question's source starts with "TEST". Never reference any company's clients or confidential material.

Settled in conversation (user approved each):
- **Fonts:** Barlow Condensed (display, scores, capsules) and Barlow (questions and UI), both SIL OFL and embedded in the file.
- **Domain accents:** each domain has its own accent colour, used only on capsule caps and icon rings. All UI chrome, trails, bursts and calls to action stay brand orange #F7943E on a charcoal #1F1F1F stage.
- **Capsules:** 520×100 px at 1080p, fixed width, tilted at most ±8°. The longest allowed answer wraps to two lines.
- **Question text:** 50 px, stepping down to 46 px (the code allows down to 36 px) so the question card stays above the play zone.
- **Logo:** the user supplied Mresult.png (200×150). A reversed version (white and grey on charcoal, orange kept) is used. The user still needs to supply an SVG or high-resolution logo before the event build.
- **First slice ends the question,** right or wrong. If one swipe crosses two capsules, the first one it touches counts.
- **Empty pool:** the round ends when the domain's questions run out. Content writers should provide at least 20 enabled questions per domain.
- **Multiplier timing:** ×1.5 from the 4th correct in a row, ×2 from the 6th.
- **One leaderboard row per display name:** each name shows its best score of the day, matched case-insensitively.
- **Offensive names:** an offline name blocklist was added (done in Milestone 1), and an admin "remove leaderboard entry" will come in Milestone 2.
- **Phaser:** Phaser 3 was confirmed (pinned 3.90.0, inlined), not plain Canvas.
- **Darshan's sad-emoji rain is replaced** by the mascot's "Oops" face: emoji render differently by OS and can show as boxes on a locked-down kiosk.
- **Explanations appear only on the results review,** not after each answer as in Darshan's code. His light/dark theme is dropped (dark stage only). His streak callout used to appear at 2 in a row; it now appears at 3.
- **Difficulty levels for the Clinical Trials questions:** level 1 = ct-03, ct-06, ct-09, ct-10; level 2 = ct-04, ct-07, ct-08; level 3 = ct-01, ct-02, ct-05. The user approved the shortened questions and these levels.

## Current state
**Done:**
1. **Checkpoint 1 visual direction.** A Design artifact at https://claude.ai/artifact/2bsijUXc6MNQLKwhKYW7nR with 7 boards:
   - Identity (wordmark, mascot in ready / cheer / sad moods, palette, type);
   - Capsules (slice states, trail, streak flourish, 8 domain icons);
   - Attract (with the MResult logo);
   - Domain picker;
   - Gameplay landscape;
   - Results;
   - Gameplay portrait.
2. **Milestone 1 Wednesday prototype** delivered as `pharma-ninja-m1.html` (1.34 MB, one self-contained file). It contains:
   - attract mode with demo loop and leaderboard, plus a fullscreen button;
   - name entry with on-screen keyboard and an optional Visitor ID field (`?visitorId=` or `?vid=` URL parameters prefill it and lock the field);
   - the 8-domain picker;
   - full gameplay: slicing, scoring, streaks, lives, fall speed rising through the round, Web Audio music and effects;
   - results with review, explanations and leaderboard;
   - the live top 10 (best score per name, Asia/Kolkata date);
   - a play log, IndexedDB storage with localStorage fallback, 30 s idle return to attract, and the offline name blocklist;
   - an error handler that returns to attract mode;
   - an admin stub (3 s top-left press, PIN **2026**) with only quiet mode, music on/off and effects on/off. Opening it pauses a running round.

**Architecture of the build:**
- **Layers:** the Phaser canvas draws capsules, slicing, particles, trail and the attract demo. DOM screens sit on top for everything text-heavy.
- **Units:** 1rem = 10 design px on a 1080-px short edge.
- **Rendering:** device-pixel-ratio is capped at 2, with a pixel budget of about 1920×1080×2.25.
- **Source structure:** `src/data.js` (seed data), `src/app.js` (sections: 0 Settings, 1 Brand art, 2 Utilities, 3 Store, 4 Sound, 5 Leaderboard, 6 Stage/Phaser scene, 7 Input, 8 Round, 9 Screens, 10 Admin, 11 Boot & recovery), `src/index.template.html` (HTML/CSS) and `build.py`. The build script inlines Phaser 3.90.0 (`phaser-arcade-physics.min.js`), @fontsource/barlow 5.3.0 and @fontsource/barlow-condensed 5.3.0 WOFF2 (latin), and the logo. It validates every seed question and fails on any external URL.
- **Where the code is:** the unminified app code is inside `pharma-ninja-m1.html` (the last `<script>`). It is not pasted here because of size; ask the user to attach that file if code-level work is needed.
- **Storage:** IndexedDB database `pharma-ninja`, object store `kv`, keys `settings`, `domains`, `questions`, `rounds`, `plays`. Seeds load only on first run on a machine.

**Tested (headless Chromium, network blocked):**
- zero external requests and no page errors;
- the tap / slow-drag velocity gate does not slice;
- scoring decay, ×1.5 on the 4th–5th and ×2 from the 6th, a wrong slice costing a life and resetting the streak, misses with no penalty, difficulty order 1→3, and "domain cleared" ending;
- leaderboard persistence across reload, the URL visitorId being saved, the name filter blocking "fuckface" while allowing "Parsec", the idle return to attract, the admin gesture and PIN, and quiet mode being saved;
- layouts at 1920×1080 and 1080×1920.

**Not verified:** audio by ear (the code runs without errors but nobody has listened to it), and 60 fps on real hardware (the test browser used software rendering). The user is to check both on the Wednesday laptop.

**Changes from the approved designs, made in the build:**
- The wordmark is redrawn at natural glyph proportions (the canvas version stretched them). The design canvas has **not** been updated yet; it is to be synced in Milestone 2.
- "Choose domain" moved into the keyboard's bottom row, because it fell off-screen at 1080p.
- The streak callout shows the multiplier now in effect for the next slice: at 5 in a row it reads ×2, while that 5th slice scored at ×1.5.

**Open / mid-flight:**
- **CSV layout:** proposed (below), with the user asked to lock it so content writers can start. Unanswered.
- **Adding domains and questions:** the user asked how to do this. The answer given: not possible in Milestone 1; it comes with the Milestone 2 admin. Interim options offered were (1) wait for Milestone 2 (recommended), (2) edit the seed file and rebuild, which needs Chrome site data cleared on any machine that has already run the game and wipes its leaderboard, or (3) pull CSV import forward into an interim build. The user hasn't chosen.
- **Wednesday demo feedback:** pending.
- **Each machine keeps its own data;** clearing demo scores currently needs Chrome's "clear site data". A reset button comes in Milestone 2.

**Remaining milestones (from the brief):**
- **Milestone 2, full build:** complete admin (CRUD for domains and questions, validation, CSV import/export, settings, sound controls, quiet mode, play zone, PIN change), the play log export, daily reset (plus a manual reset), the visitorId hook, kiosk hardening, the admin leaderboard-entry removal, and the design canvas wordmark sync.
- **Milestone 3, event build:** one fully offline file plus a one-page setup sheet covering Chrome kiosk launch (including the autoplay flag so music starts without a touch), turning off OS edge-swipe gestures, the touch-over-USB check, a pre-show test checklist and the daily export routine. The user must supply a high-resolution logo for it.

## Work in progress (verbatim)

### Proposed question-bank CSV layout (awaiting the user's confirmation)
One row per question.

| Column | Example |
|---|---|
| id | qc-06 |
| domainId | quality |
| questionText | What does GMP stand for? |
| option1 … option5 | leave option5 empty for 4-option questions |
| correctOption | 1–5 (the option number, not the text) |
| difficulty | 1, 2 or 3 |
| explanation | shown on the results review only |
| source | free text, never shown in game |
| enabled | yes / no |

On import, rows that break a rule are listed with the reason and skipped, not silently loaded. Re-importing a row with an existing `id` updates that question.

### Default settings in the build (`src/app.js`)
```js
var DEFAULT_SETTINGS = {
  roundSeconds: 75,
  lives: 3,
  fallTimeStart: 6.0,     // seconds for a capsule to cross the play zone at round start
  fallTimeEnd: 3.2,       // ... and at round end (fall speed increases through the round)
  playZoneTop: 1 / 3,     // play zone as a fraction of screen height (default: lower two-thirds)
  playZoneBottom: 1.0,
  minSwipeSpeed: 0.5,     // CSS px per ms on a 1080-px short edge; slower moves (and taps) don't slice
  music: true, musicVolume: 0.5,
  effects: true, effectsVolume: 0.8,
  quiet: false,           // mutes everything instantly (podcast recording)
  idleSeconds: 30,        // idle time before returning to attract mode
  pin: '2026',
  maxPixelRatio: 2,       // device-pixel-ratio cap for performance
  leaderboardResetAt: 0   // manual reset timestamp (used by the M2 admin)
};
```

### Seed data in the build (`src/data.js`, complete)
```js
/* =====================================================================
 * SEED DATA
 * Loaded into the browser store only the first time the game runs on a
 * machine. After that, domains and questions live in IndexedDB and are
 * managed through the admin screen (full admin arrives in Milestone 2).
 *
 * Every question here is TEST content. Its `source` starts with "TEST"
 * so the whole set can be bulk-deleted when real content is imported.
 *
 * Question rules (enforced by the build script and, in M2, the admin):
 *   - questionText  <= ~120 characters
 *   - 4 or 5 options, each <= 4 words AND <= 28 characters
 *   - exactly one correctIndex; difficulty 1..3
 *   - explanation is shown on the results review only, never mid-round
 * ===================================================================== */

const SEED_DOMAINS = [
  { id: 'clinical', name: 'Clinical Trials',        desc: 'Protocols, phases, patients and sites',   icon: 'clipboard', accent: '#F7943E', enabled: true },
  { id: 'quality',  name: 'Quality & Compliance',   desc: 'GxP, audits, CAPA and data integrity',    icon: 'shield',    accent: '#5EC2B0', enabled: true },
  { id: 'mfg',      name: 'Manufacturing & Supply', desc: 'Batches, plants and the cold chain',      icon: 'factory',   accent: '#E9C46A', enabled: true },
  { id: 'rnd',      name: 'R&D & Lab Science',      desc: 'Discovery, assays and the lab bench',     icon: 'flask',     accent: '#9AD27A', enabled: true },
  { id: 'genai',    name: 'GenAI & Agents',         desc: 'LLMs, agents and AI in pharma',           icon: 'chip',      accent: '#B794F6', enabled: true },
  { id: 'data',     name: 'Data & Cloud',           desc: 'Pipelines, platforms and analytics',      icon: 'cloud',     accent: '#6FA8F5', enabled: true },
  { id: 'business', name: 'Pharma Business',        desc: 'Launches, markets and commercial',        icon: 'chart',     accent: '#F29BC0', enabled: true },
  { id: 'india',    name: 'India & Global Pharma',  desc: 'Regulators, generics and world markets',  icon: 'globe',     accent: '#F2857A', enabled: true }
];

/* Compact authoring form: [id, domainId, difficulty, question, options, correctIndex, explanation, source] */
const SEED_QUESTION_ROWS = [
  /* ---- Clinical Trials: Darshan's prototype questions, options shortened (correct index unchanged) ---- */
  ['ct-01','clinical',3,'ICH E6(R3), the revised Good Clinical Practice guideline, became effective in the EU on which date?',
    ['1 January 2024','31 January 2025','23 July 2025','1 January 2026'],2,
    'ICH adopted E6(R3) in January 2025, and the EMA set 23 July 2025 as the date it took effect in the EU.','TEST - Darshan prototype'],
  ['ct-02','clinical',3,'By when did trials under the old EU Clinical Trials Directive have to move to the Clinical Trials Regulation (CTR)?',
    ['31 January 2023','31 January 2025','30 June 2025','31 December 2026'],1,
    'The CTR\u2019s three-year transition period ended on 31 January 2025. Any ongoing trial authorised under Directive 2001/20/EC had to be transitioned by then.','TEST - Darshan prototype'],
  ['ct-03','clinical',1,'What is the single EU portal and database used to submit and manage clinical trial applications under the CTR?',
    ['EudraVigilance','CTIS','EudraCT','IRIS'],1,
    'The Clinical Trials Information System (CTIS) is the single entry point for sponsors and regulators under the CTR. EudraCT served the old Directive.','TEST - Darshan prototype'],
  ['ct-04','clinical',2,'In September 2024, the FDA finalised guidance on which topic?',
    ['Decentralized trial elements','Placebo in oncology trials','Electronic informed consent','Single IRB review'],0,
    'FDA\u2019s final guidance \u201cConducting Clinical Trials With Decentralized Elements\u201d covers remote visits, local healthcare providers, direct-to-patient shipping of investigational products, and related oversight.','TEST - Darshan prototype'],
  ['ct-05','clinical',3,'ICH E6(R3) is organised as overarching principles plus annexes. What does Annex 2 address?',
    ['Investigator\u2019s Brochure','Essential records retention','Non-traditional designs','Pharmacovigilance timelines'],2,
    'Annex 1 covers traditional interventional trials. Annex 2 adds considerations for decentralized elements, pragmatic designs and the use of real-world data sources.','TEST - Darshan prototype'],
  ['ct-06','clinical',1,'ICH E6(R3) asks sponsors to build quality in from the start by identifying which of the following?',
    ['Critical to quality factors','Key opinion leaders','Maximum tolerated doses','Site payment milestones'],0,
    'E6(R3) leans on quality by design: identify the factors critical to trial quality, then apply risk-proportionate controls to them rather than monitoring everything equally.','TEST - Darshan prototype'],
  ['ct-07','clinical',2,'Under the US FDORA law of 2022, sponsors of which studies must submit Diversity Action Plans?',
    ['All Phase 1 studies','Phase 3/pivotal studies','Only non-US studies','Only rare-disease studies'],1,
    'FDORA requires Diversity Action Plans for Phase 3 or other pivotal drug and biologic studies and for many device studies, setting enrolment goals by demographic group. FDA issued draft guidance in June 2024.','TEST - Darshan prototype'],
  ['ct-08','clinical',2,'In January 2025, the FDA issued draft guidance on AI to support drug and biologic decisions. What does it propose?',
    ['Ban on AI-generated data','Risk-based credibility','Mandatory open-source models','CDER pre-approves all AI'],1,
    'The draft guidance lays out a risk-based, multi-step framework for establishing the credibility of an AI model for its specific context of use.','TEST - Darshan prototype'],
  ['ct-09','clinical',1,'In June 2025, the FDA rolled out an agency-wide generative AI tool for staff, including reviewers. What is it called?',
    ['Elsa','Sentinel','Atlas','Iris'],0,
    'FDA launched Elsa in June 2025 to help staff with tasks such as summarising information and speeding up reviews. Sentinel is FDA\u2019s long-running safety surveillance system.','TEST - Darshan prototype'],
  ['ct-10','clinical',1,'Which country\u2019s overhauled clinical trial regulations, signed into law in 2025, came into force in April 2026?',
    ['Australia','Canada','United Kingdom','Japan'],2,
    'The UK\u2019s updated clinical trials regulations, overseen by the MHRA, came into force in April 2026 after a 12-month implementation period, aiming for faster, more proportionate approvals.','TEST - Darshan prototype'],

  /* ---- Quality & Compliance ---- */
  ['qc-01','quality',1,'What does GMP stand for?',
    ['Good Manufacturing Practice','General Medical Protocol','Global Marketing Plan','Good Monitoring Process'],0,
    'GMP is the system that ensures medicines are consistently produced and controlled to quality standards.','TEST - seed'],
  ['qc-02','quality',1,'ALCOA principles mainly protect what?',
    ['Patient privacy','Data integrity','Drug pricing','Supply security','Lab safety'],1,
    'Attributable, Legible, Contemporaneous, Original, Accurate: the basis of trustworthy GxP records.','TEST - seed'],
  ['qc-03','quality',2,'Which FDA rule covers electronic records and electronic signatures?',
    ['21 CFR Part 211','ICH Q10','21 CFR Part 11','ISO 13485'],2,
    'Part 11 sets FDA criteria for electronic records and signatures; Part 211 covers GMP for finished pharmaceuticals.','TEST - seed'],
  ['qc-04','quality',2,'In CAPA, what does the \u201cP\u201d stand for?',
    ['Procedural','Primary','Preventive','Product','Planned'],2,
    'Corrective and Preventive Action: fix the cause of a problem and stop it happening again.','TEST - seed'],
  ['qc-05','quality',3,'Which ICH guideline covers quality risk management?',
    ['ICH Q1A','ICH Q9','ICH E6','ICH M7'],1,
    'ICH Q9 sets out principles and tools for quality risk management across the product lifecycle.','TEST - seed'],

  /* ---- Manufacturing & Supply ---- */
  ['ms-01','mfg',1,'Most refrigerated \u201ccold chain\u201d medicines must be kept in which range?',
    ['2 to 8 \u00b0C','\u22125 to 0 \u00b0C','10 to 15 \u00b0C','20 to 25 \u00b0C'],0,
    'Most refrigerated medicines must stay between 2 \u00b0C and 8 \u00b0C from plant to patient.','TEST - seed'],
  ['ms-02','mfg',1,'In drug manufacturing, API stands for Active Pharmaceutical what?',
    ['Inhibitor','Ingredient','Indicator','Isolate'],1,
    'The API is the component that produces the medicine\u2019s intended effect; excipients make up the rest of the dose form.','TEST - seed'],
  ['ms-03','mfg',2,'What is the main purpose of a pharmaceutical cleanroom?',
    ['Speed up packaging','Store finished goods','Control airborne particles','Reduce energy use','Train new operators'],2,
    'Cleanrooms are classified by how many airborne particles they allow, protecting sterile and sensitive products.','TEST - seed'],
  ['ms-04','mfg',2,'Lyophilisation is better known as what?',
    ['Sterile filtration','Freeze-drying','Wet granulation','Tablet coating'],1,
    'Lyophilisation removes water by freezing a product and then sublimating the ice under vacuum, which helps preserve biologics.','TEST - seed'],
  ['ms-05','mfg',3,'Under the EU Falsified Medicines Directive, packs need a unique identifier and what else?',
    ['RFID tag','Hologram sticker','Anti-tamper device','Batch photograph','Pharmacist signature'],2,
    'Since February 2019, most EU prescription packs carry a unique identifier in a 2D code plus an anti-tampering device.','TEST - seed'],

  /* ---- R&D & Lab Science ---- */
  ['rd-01','rnd',1,'What does PCR stand for?',
    ['Protein cell response','Polymerase chain reaction','Primary culture ratio','Peptide chain reading'],1,
    'PCR copies a target DNA sequence millions of times, making tiny samples measurable.','TEST - seed'],
  ['rd-02','rnd',1,'Which molecule carries the genetic instructions in most living things?',
    ['ATP','Insulin','DNA','Collagen','Glucose'],2,
    'DNA stores the genetic instructions used to build and run cells; RNA carries copies of them to make proteins.','TEST - seed'],
  ['rd-03','rnd',2,'Monoclonal antibodies are made by copies of what?',
    ['A single parent cell','Many donor cells','A bacterial virus','A synthetic peptide'],0,
    'Monoclonal antibodies come from clones of one immune cell, so they all bind the same target.','TEST - seed'],
  ['rd-04','rnd',2,'What does CRISPR-Cas9 mainly do?',
    ['Sequences proteins','Edits DNA sequences','Measures blood sugar','Stains tissue slides','Purifies antibodies'],1,
    'Cas9, guided by an RNA sequence, cuts DNA at a chosen spot so genes can be changed, removed or added.','TEST - seed'],
  ['rd-05','rnd',3,'In drug discovery, what does an IC50 value describe?',
    ['Peak blood level','Elimination half-life','Half-maximal inhibition','Lethal dose'],2,
    'IC50 is the concentration of a compound needed to inhibit a biological process by half; lower means more potent.','TEST - seed'],

  /* ---- GenAI & Agents ---- */
  ['ai-01','genai',1,'What does LLM stand for?',
    ['Large language model','Linked logic machine','Low latency memory','Learned label method'],0,
    'A large language model is a neural network trained on large amounts of text to predict and generate language.','TEST - seed'],
  ['ai-02','genai',1,'What is an AI \u201challucination\u201d?',
    ['A visual glitch','Confident but false output','A hardware fault','A training pause','A user error'],1,
    'A hallucination is output that sounds plausible but is wrong or made up, which is why AI answers need checking against sources.','TEST - seed'],
  ['ai-03','genai',2,'In RAG, what does the \u201cR\u201d stand for?',
    ['Reasoning','Regression','Retrieval','Ranking'],2,
    'Retrieval-augmented generation fetches relevant documents first, then lets the model answer from them, which grounds its output.','TEST - seed'],
  ['ai-04','genai',2,'What makes an AI system an \u201cagent\u201d rather than a chatbot?',
    ['It has an avatar','It acts using tools','It runs offline','It uses more data'],1,
    'An AI agent plans steps and uses tools such as search, code or business systems to act towards a goal, not just reply.','TEST - seed'],
  ['ai-05','genai',3,'What is a \u201ctoken\u201d to a large language model?',
    ['A login password','A GPU time unit','A chunk of text','A training label','A model version'],2,
    'Models read and write text as tokens, pieces of words or characters; context limits and costs are counted in tokens.','TEST - seed'],

  /* ---- Data & Cloud ---- */
  ['dc-01','data',1,'What does SaaS stand for?',
    ['Storage and Sync','Software as a Service','Secure Access Server','System as a Solution'],1,
    'Software as a Service is software delivered over the internet on subscription instead of installed locally.','TEST - seed'],
  ['dc-02','data',1,'Which of these is a query language for relational databases?',
    ['HTML','CSS','SQL','JSON','YAML'],2,
    'SQL (Structured Query Language) is used to define, read and update data in relational databases.','TEST - seed'],
  ['dc-03','data',2,'What does ETL stand for in data engineering?',
    ['Encrypt, test, launch','Extract, transform, load','Edit, track, log','Export, tag, label'],1,
    'ETL pipelines extract data from sources, transform it into a usable shape and load it into a target such as a warehouse.','TEST - seed'],
  ['dc-04','data',2,'What is a \u201cdata lake\u201d?',
    ['A backup tape library','A cooling system','Store of raw data','A data privacy law'],2,
    'A data lake stores large volumes of raw data in its original formats, ready for later analysis.','TEST - seed'],
  ['dc-05','data',3,'In the FAIR data principles, what does the \u201cI\u201d stand for?',
    ['Indexed','Interoperable','Integrated','Immutable','Identified'],1,
    'FAIR data is Findable, Accessible, Interoperable and Reusable, a framework widely adopted in life sciences.','TEST - seed'],

  /* ---- Pharma Business ---- */
  ['pb-01','business',1,'What is a generic medicine?',
    ['An unbranded vitamin','Off-patent equivalent drug','An experimental drug','A herbal remedy'],1,
    'A generic contains the same active ingredient as an original brand and is sold once patents and exclusivity expire.','TEST - seed'],
  ['pb-02','business',1,'What does OTC mean on a medicine?',
    ['Only to clinicians','Over the counter','Oral tablet coating','Ordered through chemist'],1,
    'Over-the-counter medicines can be bought without a prescription.','TEST - seed'],
  ['pb-03','business',2,'What is a \u201cbiosimilar\u201d?',
    ['A copied small molecule','A plant-based drug','Near-copy of a biologic','A combination vaccine','A rebranded generic'],2,
    'A biosimilar is highly similar to an approved biologic medicine, with no meaningful differences in safety or efficacy.','TEST - seed'],
  ['pb-04','business',2,'What is a \u201cpatent cliff\u201d?',
    ['A failed trial result','Revenue drop after expiry','A price control law','A merger deadline'],1,
    'When key patents expire, generic or biosimilar rivals arrive and the originator\u2019s sales can fall sharply.','TEST - seed'],
  ['pb-05','business',3,'In HEOR, what does the \u201cE\u201d stand for?',
    ['Evidence','Efficacy','Economics','Epidemiology','Ethics'],2,
    'HEOR is health economics and outcomes research: evidence on value, cost and real-world outcomes for payers.','TEST - seed'],

  /* ---- India & Global Pharma ---- */
  ['ig-01','india',1,'Which body is India\u2019s national drug regulator?',
    ['FSSAI','CDSCO','ICMR','NITI Aayog'],1,
    'The Central Drugs Standard Control Organisation, headed by the DCGI, regulates drug approvals and clinical trials in India.','TEST - seed'],
  ['ig-02','india',1,'India is often called the \u201cpharmacy of the world\u201d for supplying what?',
    ['Rare-earth metals','Medical robots','Affordable generics','Patent licences','Herbal teas'],2,
    'India is one of the largest suppliers of generic medicines by volume, serving markets across the world.','TEST - seed'],
  ['ig-03','india',2,'WHO prequalification helps UN agencies buy what?',
    ['Hospital buildings','Quality-assured medicines','Medical insurance','Lab equipment'],1,
    'WHO prequalification checks that medicines and vaccines meet global quality, safety and efficacy standards for procurement by UN agencies.','TEST - seed'],
  ['ig-04','india',2,'In India, what is Schedule M of the Drugs and Cosmetics Rules about?',
    ['Drug pricing caps','Clinical trial fees','Good Manufacturing Practice','Import duties','Pharmacy licences'],2,
    'Schedule M sets the GMP requirements for manufacturers in India; a revised version brought it closer to global standards.','TEST - seed'],
  ['ig-05','india',3,'Which body harmonises drug rules across regulators such as FDA, EMA and Japan\u2019s PMDA?',
    ['WTO','OECD','ICH','UNESCO'],2,
    'The International Council for Harmonisation brings regulators and industry together to write shared technical guidelines.','TEST - seed']
];

const SEED_QUESTIONS = SEED_QUESTION_ROWS.map(function (r) {
  return { id: r[0], domainId: r[1], difficulty: r[2], questionText: r[3], options: r[4],
           correctIndex: r[5], explanation: r[6], source: r[7], enabled: true };
});
```

## Rejected paths
- **Reconstructing Darshan's questions from memory** before his file was attached: refused, because the user needed to check that the shortened versions didn't change meaning.
- **Google Fonts at runtime:** not allowed (offline). Fonts are embedded.
- **Plain HTML5 Canvas instead of Phaser:** offered as an alternative; the user agreed to Phaser 3.
- **Showing explanations mid-round** (Darshan's behaviour): rejected by the brief.
- **Emoji sad reaction:** replaced by the mascot.
- **A pure-orange capsule cap for every domain:** the user chose per-domain accents.
- **Stretched wordmark lettering** (fixed text widths): replaced by natural proportions.

## Tone & working preferences
- **Confirm before you build:** give exhaustive constraints up front and confirm before executing; stop at checkpoints for confirmation.
- **Be direct and frank,** with no diplomatic softening, in a peer tone, not hierarchical.
- **Offer choices as structured options with a recommendation,** not open-ended discussion.
- **Separate evidence from inference.** Say what was tested and what wasn't.
- **Client confidentiality is strict** in every shared artifact. Never reference clients or engagements.
- **Stay in scope:** don't add features beyond the brief, and don't reopen locked or settled decisions.
- **Keep code readable,** commented at the level of "what each scene and system does", so Darshan or another engineer can maintain it.

## Immediate next step
Write the prompt the user asks for, using this document as the full record of what is built. If they haven't said what the prompt is for, ask them in one question. The next pending project step is Milestone 2, and the user still owes two answers: lock the CSV layout, and choose among the three interim options for adding domains and questions.
