import assert from "node:assert/strict";
import { test } from "node:test";
import { valueFor } from "../../src/data.js";

const field = { target: "#email", type: "email", id: "email", name: "identification", label: "Email address" };
const context = { seed: 4103, values: {}, stateId: "s1", actionId: "abc" };

test("a configured value wins, matched by id, name or label", () => {
  assert.equal(valueFor(field, { ...context, values: { email: "a@b.co" } }), "a@b.co");
  assert.equal(valueFor(field, { ...context, values: { identification: "c@d.co" } }), "c@d.co");
  assert.equal(valueFor(field, { ...context, values: { "Email address": 12 } }), "12");
});

test("generated values are reproducible and depend on the seed, state and action", () => {
  const value = valueFor(field, context);
  assert.equal(valueFor(field, context), value);
  assert.notEqual(valueFor(field, { ...context, seed: 1 }), value);
  assert.notEqual(valueFor(field, { ...context, stateId: "s2" }), value);
  assert.notEqual(valueFor(field, { ...context, actionId: "xyz" }), value);
});

test("generated values follow the field type", () => {
  assert.match(valueFor(field, context), /@/);
  assert.match(valueFor({ ...field, type: "number", id: "n" }, context), /^\d+$/);
  assert.match(valueFor({ ...field, type: "date", id: "d" }, context), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(valueFor({ ...field, type: "text", id: "t" }, context).length > 0);
});
