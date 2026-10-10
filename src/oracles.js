// Generic oracles. They collect what goes wrong in the page while an action runs; the ripper drains
// them after each action, so every failure belongs to the event (transition) that raised it.

const firstLine = (text) => String(text).split("\n")[0].slice(0, 500);

export class Oracles {
  /** @type {{ type: string, message: string, url: string }[]} */
  #failures = [];

  /**
   * @param {import("playwright").Page} page
   * @param {(url: string) => boolean} inScope only HTTP failures of the application under test count
   */
  constructor(page, inScope) {
    const add = (type, message, url = page.url()) => this.#failures.push({ type, message: firstLine(message), url });
    page.on("pageerror", (error) => add("pageerror", error.message));
    page.on("console", (message) => {
      // Failed resource loads are also logged to the console; the HTTP oracle already reports them.
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
        add("console", message.text(), message.location().url || page.url());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && inScope(response.url())) {
        add("http", `${response.status()} ${response.request().method()} ${response.url()}`, response.url());
      }
    });
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "";
      // Aborted requests are the browser cancelling work on navigation, or the ripper's scope guard.
      if (inScope(request.url()) && !/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT|NS_BINDING_ABORTED|cancelled/i.test(reason)) {
        add("requestfailed", `${reason} ${request.url()}`, request.url());
      }
    });
    page.on("crash", () => add("crash", "La página dejó de responder (crash)"));
  }

  /** Returns the failures collected since the last call and forgets them. */
  drain() {
    return this.#failures.splice(0);
  }
}
