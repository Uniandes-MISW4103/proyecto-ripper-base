// Turns the scanned elements of a state into actions, and filters the ones out of scope or excluded.
import { hash, shuffle } from "./random.js";

/** Whether a URL is within one of the scope prefixes. */
export function inScope(url, scope) {
  try {
    const { href } = new URL(url);
    return scope.some((prefix) => href.startsWith(prefix));
  } catch {
    return false;
  }
}

/** The first exclude pattern found (case-insensitive) in the action's label, link or target, or null. */
export function excludedBy(action, patterns) {
  const haystack = [action.label, action.href ?? "", action.target].join("\n").toLowerCase();
  return patterns.find((pattern) => haystack.includes(pattern.toLowerCase())) ?? null;
}

function actionsOf(element) {
  const base = { kind: element.kind, target: element.target, label: element.label };
  switch (element.kind) {
    case "link":
      return [{ ...base, href: element.href }];
    case "select":
      return element.options.map((option) => ({ ...base, label: `${element.label}: ${option.label}`, option: option.value }));
    case "fill":
      return [{ ...base, fields: [element.field] }];
    case "form":
      return [{ ...base, fields: element.fields, submit: element.submit }];
    default:
      return [base];
  }
}

/**
 * Actions of a scanned state and the ones excluded, with the reason.
 * @param {{ scope: string[], exclude: string[], isExcluded?: (action: object) => boolean }} options
 */
export function discoverActions(scan, { scope, exclude, isExcluded = () => false }) {
  const actions = new Map();
  const excluded = [];
  for (const element of scan.elements) {
    for (const candidate of actionsOf(element)) {
      const action = { id: hash(candidate.kind, candidate.target, candidate.option ?? null).slice(0, 12), ...candidate };
      if (actions.has(action.id)) continue;
      const pattern = excludedBy(action, exclude);
      const reason =
        action.kind === "link" && !inScope(action.href, scope)
          ? "fuera del alcance"
          : pattern !== null
            ? `exclude: ${pattern}`
            : isExcluded(action)
              ? "hooks.isExcluded"
              : null;
      if (reason === null) actions.set(action.id, action);
      else excluded.push({ kind: action.kind, label: action.label, target: action.target, reason });
    }
  }
  return { actions: [...actions.values()], excluded };
}

/** Exploration order of a state's actions: a permutation fixed by the seed and the state. */
export function orderActions(actions, { seed, stateId }) {
  return shuffle(
    actions.map((action) => action.id),
    seed,
    stateId,
  );
}
