// Browser session: launches the browser, prepares a context (the team's beforeExploring hook), keeps
// navigation inside the scope, observes the current state and performs actions.
import * as playwright from "playwright";
import { perform } from "./actions.js";
import { inScope } from "./discovery.js";
import { AUTO_ID_PATTERN, abstractionOf, fingerprintOf } from "./fingerprint.js";
import { Oracles } from "./oracles.js";
import { scanDocument } from "./scan.js";

const MAX_SELECT_OPTIONS = 5;

/**
 * Waits until the page is idle: no requests in flight, no DOM changes for `quietMs` and no running CSS
 * animations or transitions, for at most max(10 × quietMs, 3 s). Survives navigations.
 * @param {import("playwright").Page} page
 * @param {number} quietMs
 * @param {() => boolean} networkIdle
 */
export async function settle(page, quietMs, networkIdle = () => true) {
  const deadline = Date.now() + Math.max(quietMs * 10, 3000);
  for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    while (!networkIdle() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await page.evaluate(domQuiet, { quiet: quietMs, max: Math.max(0, deadline - Date.now()) });
      if (networkIdle()) return;
    } catch {
      // The page navigated while waiting: wait again on the new document.
    }
  }
}

// Runs in the page: resolves when the DOM has not changed for `quiet` ms and no finite animation runs.
function domQuiet({ quiet, max }) {
  return new Promise((resolve) => {
    const start = performance.now();
    let lastChange = start;
    const observer = new MutationObserver(() => {
      lastChange = performance.now();
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const animating = () =>
      document.getAnimations().some((animation) => {
        const { iterations } = animation.effect?.getTiming() ?? {};
        return animation.playState === "running" && iterations !== Infinity;
      });
    const timer = setInterval(() => {
      const now = performance.now();
      if ((now - lastChange >= quiet && !animating()) || now - start >= max) {
        clearInterval(timer);
        observer.disconnect();
        resolve();
      }
    }, 50);
  });
}

export class Session {
  #browser = null;
  #context = null;
  /** @type {import("playwright").Page | null} */
  #page = null;
  #oracles = null;
  #dialogs = [];
  #external = [];
  #inflight = new Set();

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
    this.#inflight = new Set();
    const inflight = this.#inflight;
    this.#page.on("request", (request) => inflight.add(request));
    this.#page.on("requestfinished", (request) => inflight.delete(request));
    this.#page.on("requestfailed", (request) => inflight.delete(request));
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
    const inflight = this.#inflight;
    return settle(this.#page, this.config.settleMs, () => inflight.size === 0);
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
