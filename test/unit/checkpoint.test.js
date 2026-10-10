import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CheckpointError, Run, newRunId } from "../../src/checkpoint.js";
import { validateConfig } from "../../src/config.js";

const config = validateConfig({ url: "http://localhost:2368/ghost/" });
const tempDir = () => mkdtempSync(join(tmpdir(), "ripper-test-"));

test("a saved run loads back with its model", () => {
  const run = Run.create(tempDir(), config, new Date("2026-01-02T03:04:05.678Z"));
  run.model.addState({ fingerprint: "f", actions: [{ id: "a" }] });
  run.model.enqueue("s0", ["a"]);
  run.save();
  const loaded = Run.load(run.dir);
  assert.equal(loaded.runId, "2026-01-02T03-04-05-678Z");
  assert.deepEqual(loaded.model.toJSON(), run.model.toJSON());
  assert.equal(loaded.configHash, run.configHash);
});

test("latestUnfinished returns the newest run that is not completed", () => {
  const dir = tempDir();
  const older = Run.create(dir, config, new Date("2026-01-01T00:00:00Z"));
  older.status = "budget-exhausted";
  older.save();
  const newer = Run.create(dir, config, new Date("2026-01-02T00:00:00Z"));
  newer.status = "completed";
  newer.save();
  assert.equal(Run.latestUnfinished(dir), older.dir);
  assert.equal(Run.latestUnfinished(join(dir, "missing")), null);
});

test("a resume may change budgets but not what the run explores", () => {
  const run = Run.create(tempDir(), config);
  run.status = "budget-exhausted";
  run.assertResumableWith(validateConfig({ url: config.url, maxActions: 1000, headless: false }));
  assert.throws(
    () => run.assertResumableWith(validateConfig({ url: config.url, seed: 1 })),
    (error) => error instanceof CheckpointError && /seed/.test(error.message),
  );
});

test("a completed run can't be resumed", () => {
  const run = Run.create(tempDir(), config);
  run.status = "completed";
  assert.throws(() => run.assertResumableWith(config), /ya terminó/);
});

test("a checkpoint from another version is rejected", () => {
  const run = Run.create(tempDir(), config);
  run.save();
  const file = join(run.dir, "checkpoint.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), version: 2 }));
  assert.throws(() => Run.load(run.dir), /otra versión/);
});

test("run ids sort by start time and are valid folder names", () => {
  assert.equal(newRunId(new Date("2026-10-09T12:30:00.000Z")), "2026-10-09T12-30-00-000Z");
});
