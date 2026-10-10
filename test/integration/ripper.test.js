// End-to-end runs of the ripper (Chromium) against the fixture application in test/fixtures/app.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";
import { AUTO_ID_PATTERN } from "../../src/fingerprint.js";
import { Run } from "../../src/checkpoint.js";
import { validateConfig } from "../../src/config.js";
import { resumeRun, startRun } from "../../src/run.js";
import { scanDocument } from "../../src/scan.js";
import { startFixtureServer } from "../fixtures/server.js";

let server;
before(async () => {
  server = await startFixtureServer();
});
after(() => server.close());

const quiet = () => {};
const configFor = (overrides = {}) => validateConfig({ url: server.url, settleMs: 100, maxDepth: 2, ...overrides });
const projection = (run) => run.model.events.map(({ from, action, to, outcome }) => ({ from, action, to, outcome }));
const resultsDir = () => mkdtempSync(join(tmpdir(), "ripper-it-"));

function rip(overrides = {}, options = {}) {
  return startRun({ resultsDir: resultsDir(), config: configFor(overrides), hooks: {}, abp: {}, log: quiet, ...options });
}

describe("exploration of the fixture application", () => {
  let run;
  before(async () => {
    run = await rip();
  });

  test("completes and writes the checkpoint, summary and report", () => {
    assert.equal(run.status, "completed");
    const summary = JSON.parse(readFileSync(run.path("summary.json"), "utf8"));
    assert.equal(summary.results.counts.states, run.model.states.length);
    assert.equal(Run.load(run.dir).status, "completed");
  });

  test("discovers a state reached only by a click (a dialog) and explores it", () => {
    const dialog = run.model.states.find((state) => state.abstraction.includes("dialog:Confirmación"));
    assert.ok(dialog, "dialog state discovered");
    assert.ok(run.model.events.some((event) => event.from === dialog.id), "dialog state explored");
  });

  test("records every transition, including those back to known states", () => {
    assert.ok(run.model.events.some((event) => event.outcome === "known-state"));
    assert.ok(run.model.events.some((event) => event.outcome === "same-state"));
  });

  test("attaches each failure to the action that caused it", () => {
    const boom = run.model.events.find((event) => event.label === "Fallar");
    assert.deepEqual(boom.failures.map((failure) => failure.type), ["pageerror"]);
    const missing = run.model.events.find((event) => event.label === "Recurso");
    assert.deepEqual(missing.failures.map((failure) => failure.type), ["http"]);
    assert.match(missing.failures[0].message, /404 GET .*missing\.json/);
    const others = run.model.events.filter((event) => !["Fallar", "Recurso"].includes(event.label));
    assert.ok(others.every((event) => event.failures.length === 0));
  });

  test("never acts on excluded or out-of-scope elements", () => {
    assert.ok(!run.model.events.some((event) => /sign out|externo/i.test(event.label)));
    const reasons = run.model.state("s0").excluded.map((item) => item.reason);
    assert.ok(reasons.includes("fuera del alcance"));
    assert.ok(reasons.includes("exclude: signout"));
  });

  test("fills and submits a form as one action", () => {
    const form = run.model.events.find((event) => event.kind === "form" && event.from === "s0");
    assert.equal(form.outcome, "new-state");
    assert.ok(run.model.state(form.to).abstraction.includes("heading:Gracias"));
  });

  test("the report opens from disk and draws every state", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(run.path("report.html")).href);
      assert.equal(await page.locator("#graph .node").count(), run.model.states.length);
      assert.equal(await page.locator("#events tbody tr").count(), run.model.events.length);
    } finally {
      await browser.close();
    }
  });
});

test("the same seed reproduces the event sequence; another seed changes the order", async () => {
  const first = await rip();
  const second = await rip();
  const other = await rip({ seed: 7 });
  assert.deepEqual(projection(second), projection(first));
  assert.notDeepEqual(projection(other), projection(first));
});

test("a run stopped by its budget and resumed makes the same events as an uninterrupted run", async () => {
  const full = await rip();
  const partial = await rip({ maxActions: 5 });
  assert.equal(partial.status, "budget-exhausted");
  assert.equal(partial.model.events.length, 5);
  const resumed = await resumeRun({ runDir: partial.dir, config: configFor(), hooks: {}, abp: {}, log: quiet });
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.sessions.length, 2);
  assert.deepEqual(projection(resumed), projection(full));
  assert.equal(resumed.model.states.length, full.model.states.length);
});

test("stop() interrupts after the current action, saves a valid checkpoint, and the run resumes", async () => {
  let ripper;
  const interrupted = await rip({}, {
    onRipper: (created) => (ripper = created),
    onEvent: (event) => event.event === 3 && ripper.stop(),
  });
  assert.equal(interrupted.status, "interrupted");
  const saved = Run.load(interrupted.dir);
  assert.equal(saved.model.events.length, 3);
  assert.equal(Run.latestUnfinished(join(interrupted.dir, "..")), interrupted.dir);
  const resumed = await resumeRun({ runDir: interrupted.dir, config: configFor(), hooks: {}, abp: {}, log: quiet });
  assert.equal(resumed.status, "completed");
  assert.deepEqual(projection(resumed), projection(await rip()));
});

test("the beforeExploring hook prepares every new context", async () => {
  const calls = [];
  const run = await rip({ maxActions: 3 }, {
    hooks: { beforeExploring: async (page, { abp, config }) => calls.push({ abp, url: config.url }) },
    abp: { ABP_URL: "http://example" },
  });
  assert.equal(run.status, "budget-exhausted");
  assert.ok(calls.length >= 1);
  assert.deepEqual(calls[0], { abp: { ABP_URL: "http://example" }, url: server.url });
});

test("the scan ignores generated ids and the ignore regions, and prefers stable targets", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <nav><a id="ember12" href="/a">A</a><a data-test-nav="posts" href="/posts">Posts</a></nav>
      <aside class="ads"><button>Ad</button></aside>
      <button id="save">Save</button>`);
    const scan = await page.evaluate(scanDocument, { ignore: [".ads"], autoIdPattern: AUTO_ID_PATTERN, maxOptions: 5 });
    assert.deepEqual(scan.elements.map((element) => element.target), ["body > nav > a:nth-of-type(1)", 'a[data-test-nav="posts"]', "#save"]);
    assert.ok(scan.descriptors.every((descriptor) => !descriptor.includes("ember12")));
  } finally {
    await browser.close();
  }
});
