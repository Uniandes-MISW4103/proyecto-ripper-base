// Executes an action on the page. One executor per kind of action; a new kind needs a scan rule in
// scan.js, an entry in discovery.js and an executor here.

const click = ({ page, action }) => page.locator(action.target).first().click();

async function fillField(page, field, value) {
  const locator = page.locator(field.target).first();
  await locator.fill(value(field));
  await locator.blur();
}

export const executors = {
  link: click,
  click,
  toggle: click,
  select: ({ page, action }) => page.locator(action.target).first().selectOption(action.option),
  fill: ({ page, action, value }) => fillField(page, action.fields[0], value),
  async form({ page, action, value }) {
    for (const field of action.fields) await fillField(page, field, value);
    if (action.submit) await page.locator(action.submit).first().click();
    else await page.locator(action.target).first().evaluate((form) => form.requestSubmit());
  },
};

/**
 * @param {import("playwright").Page} page
 * @param {import("./model.js").Action} action
 * @param {(field: import("./model.js").Field) => string} value
 */
export async function perform(page, action, value) {
  const executor = executors[action.kind];
  if (!executor) throw new Error(`Unknown action kind: ${action.kind}`);
  await executor({ page, action, value });
}
