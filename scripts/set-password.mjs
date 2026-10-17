// Sets (or resets) a team member's password from the command line, e.g. the
// first admin's. Asks for the password without showing it; it is hashed with
// scrypt before it reaches the database and is never logged.
//
// Usage: npm run admin:set-password -- mayank.srivastava@mresult.com
//   Uses MIGRATION_DATABASE_URL (owner connection; local machine only).
import { randomBytes, scrypt } from 'node:crypto';
import readline from 'node:readline';
import postgres from 'postgres';

const LOG_N = 15, R = 8, P = 1;   // must match lib/password.ts

function hash(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, 64, { N: 2 ** LOG_N, r: R, p: P, maxmem: 128 * 2 ** LOG_N * R * 2 }, (err, key) =>
      err ? reject(err) : resolve(['scrypt', LOG_N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$'))));
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };   // echo the prompt only
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('Usage: npm run admin:set-password -- <email>'); process.exit(1); }
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) { console.error('MIGRATION_DATABASE_URL is not set (see .env.example)'); process.exit(1); }

const pw = await askHidden(`New password for ${email} (min 10 characters): `);
if (pw.length < 10) { console.error('Too short. Nothing changed.'); process.exit(1); }
const again = await askHidden('Type it again: ');
if (again !== pw) { console.error('The two entries differ. Nothing changed.'); process.exit(1); }

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  const rows = await sql`update hub.app_users set password_hash = ${await hash(pw)}, active = true where email = ${email} returning display_name, role`;
  if (!rows.length) { console.error(`${email} is not on the team list. Nothing changed.`); process.exitCode = 1; }
  else console.log(`Password set for ${rows[0].display_name} (${rows[0].role}).`);
} finally {
  await sql.end();
}
