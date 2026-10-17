/* Password hashing with scrypt (built into Node; no extra dependency).
 * Stored format: scrypt$<log2 N>$<r>$<p>$<salt base64url>$<hash base64url>
 * Passwords are never stored or logged in readable form.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const LOG_N = 15, R = 8, P = 1, KEY_LEN = 64;
export const MIN_PASSWORD_LENGTH = 10;

function scrypt(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEY_LEN, { N: 2 ** logN, r, p, maxmem: 128 * 2 ** logN * r * 2 },
      (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, LOG_N, R, P);
  return ['scrypt', LOG_N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Still do the work, so a missing account takes as long as a wrong password.
    await scrypt(password, randomBytes(16), LOG_N, R, P);
    return false;
  }
  const [alg, logN, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), Number(logN), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}
