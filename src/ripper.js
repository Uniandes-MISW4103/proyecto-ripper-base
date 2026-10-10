// The exploration loop. It takes (state, action) pairs from the frontier in breadth-first order,
// brings the browser to the state (directly or by replaying the state's path from the start), runs
// the action, identifies the resulting state and records the event. The run is saved after every
// action, so it can stop at any point (budget, Ctrl+C) and resume later from the same point.
import { valueFor } from "./data.js";
import { discoverActions, orderActions } from "./discovery.js";
import { matches } from "./fingerprint.js";

export class Ripper {
  #stopRequested = false;

  /**
   * @param {{ run: import("./checkpoint.js").Run, session: import("./browser.js").Session,
   *   isExcluded?: (action: object) => boolean, log?: (line: string) => void, now?: () => number,
   *   onEvent?: (event: object) => void }} options
   */
  constructor({ run, session, isExcluded, log = console.log, now = Date.now, onEvent = () => {} }) {
    this.run = run;
    this.config = run.config;
    this.model = run.model;
    this.session = session;
    this.isExcluded = isExcluded;
    this.log = log;
    this.now = now;
    this.onEvent = onEvent;
  }

  /** Stops after the action in progress; the run can be resumed. */
  stop() {
    this.#stopRequested = true;
  }

  /** Explores until the frontier is empty, a budget is reached or stop() is called. Returns the status. */
  async explore() {
    const { model, session } = this;
    const startedAt = this.now();
    let actions = 0;

    await session.home();
    if (model.states.length === 0) await this.#addState(await session.observe(), { depth: 0, path: [] });
    this.run.save();

    while (!model.done) {
      if (this.#stopRequested) return "interrupted";
      const budget = this.#budgetReached(actions, startedAt);
      if (budget) {
        this.log(`Presupuesto alcanzado (${budget}). Continúe la exploración con ripper:resume.`);
        return "budget-exhausted";
      }
      const item = model.peek();
      const state = model.state(item.state);
      if (await this.#reach(state)) {
        await this.#step(state, model.action(item.state, item.action));
        actions++;
      } else {
        model.markUnreachable(state.id);
        this.log(`   ${state.id} no se pudo restaurar: sus acciones pendientes se omiten`);
      }
      this.run.save();
    }
    return "completed";
  }

  #budgetReached(actions, startedAt) {
    const { maxActions, maxStates, maxDurationSeconds } = this.config;
    if (actions >= maxActions) return `maxActions = ${maxActions} en esta sesión`;
    if (this.model.states.length >= maxStates) return `maxStates = ${maxStates}`;
    if (maxDurationSeconds > 0 && this.now() - startedAt >= maxDurationSeconds * 1000) {
      return `maxDurationSeconds = ${maxDurationSeconds}`;
    }
    return null;
  }

  async #addState(observed, { depth, path }) {
    const { config, model } = this;
    const { actions, excluded } = discoverActions(observed.scan, {
      scope: config.scope,
      exclude: config.exclude,
      isExcluded: this.isExcluded,
    });
    const state = model.addState({
      fingerprint: observed.fingerprint,
      abstraction: observed.abstraction,
      route: observed.abstraction[0].slice("route:".length),
      url: observed.scan.url,
      title: observed.scan.title,
      depth,
      path,
      actions,
      excluded,
    });
    await this.session.screenshotPage(this.run.path("screenshots", `${state.id}.png`));
    if (depth < config.maxDepth) model.enqueue(state.id, orderActions(actions, { seed: config.seed, stateId: state.id }));
    return state;
  }

  #valueFn(stateId, actionId) {
    const { seed, values } = this.config;
    return (field) => valueFor(field, { seed, values, stateId, actionId });
  }

  /**
   * Brings the browser to the state. Acting from the current page needs the exact state; replaying
   * the path accepts a similar one, since the application's data may have changed since discovery.
   */
  async #reach(state) {
    const current = await this.session.observe().catch(() => null);
    if (current?.fingerprint === state.fingerprint) return true;
    if (await this.#replay(state)) return true;
    // A fresh context recovers from a lost session (for example, a logout).
    await this.session.reopen();
    return this.#replay(state);
  }

  async #replay(state) {
    const { model, session } = this;
    try {
      await session.home();
      if (!matches(await session.observe(), model.state("s0"))) return false;
      for (const step of state.path) {
        await session.perform(model.action(step.from, step.action), this.#valueFn(step.from, step.action));
        await session.settle();
        if (!matches(await session.observe(), model.state(step.to))) return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      session.drain();
    }
  }

  async #step(state, action) {
    const { model, session } = this;
    const event = model.nextEvent;
    const screenshot = (await session.screenshotTarget(action, this.run.path("screenshots", `e${event}.png`)))
      ? `screenshots/e${event}.png`
      : null;

    let error = null;
    try {
      await session.perform(action, this.#valueFn(state.id, action.id));
    } catch (thrown) {
      error = String(thrown.message).split("\n")[0];
    }
    await session.settle();
    const observed = await session.observe().catch(() => null);
    const { failures, dialogs, external } = session.drain();

    let to = null;
    let outcome;
    const known = observed && model.findByFingerprint(observed.fingerprint);
    if (error !== null || observed === null) {
      outcome = "error";
      to = known?.id ?? null;
    } else if (known?.id === state.id) {
      outcome = external.length > 0 ? "external" : "same-state";
      to = state.id;
    } else if (known) {
      outcome = "known-state";
      to = known.id;
    } else {
      outcome = "new-state";
      const depth = state.depth + 1;
      const id = `s${model.states.length}`;
      await this.#addState(observed, { depth, path: [...state.path, { from: state.id, action: action.id, to: id }] });
      to = id;
    }

    const record = {
      event,
      from: state.id,
      action: action.id,
      kind: action.kind,
      label: action.label,
      to,
      outcome,
      ...(error === null ? {} : { error }),
      failures: failures.map((failure) => ({ ...failure, event, state: to })),
      dialogs,
      external,
      screenshot,
    };
    model.complete(record);
    this.log(
      `#${event} ${state.id} → ${to ?? "?"}  ${action.kind} "${action.label}"  ${outcome}` +
        (failures.length > 0 ? `  (${failures.length} fallas)` : ""),
    );
    this.onEvent(record);
  }
}
