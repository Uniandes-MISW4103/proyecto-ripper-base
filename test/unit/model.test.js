import assert from "node:assert/strict";
import { test } from "node:test";
import { Model } from "../../src/model.js";

function sampleModel() {
  const model = new Model();
  model.addState({ fingerprint: "f0", actions: [{ id: "a" }, { id: "b" }] });
  model.addState({ fingerprint: "f1", actions: [{ id: "c" }] });
  model.enqueue("s0", ["a", "b"]);
  model.enqueue("s1", ["c"]);
  return model;
}

test("states get sequential ids", () => {
  const model = sampleModel();
  assert.deepEqual(model.states.map((state) => state.id), ["s0", "s1"]);
  assert.equal(model.findByFingerprint("f1").id, "s1");
  assert.equal(model.findByFingerprint("nope"), null);
});

test("the frontier is first in, first out", () => {
  const model = sampleModel();
  assert.deepEqual(model.peek(), { state: "s0", action: "a" });
  model.complete({ event: 1 });
  assert.deepEqual(model.peek(), { state: "s0", action: "b" });
  assert.equal(model.nextEvent, 2);
});

test("complete rejects an event out of sequence", () => {
  assert.throws(() => sampleModel().complete({ event: 2 }), /Expected event 1/);
});

test("markUnreachable moves the state's pending actions to skipped", () => {
  const model = sampleModel();
  model.markUnreachable("s0");
  assert.equal(model.state("s0").unreachable, true);
  assert.deepEqual(model.frontier, [{ state: "s1", action: "c" }]);
  assert.deepEqual(model.skipped.map((item) => item.action), ["a", "b"]);
});

test("serializes and restores the whole model", () => {
  const model = sampleModel();
  model.complete({ event: 1 });
  const restored = Model.fromJSON(JSON.parse(JSON.stringify(model)));
  assert.deepEqual(restored.toJSON(), model.toJSON());
  assert.equal(restored.action("s1", "c").id, "c");
});

test("unknown states and actions throw", () => {
  const model = sampleModel();
  assert.throws(() => model.state("s9"), /Unknown state/);
  assert.throws(() => model.action("s0", "zz"), /Unknown action/);
});
