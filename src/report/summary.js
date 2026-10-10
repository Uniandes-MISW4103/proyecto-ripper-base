// results/<run>/summary.json: what the run explored and found, in the same shape as the course's
// other exploration tools (config, environment, ordered events, failures).

/**
 * @param {import("../checkpoint.js").Run} run
 * @param {{ node: string, browser: string, browserVersion: string }} environment
 */
export function buildSummary(run, environment) {
  const { model } = run;
  const failures = model.events.flatMap((event) => event.failures);
  const startedAt = run.sessions[0]?.startedAt ?? null;
  return {
    tool: "ripper",
    version: 3,
    runId: run.runId,
    status: run.status,
    config: run.config,
    environment: { ...environment, url: run.config.url },
    sessions: run.sessions,
    startedAt,
    durationMs: run.sessions.reduce((total, session) => total + (session.durationMs ?? 0), 0),
    results: {
      counts: {
        states: model.states.length,
        events: model.events.length,
        failures: failures.length,
        unreachableStates: model.states.filter((state) => state.unreachable).length,
        pendingActions: model.frontier.length,
        skippedActions: model.skipped.length,
      },
      states: model.states.map(({ id, url, title, depth, path, actions, excluded, unreachable }) => ({
        id,
        url,
        title,
        depth,
        path,
        actions: actions.length,
        excluded: excluded.length,
        unreachable: Boolean(unreachable),
        screenshot: `screenshots/${id}.png`,
      })),
      events: model.events.map(({ event, from, action, kind, label, to, outcome, error }) => ({
        event,
        from,
        action,
        kind,
        label,
        to,
        outcome,
        ...(error === undefined ? {} : { error }),
      })),
      failures,
    },
  };
}
