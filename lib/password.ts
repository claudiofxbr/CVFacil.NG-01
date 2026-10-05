import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Formato versionado: scrypt$N$r$p$saltB64$hashB64 (permite subir o custo no futuro sem quebrar hashes antigos).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
// Teto dos parâmetros aceitos na verificação: um password_hash adulterado não pode forçar custo absurdo (DoS).
const MAX_N = 1 << 17;
const MAX_R = 16;
const MAX_P = 4;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, len: number): Promise<Buffer> {
  const opts: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 2 || n > MAX_N || (n & (n - 1)) !== 0 || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || expected.length < 16 || expected.length > 128) return false;
  const actual = await derive(password, salt, n, r, p, expected.length);
  return timingSafeEqual(actual, expected);
}

// Hash descartável para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHash);
}
