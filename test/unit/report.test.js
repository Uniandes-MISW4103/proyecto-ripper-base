import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfig } from "../../src/config.js";
import { Model } from "../../src/model.js";
import { inlineJson, renderReport } from "../../src/report/html.js";
import { buildSummary } from "../../src/report/summary.js";

test("inlined JSON can't close the script element", () => {
  const json = inlineJson({ text: "</script><script>alert(1)</script>" });
  assert.ok(!json.includes("</script>"));
  assert.deepEqual(JSON.parse(json), { text: "</script><script>alert(1)</script>" });
});

function sampleRun() {
  const model = new Model();
  model.addState({ fingerprint: "f0", url: "http://h/", title: "Home", depth: 0, path: [], actions: [{ id: "a", kind: "click", label: "Go", target: "#go" }], excluded: [] });
  model.addState({ fingerprint: "f1", url: "http://h/x", title: "X", depth: 1, path: [{ from: "s0", action: "a", to: "s1" }], actions: [], excluded: [] });
  model.enqueue("s0", ["a"]);
  model.complete({ event: 1, from: "s0", action: "a", kind: "click", label: "Go", to: "s1", outcome: "new-state",
    failures: [{ type: "pageerror", message: "boom", url: "http://h/x", event: 1, state: "s1" }], dialogs: [], external: [], screenshot: null });
  return { runId: "r", status: "completed", config: validateConfig({}), sessions: [{ startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1500 }], model };
}

test("the summary lists states, ordered events and failures", () => {
  const summary = buildSummary(sampleRun(), { node: "v24", browser: "chromium", browserVersion: "1" });
  assert.equal(summary.tool, "ripper");
  assert.deepEqual(summary.results.counts, { states: 2, events: 1, failures: 1, unreachableStates: 0, pendingActions: 0, skippedActions: 0 });
  assert.deepEqual(summary.results.events[0], { event: 1, from: "s0", action: "a", kind: "click", label: "Go", to: "s1", outcome: "new-state" });
  assert.equal(summary.results.states[1].screenshot, "screenshots/s1.png");
  assert.equal(summary.durationMs, 1500);
});

test("the report embeds the run data", () => {
  const run = sampleRun();
  const html = renderReport(buildSummary(run, { node: "v24", browser: "chromium", browserVersion: "1" }), run.model);
  assert.ok(!html.includes("__RIPPER_DATA__"));
  const json = html.match(/<script id="ripper-data" type="application\/json">(.*?)<\/script>/s)[1];
  assert.equal(JSON.parse(json).summary.results.counts.states, 2);
});
