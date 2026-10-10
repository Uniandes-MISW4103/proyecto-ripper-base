// results/<run>/report.html: a single self-contained file (data, styles and scripts inline) that
// opens directly from disk, without a server or Internet access.
import { readFileSync } from "node:fs";

const TEMPLATE = new URL("./template.html", import.meta.url);

/** JSON that is safe inside a <script> element. */
export function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * @param {object} summary the summary.json content
 * @param {import("../model.js").Model} model
 */
export function renderReport(summary, model) {
  const actions = Object.fromEntries(
    model.states.map((state) => [
      state.id,
      Object.fromEntries(state.actions.map(({ id, kind, label, target }) => [id, { kind, label, target }])),
    ]),
  );
  const data = { summary, actions, events: model.events };
  return readFileSync(TEMPLATE, "utf8").replace("__RIPPER_DATA__", () => inlineJson(data));
}
