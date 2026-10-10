import assert from "node:assert/strict";
import { test } from "node:test";
import { seedFrom, shuffle } from "../../src/random.js";

const items = Array.from({ length: 20 }, (_, index) => index);

test("shuffle returns the same permutation for the same seed parts", () => {
  assert.deepEqual(shuffle(items, 4103, "s0"), shuffle(items, 4103, "s0"));
});

test("shuffle returns a different permutation for another seed", () => {
  assert.notDeepEqual(shuffle(items, 4103, "s0"), shuffle(items, 4104, "s0"));
});

test("shuffle keeps every item and leaves the input unchanged", () => {
  const input = [...items];
  assert.deepEqual([...shuffle(input, 1)].sort((a, b) => a - b), items);
  assert.deepEqual(input, items);
});

test("seedFrom is a 32-bit unsigned integer", () => {
  const value = seedFrom("a", 1);
  assert.ok(Number.isInteger(value) && value >= 0 && value < 2 ** 32);
});
