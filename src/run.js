// Starts or resumes a run: opens the browser session, explores, and writes the checkpoint, the
// summary and the report.
import { Session } from "./browser.js";
import { Run, writeAtomic } from "./checkpoint.js";
import { renderReport } from "./report/html.js";
import { buildSummary } from "./report/summary.js";
import { Ripper } from "./ripper.js";

/**
 * @param {{ run: Run, config: object, hooks: { beforeExploring?: Function, isExcluded?: Function },
 *   abp: object, log?: (line: string) => void, onRipper?: (ripper: Ripper) => void,
 *   onEvent?: (event: object) => void }} options
 */
async function explore({ run, config, hooks, abp, log = console.log, onRipper = () => {}, onEvent }) {
  run.config = config;
  const session = new Session({ config, abp, beforeExploring: hooks.beforeExploring ?? (async () => {}) });
  const ripper = new Ripper({ run, session, isExcluded: hooks.isExcluded, log, onEvent });
  onRipper(ripper);

  const startedAt = new Date();
  const record = { startedAt: startedAt.toISOString(), budgets: budgetsOf(config), status: "running" };
  run.sessions.push(record);
  run.status = "running";
  let browserVersion = "";
  try {
    await session.open();
    browserVersion = session.page.context().browser()?.version() ?? "";
    run.status = await ripper.explore();
  } catch (error) {
    run.status = "failed";
    record.error = String(error.message).split("\n")[0];
    throw error;
  } finally {
    record.status = run.status;
    record.endedAt = new Date().toISOString();
    record.durationMs = Date.now() - startedAt.getTime();
    run.save();
    await session.close().catch(() => {});
    const summary = buildSummary(run, { node: process.version, browser: config.browser, browserVersion });
    writeAtomic(run.path("summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    writeAtomic(run.path("report.html"), renderReport(summary, run.model));
  }
  return run;
}

const budgetsOf = ({ maxActions, maxStates, maxDurationSeconds }) => ({ maxActions, maxStates, maxDurationSeconds });

/** Starts a new run in resultsDir. */
export function startRun({ resultsDir, config, ...options }) {
  return explore({ run: Run.create(resultsDir, config), config, ...options });
}

/** Resumes the run saved in runDir. */
export function resumeRun({ runDir, config, ...options }) {
  const run = Run.load(runDir);
  run.assertResumableWith(config);
  return explore({ run, config, ...options });
}
