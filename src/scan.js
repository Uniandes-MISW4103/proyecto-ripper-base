// In-page scan. `scanDocument` runs inside the browser (page.evaluate), so it must be self-contained:
// no imports and no references to outer variables. It returns serializable data only.

/**
 * Lists the interactive elements of the page (or of the topmost open dialog) with a stable CSS
 * target for each one, plus the page features used to identify the state.
 * @param {{ ignore: string[], autoIdPattern: string, maxOptions: number }} options
 */
export function scanDocument({ ignore, autoIdPattern, maxOptions }) {
  const autoId = new RegExp(autoIdPattern);
  const TEXT_TYPES = ["", "text", "email", "password", "search", "tel", "url", "number", "date"];
  const CLICKABLE =
    "a[href], button, [role=button], [role=tab], [role=menuitem], [role=link], summary, " +
    "input[type=button], input[type=submit], input[type=reset], input[type=image], " +
    "input[type=checkbox], input[type=radio], [role=switch], [role=checkbox], [role=radio], " +
    "select, input, textarea, [contenteditable=''], [contenteditable=true]";

  const clean = (text, length = 80) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, length);
  const isIgnored = (el) =>
    ignore.some((selector) => {
      try {
        return el.closest(selector) !== null;
      } catch {
        return false;
      }
    });
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  };
  const isDisabled = (el) =>
    el.matches(":disabled") || el.getAttribute("aria-disabled") === "true" || el.closest("fieldset:disabled") !== null;
  // An element in the viewport whose center is covered by another element (an overlay) can't be clicked.
  const receivesPointer = (el) => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
    const hit = document.elementFromPoint(x, y);
    return !hit || el === hit || el.contains(hit) || hit.contains(el);
  };
  const stableId = (el) => (el.id && !autoId.test(el.id) ? el.id : null);
  const isUnique = (selector) => {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  const testAttributes = (el) =>
    [...el.attributes].filter((attr) => attr.name.startsWith("data-test") || attr.name === "data-cy");

  function cssPath(el) {
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const id = stableId(node);
      if (id && node !== el && isUnique(`#${CSS.escape(id)}`)) {
        parts.unshift(`#${CSS.escape(id)}`);
        break;
      }
      let part = node.localName;
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.localName === node.localName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
    }
    return parts.join(" > ");
  }

  // Preferred targets: a stable id, test attributes, name, aria-label; otherwise a structural path.
  function targetOf(el) {
    const id = stableId(el);
    if (id && isUnique(`#${CSS.escape(id)}`)) return `#${CSS.escape(id)}`;
    const candidates = [
      ...testAttributes(el).map((attr) => [attr.name, attr.value]),
      ["name", el.getAttribute("name")],
      ["aria-label", el.getAttribute("aria-label")],
    ];
    for (const [name, value] of candidates) {
      if (value === null) continue;
      const selector = value === "" ? `${el.localName}[${name}]` : `${el.localName}[${name}="${CSS.escape(value)}"]`;
      if (isUnique(selector)) return selector;
    }
    return cssPath(el);
  }

  function labelOf(el) {
    return clean(
      el.getAttribute("aria-label") ||
        el.innerText ||
        el.labels?.[0]?.innerText ||
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("alt") ||
        el.getAttribute("name") ||
        (el.localName === "input" ? el.value : "") ||
        el.localName,
    );
  }

  // Structural description of an element for the state fingerprint: no free text, no generated ids.
  function describe(el, kind) {
    const attrs = [stableId(el) && `#${stableId(el)}`, ...testAttributes(el).map((attr) => `${attr.name}=${attr.value}`)];
    const name = el.getAttribute("name");
    if (name) attrs.push(`name=${name}`);
    return [kind, el.localName, el.getAttribute("type") ?? "", el.getAttribute("role") ?? "", ...attrs.filter(Boolean)].join("|");
  }

  function kindOf(el) {
    const tag = el.localName;
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    const role = el.getAttribute("role");
    if (tag === "select") return "select";
    if (tag === "textarea" || el.isContentEditable) return "fill";
    if (tag === "input") {
      if (["checkbox", "radio"].includes(type)) return "toggle";
      if (["button", "submit", "reset", "image"].includes(type)) return "click";
      if (TEXT_TYPES.includes(type)) return el.readOnly ? null : "fill";
      return null;
    }
    if (["switch", "checkbox", "radio"].includes(role)) return "toggle";
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      if (el.hasAttribute("download") || /^(mailto|tel|data):/i.test(href)) return null;
      return href === "" || href === "#" || /^javascript:/i.test(href) ? "click" : "link";
    }
    return "click";
  }

  const visibleDialogs = [
    ...document.querySelectorAll("dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]"),
  ].filter(isVisible);
  const dialog = visibleDialogs.at(-1) ?? null;
  const root = dialog ?? document.body;

  const elements = [];
  const descriptors = [];
  const forms = new Map();
  const seen = new Set();

  for (const candidate of root.querySelectorAll(CLICKABLE)) {
    // Nested editable children belong to their editable root.
    if (candidate.isContentEditable && candidate.parentElement?.isContentEditable) continue;
    const kind = kindOf(candidate);
    if (!kind || isIgnored(candidate) || isDisabled(candidate)) continue;
    // Styled checkboxes hide the input and show its label: act on the label.
    const el = kind === "toggle" && !isVisible(candidate) && candidate.labels?.[0] ? candidate.labels[0] : candidate;
    if (seen.has(el) || !isVisible(el) || !receivesPointer(el)) continue;
    seen.add(el);
    descriptors.push(describe(candidate, kind));

    const form = candidate.form ?? candidate.closest("form");
    if (kind === "fill" && form && root.contains(form)) {
      const field = {
        target: targetOf(el),
        type: candidate.localName === "input" ? candidate.type : candidate.localName === "textarea" ? "textarea" : "contenteditable",
        id: candidate.id ?? "",
        name: candidate.getAttribute("name") ?? "",
        label: labelOf(candidate),
      };
      if (!forms.has(form)) forms.set(form, { fields: [], index: elements.length });
      forms.get(form).fields.push(field);
      continue;
    }

    const element = { kind, target: targetOf(el), label: labelOf(candidate) };
    if (kind === "link") element.href = candidate.href;
    if (kind === "fill") {
      element.field = {
        target: element.target,
        type: candidate.localName === "input" ? candidate.type : candidate.localName === "textarea" ? "textarea" : "contenteditable",
        id: candidate.id ?? "",
        name: candidate.getAttribute("name") ?? "",
        label: element.label,
      };
    }
    if (kind === "select") {
      element.options = [...candidate.options]
        .filter((option) => !option.disabled && !option.selected)
        .slice(0, maxOptions)
        .map((option) => ({ value: option.value, label: clean(option.label) }));
    }
    elements.push(element);
  }

  // One "form" action per form: fill every field, then submit. Inserted where its first field was.
  const formElements = [...forms.entries()].map(([form, { fields, index }]) => {
    const submit = [...form.querySelectorAll("button:not([type]), button[type=submit], input[type=submit]")].find(
      (button) => isVisible(button) && !isDisabled(button),
    );
    return {
      index,
      element: {
        kind: "form",
        target: targetOf(form),
        label: clean(form.getAttribute("aria-label") || form.getAttribute("name") || fields.map((f) => f.label).join(", ")),
        fields,
        submit: submit ? targetOf(submit) : null,
      },
    };
  });
  for (const { index, element } of formElements.reverse()) elements.splice(index, 0, element);

  const headings = [...document.querySelectorAll("h1, h2")]
    .filter(isVisible)
    .slice(0, 5)
    .map((heading) => clean(heading.innerText, 60));

  return {
    url: location.href,
    title: document.title,
    headings,
    dialog: dialog ? clean(dialog.querySelector("h1, h2, h3, [role=heading]")?.innerText ?? "dialog", 60) : null,
    alerts: [...document.querySelectorAll("[role=alert], [aria-invalid=true]")].some(isVisible),
    descriptors,
    elements,
  };
}
