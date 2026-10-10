// Deterministic hashing and pseudo-random helpers. Every random choice of the ripper derives from the
// configured seed plus stable identifiers (state, action, field), never from execution history, so a
// resumed run makes the same choices as an uninterrupted one.
import { createHash } from "node:crypto";

/** Hex SHA-256 of the JSON encoding of the given parts. */
export function hash(...parts) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** 32-bit unsigned integer derived from the given parts. */
export function seedFrom(...parts) {
  return Number.parseInt(hash(...parts).slice(0, 8), 16);
}

/** Mulberry32: a small, fast PRNG returning floats in [0, 1). */
export function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a new array with the items in a permutation fixed by the seed parts (Fisher-Yates). */
export function shuffle(items, ...seedParts) {
  const random = prng(seedFrom(...seedParts));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
