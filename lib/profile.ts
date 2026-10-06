export const NAME_MAX = 120;
export const AVATAR_MAX_BYTES = 150 * 1024;
// Teto do texto base64 ANTES de qualquer regex/decodificação (150 KB em base64 ~ 200 mil caracteres).
export const AVATAR_MAX_CHARS = Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 64;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export function validateName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.trim();
  return n.length >= 1 && n.length <= NAME_MAX ? n : null;
}

const hasMagic = (kind: string, b: Buffer): boolean => {
  if (kind === 'png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (kind === 'jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
};

/** Data URL image/png|jpeg|webp de até 150 KB, com assinatura real do formato. Devolve a própria string ou null. */
export function validateAvatar(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > AVATAR_MAX_CHARS) return null;
  const m = DATA_URL_RE.exec(v);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) return null;
  return hasMagic(m[1], bytes) ? v : null;
}
