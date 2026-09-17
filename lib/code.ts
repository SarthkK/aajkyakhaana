// No 0/O/1/I/L — these get misread when someone reads a code out loud in the flat.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function normalizeJoinCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
