// Customisation points of the ripper for the application under test. This file and config.json are
// the only files a team needs to change; the engine in src/ stays as provided.

/**
 * Runs once for every new browser context, before the exploration opens `config.url`: at the start
 * of each run, and again whenever the ripper needs a fresh context to restore a state. Prepare the
 * application here, for example by logging in with abp.ABP_ADMIN_EMAIL and abp.ABP_ADMIN_PASSWORD at
 * abp.ABP_URL.
 *
 * @param {import("playwright").Page} page the page the ripper explores
 * @param {{ abp: Record<string, string>, config: object }} context settings of the application under
 *   test (from the repository's .env, see abp.cjs) and the validated config.json
 */
export async function beforeExploring(page, { abp, config }) {}

/**
 * Optional extra exclusion rule, applied to every action discovered after the `exclude` list of
 * config.json. Return true to never execute the action.
 *
 * @param {{ kind: string, label: string, target: string, href?: string }} action
 * @returns {boolean}
 */
export function isExcluded(action) {
  return false;
}
