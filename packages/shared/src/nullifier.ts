export type Nullifier = string;

export class NullifierFormatError extends Error {}

export function normalizeNullifier(raw: string): Nullifier {
  const trimmed = raw.trim();

  if (/^[0-9]+$/.test(trimmed) && !trimmed.startsWith("0")) {
    return normalizeNullifier("0x" + BigInt(trimmed).toString(16));
  }

  const body = trimmed.toLowerCase().replace(/^0x/, "");

  if (!/^[0-9a-f]+$/.test(body)) {
    throw new NullifierFormatError(`not a hex nullifier: ${raw}`);
  }
  if (body.length > 64) {
    throw new NullifierFormatError(`nullifier exceeds 32 bytes: ${raw}`);
  }

  return "0x" + body.padStart(64, "0");
}

export function sameHuman(a: string, b: string): boolean {
  return normalizeNullifier(a) === normalizeNullifier(b);
}

export function distinctNullifiers(values: string[]): Nullifier[] {
  return Array.from(new Set(values.map(normalizeNullifier)));
}

export function hasDistinctQuorum(values: string[], quorum: number): boolean {
  return distinctNullifiers(values).length >= quorum;
}
