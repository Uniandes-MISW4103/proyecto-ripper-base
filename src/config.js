// Loads and validates config.json. Every field is optional (defaults below); unknown fields and
// invalid values stop the run with a message that names the field.
import { readFileSync } from "node:fs";
import { hash } from "./random.js";

export const DEFAULTS = Object.freeze({
  url: "https://angular-6-registration-login-example.stackblitz.io",
  seed: 4103,
  browser: "chromium",
  headless: true,
  viewport: { width: 1280, height: 720 },
  maxDepth: 2,
  maxActions: 200,
  maxStates: 50,
  maxDurationSeconds: 0,
  settleMs: 500,
  actionTimeoutMs: 5000,
  navigationTimeoutMs: 15000,
  scope: [],
  exclude: ["signout", "sign out", "logout", "log out"],
  fingerprint: { ignore: [], includeQuery: false },
  values: {},
});

// Fields that define what a run explores. A run can only be resumed with the same values; the others
// (budgets, timeouts, headless) may change between sessions.
export const RUN_FIELDS = ["url", "seed", "browser", "viewport", "maxDepth", "scope", "exclude", "fingerprint", "values"];

export const BROWSERS = ["chromium", "firefox", "webkit"];

export class ConfigError extends Error {}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isHttpUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const integer = (min) => (value) => Number.isInteger(value) && value >= min;
const stringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item !== "");

const RULES = {
  url: [isHttpUrl, "una URL http(s)"],
  seed: [integer(0), "un entero mayor o igual a 0"],
  browser: [(value) => BROWSERS.includes(value), `uno de: ${BROWSERS.join(", ")}`],
  headless: [(value) => typeof value === "boolean", "true o false"],
  maxDepth: [integer(0), "un entero mayor o igual a 0"],
  maxActions: [integer(1), "un entero mayor o igual a 1"],
  maxStates: [integer(1), "un entero mayor o igual a 1"],
  maxDurationSeconds: [integer(0), "un entero mayor o igual a 0 (0 = sin límite)"],
  settleMs: [integer(0), "un entero mayor o igual a 0"],
  actionTimeoutMs: [integer(100), "un entero mayor o igual a 100"],
  navigationTimeoutMs: [integer(100), "un entero mayor o igual a 100"],
  scope: [(value) => stringList(value) && value.every(isHttpUrl), "una lista de URL http(s)"],
  exclude: [stringList, "una lista de textos"],
  values: [
    (value) => isObject(value) && Object.values(value).every((item) => ["string", "number"].includes(typeof item)),
    "un objeto de textos o números",
  ],
};

const NESTED = {
  viewport: { width: [integer(100), "un entero mayor o igual a 100"], height: [integer(100), "un entero mayor o igual a 100"] },
  fingerprint: {
    ignore: [stringList, "una lista de selectores CSS"],
    includeQuery: [(value) => typeof value === "boolean", "true o false"],
  },
};

function checkKeys(object, allowed, prefix) {
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ConfigError(
      `Campo desconocido en config.json: ${unknown.map((key) => prefix + key).join(", ")}. ` +
        `Campos válidos: ${allowed.map((key) => prefix + key).join(", ")}`,
    );
  }
}

/** Merges the raw configuration with the defaults and validates it. Returns a frozen object. */
export function validateConfig(raw, env = {}) {
  if (!isObject(raw)) throw new ConfigError("config.json debe contener un objeto JSON");
  checkKeys(raw, Object.keys(DEFAULTS), "");

  const config = structuredClone({ ...DEFAULTS, ...raw });
  for (const [field, [valid, expected]] of Object.entries(RULES)) {
    if (!valid(config[field])) throw new ConfigError(`config.json: "${field}" debe ser ${expected}`);
  }
  for (const [field, rules] of Object.entries(NESTED)) {
    if (!isObject(config[field])) throw new ConfigError(`config.json: "${field}" debe ser un objeto`);
    checkKeys(config[field], Object.keys(rules), `${field}.`);
    config[field] = { ...DEFAULTS[field], ...config[field] };
    for (const [key, [valid, expected]] of Object.entries(rules)) {
      if (!valid(config[field][key])) throw new ConfigError(`config.json: "${field}.${key}" debe ser ${expected}`);
    }
  }

  if (env.HEADLESS === "true" || env.HEADLESS === "false") config.headless = env.HEADLESS === "true";
  if (config.scope.length === 0) config.scope = [`${new URL(config.url).origin}/`];
  return deepFreeze(config);
}

/** Reads and validates a config.json file. */
export function loadConfig(file, env = process.env) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new ConfigError(`No se pudo leer ${file}: ${error.message}`);
  }
  return validateConfig(raw, env);
}

/** Hash of the fields that define a run (see RUN_FIELDS). */
export function runHash(config) {
  return hash(RUN_FIELDS.map((field) => [field, config[field]]));
}

/** Fields in RUN_FIELDS whose values differ between two configurations. */
export function runFieldsChanged(a, b) {
  return RUN_FIELDS.filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

function deepFreeze(value) {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
