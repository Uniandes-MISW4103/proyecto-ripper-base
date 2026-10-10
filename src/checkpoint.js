// Run folders under results/: each holds checkpoint.json, the whole state of an exploration, written
// atomically after every action so an interrupted run loses at most the action in progress.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runFieldsChanged, runHash } from "./config.js";
import { Model } from "./model.js";

export const CHECKPOINT_VERSION = 3;
const FILE = "checkpoint.json";

export class CheckpointError extends Error {}

/** Writes a file atomically (temporary file + rename). */
export function writeAtomic(path, content) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

/** A run identifier from its start time, sortable and valid as a folder name. */
export function newRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export class Run {
  /**
   * @param {{ dir: string, runId: string, configHash: string, config: object, status: string,
   *   sessions: object[], model: Model }} data
   */
  constructor({ dir, runId, configHash, config, status, sessions, model }) {
    Object.assign(this, { dir, runId, configHash, config, status, sessions, model });
  }

  static create(resultsDir, config, now = new Date()) {
    const runId = newRunId(now);
    const dir = join(resultsDir, runId);
    mkdirSync(join(dir, "screenshots"), { recursive: true });
    return new Run({ dir, runId, configHash: runHash(config), config, status: "running", sessions: [], model: new Model() });
  }

  static load(dir) {
    const file = join(dir, FILE);
    if (!existsSync(file)) throw new CheckpointError(`No hay ${FILE} en ${dir}`);
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (data.version !== CHECKPOINT_VERSION) {
      throw new CheckpointError(`${file} es de otra versión del ripper (${data.version}); inicie una ejecución nueva`);
    }
    return new Run({ ...data, dir, model: Model.fromJSON(data.model) });
  }

  /** The most recent run in resultsDir that is not completed, or null. */
  static latestUnfinished(resultsDir) {
    if (!existsSync(resultsDir)) return null;
    const runs = readdirSync(resultsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(resultsDir, entry.name, FILE)))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const name of runs) {
      const data = JSON.parse(readFileSync(join(resultsDir, name, FILE), "utf8"));
      if (data.version === CHECKPOINT_VERSION && data.status !== "completed") return join(resultsDir, name);
    }
    return null;
  }

  /** Rejects a resume whose configuration explores something different from the saved run. */
  assertResumableWith(config) {
    if (this.status === "completed") throw new CheckpointError(`La ejecución ${this.runId} ya terminó`);
    const changed = runFieldsChanged(this.config, config);
    if (changed.length > 0) {
      throw new CheckpointError(
        `config.json cambió en ${changed.join(", ")} desde que empezó la ejecución ${this.runId}. ` +
          "Restaure esos valores para continuarla, o inicie una ejecución nueva.",
      );
    }
  }

  path(...parts) {
    return join(this.dir, ...parts);
  }

  save() {
    const { runId, configHash, config, status, sessions, model } = this;
    const data = { version: CHECKPOINT_VERSION, runId, configHash, config, status, sessions, model: model.toJSON() };
    writeAtomic(this.path(FILE), JSON.stringify(data));
  }
}
