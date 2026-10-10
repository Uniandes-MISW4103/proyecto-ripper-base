// The exploration model: states, the ordered events (executed actions) and the frontier of pending
// (state, action) pairs. It is plain data, so the whole model is saved in the checkpoint and restored
// on resume. It never touches the browser.

/**
 * @typedef {{ id: string, kind: string, target: string, label: string, href?: string, option?: string,
 *   fields?: Field[], submit?: string | null }} Action
 * @typedef {{ target: string, type: string, id: string, name: string, label: string }} Field
 * @typedef {{ from: string, action: string, to: string }} Step
 * @typedef {{ id: string, fingerprint: string, abstraction: string[], route: string, url: string,
 *   title: string, depth: number, path: Step[], actions: Action[], excluded: object[],
 *   unreachable?: boolean }} State
 * @typedef {{ event: number, from: string, action: string, kind: string, label: string,
 *   to: string | null, outcome: string, error?: string, failures: object[], dialogs: string[],
 *   external: string[] }} Event
 * @typedef {{ state: string, action: string }} FrontierItem
 */

export class Model {
  /** @param {{ states?: State[], events?: Event[], frontier?: FrontierItem[], skipped?: FrontierItem[] }} data */
  constructor({ states = [], events = [], frontier = [], skipped = [] } = {}) {
    this.states = states;
    this.events = events;
    this.frontier = frontier;
    this.skipped = skipped;
  }

  static fromJSON(data) {
    return new Model(structuredClone(data));
  }

  toJSON() {
    return { states: this.states, events: this.events, frontier: this.frontier, skipped: this.skipped };
  }

  get done() {
    return this.frontier.length === 0;
  }

  get nextEvent() {
    return this.events.length + 1;
  }

  /** @returns {State} */
  state(id) {
    const state = this.states.find((candidate) => candidate.id === id);
    if (!state) throw new Error(`Unknown state ${id}`);
    return state;
  }

  findByFingerprint(fingerprint) {
    return this.states.find((state) => state.fingerprint === fingerprint) ?? null;
  }

  /** @returns {Action} */
  action(stateId, actionId) {
    const action = this.state(stateId).actions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error(`Unknown action ${actionId} in state ${stateId}`);
    return action;
  }

  /** Adds a state with the next sequential id (s0, s1, …) and returns it. */
  addState(data) {
    const state = { id: `s${this.states.length}`, ...data };
    this.states.push(state);
    return state;
  }

  /** Appends the given actions of a state to the end of the frontier (breadth-first order). */
  enqueue(stateId, actionIds) {
    for (const action of actionIds) this.frontier.push({ state: stateId, action });
  }

  /** @returns {FrontierItem} */
  peek() {
    return this.frontier[0];
  }

  /** Records the event for the frontier's first item and removes that item. */
  complete(event) {
    if (event.event !== this.nextEvent) throw new Error(`Expected event ${this.nextEvent}, got ${event.event}`);
    this.events.push(event);
    this.frontier.shift();
  }

  /** Marks a state that could not be restored and moves its pending actions to `skipped`. */
  markUnreachable(stateId) {
    this.state(stateId).unreachable = true;
    this.skipped.push(...this.frontier.filter((item) => item.state === stateId));
    this.frontier = this.frontier.filter((item) => item.state !== stateId);
  }
}
