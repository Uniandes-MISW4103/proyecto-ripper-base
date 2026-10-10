// Browser session: launches the browser, prepares a context (the team's beforeExploring hook), keeps
// navigation inside the scope, observes the current state and performs actions.
import * as playwright from "playwright";
import { perform } from "./actions.js";
import { inScope } from "./discovery.js";
import { AUTO_ID_PATTERN, abstractionOf, fingerprintOf } from "./fingerprint.js";
import { Oracles } from "./oracles.js";
import { scanDocument } from "./scan.js";

const MAX_SELECT_OPTIONS = 5;

/** Waits for the DOM to stay unchanged for `quietMs` (at most 6 × quietMs), surviving navigations. */
export async function settle(page, quietMs) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    try {
      await page.evaluate(
        (quiet) =>
          new Promise((resolve) => {
            const observer = new MutationObserver(() => {
              clearTimeout(timer);
              timer = setTimeout(done, quiet);
            });
            let timer = setTimeout(done, quiet);
            const deadline = setTimeout(done, quiet * 6);
            function done() {
              observer.disconnect();
              clearTimeout(timer);
              clearTimeout(deadline);
              resolve();
            }
            observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
          }),
        quietMs,
      );
      return;
    } catch {
      // The page navigated while waiting: wait again on the new document.
    }
  }
}

export class Session {
  #browser = null;
  #context = null;
  /** @type {import("playwright").Page | null} */
  #page = null;
  #oracles = null;
  #dialogs = [];
  #external = [];

  /**
   * @param {{ config: object, beforeExploring: (page: import("playwright").Page, context: object) => Promise<void>,
   *   abp: object }} options
   */
  constructor({ config, beforeExploring, abp }) {
    this.config = config;
    this.beforeExploring = beforeExploring;
    this.abp = abp;
    this.inScope = (url) => inScope(url, config.scope);
  }

  get page() {
    return this.#page;
  }

  async open() {
    this.#browser = await playwright[this.config.browser].launch({ headless: this.config.headless });
    await this.reopen();
  }

  /** A fresh browser context (no cookies or storage), prepared by the beforeExploring hook. */
  async reopen() {
    await this.#context?.close();
    const { config } = this;
    this.#context = await this.#browser.newContext({ viewport: config.viewport });
    this.#context.setDefaultTimeout(config.actionTimeoutMs);
    this.#context.setDefaultNavigationTimeout(config.navigationTimeoutMs);
    this.#page = await this.#context.newPage();
    this.#oracles = new Oracles(this.#page, this.inScope);
    this.#page.on("dialog", (dialog) => {
      this.#dialogs.push(dialog.message());
      dialog.dismiss().catch(() => {});
    });

    await this.beforeExploring(this.#page, { abp: this.abp, config });

    // Installed after the hook, which may need to leave the scope (for example, to log in).
    this.#context.on("page", (popup) => {
      if (popup === this.#page) return;
      this.#external.push(popup.url());
      popup.close().catch(() => {});
    });
    await this.#context.route(
      (url) => !this.inScope(url.href),
      (route) => {
        const request = route.request();
        if (request.isNavigationRequest() && request.frame() === this.#page.mainFrame()) {
          this.#external.push(request.url());
          return route.abort("blockedbyclient");
        }
        return route.continue();
      },
    );
  }

  /** Opens the start URL. */
  async home() {
    await this.#page.goto(this.config.url, { waitUntil: "load" });
    await this.settle();
  }

  settle() {
    return settle(this.#page, this.config.settleMs);
  }

  /** Scans the page and identifies its state. */
  async observe() {
    const options = { ignore: this.config.fingerprint.ignore, autoIdPattern: AUTO_ID_PATTERN, maxOptions: MAX_SELECT_OPTIONS };
    let scan;
    try {
      scan = await this.#page.evaluate(scanDocument, options);
    } catch {
      await this.settle();
      scan = await this.#page.evaluate(scanDocument, options);
    }
    const abstraction = abstractionOf(scan, { includeQuery: this.config.fingerprint.includeQuery });
    return { scan, abstraction, fingerprint: fingerprintOf(abstraction) };
  }

  perform(action, value) {
    return perform(this.#page, action, value);
  }

  /** Failures, dialogs and blocked navigations or popups since the last call. */
  drain() {
    return { failures: this.#oracles.drain(), dialogs: this.#dialogs.splice(0), external: this.#external.splice(0) };
  }

  async screenshotPage(path) {
    await this.#page.screenshot({ path, fullPage: true }).catch(() => {});
  }

  /** Screenshot of the action's target before acting on it; false when it can't be taken. */
  async screenshotTarget(action, path) {
    try {
      await this.#page.locator(action.target).first().screenshot({ path, timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async close() {
    await this.#browser?.close();
  }
}
