import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, DEFAULTS, runFieldsChanged, runHash, validateConfig } from "../../src/config.js";

test("an empty configuration takes every default and scopes the run to the URL's origin", () => {
  const config = validateConfig({});
  assert.equal(config.seed, DEFAULTS.seed);
  assert.deepEqual(config.scope, [`${new URL(DEFAULTS.url).origin}/`]);
});

test("rejects unknown fields, naming them", () => {
  assert.throws(() => validateConfig({ depthLevels: 2 }), (error) => error instanceof ConfigError && /depthLevels/.test(error.message));
});

test("rejects unknown nested fields", () => {
  assert.throws(() => validateConfig({ fingerprint: { ignored: [] } }), /fingerprint\.ignored/);
});

test("rejects invalid values, naming the field", () => {
  assert.throws(() => validateConfig({ url: "localhost:2368" }), /"url"/);
  assert.throws(() => validateConfig({ seed: -1 }), /"seed"/);
  assert.throws(() => validateConfig({ browser: "chrome" }), /"browser"/);
  assert.throws(() => validateConfig({ maxActions: 0 }), /"maxActions"/);
  assert.throws(() => validateConfig({ viewport: { width: 10 } }), /"viewport\.width"/);
  assert.throws(() => validateConfig({ values: { email: ["a"] } }), /"values"/);
});

test("merges partial nested objects with their defaults", () => {
  const config = validateConfig({ viewport: { width: 1440 } });
  assert.deepEqual(config.viewport, { width: 1440, height: DEFAULTS.viewport.height });
});

test("HEADLESS from the environment overrides headless", () => {
  assert.equal(validateConfig({ headless: true }, { HEADLESS: "false" }).headless, false);
  assert.equal(validateConfig({ headless: false }, { HEADLESS: "true" }).headless, true);
  assert.equal(validateConfig({ headless: false }, { HEADLESS: "yes" }).headless, false);
});

test("the result is frozen", () => {
  const config = validateConfig({});
  assert.throws(() => {
    config.exclude.push("x");
  }, TypeError);
});

test("budgets do not change the run hash; explored fields do", () => {
  const base = validateConfig({});
  assert.equal(runHash(base), runHash(validateConfig({ maxActions: 999, headless: false })));
  assert.notEqual(runHash(base), runHash(validateConfig({ seed: 1 })));
  assert.deepEqual(runFieldsChanged(base, validateConfig({ seed: 1, maxDepth: 4 })), ["seed", "maxDepth"]);
});
