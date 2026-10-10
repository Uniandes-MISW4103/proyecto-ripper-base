// Values typed into fields. A value from config.json `values` wins (matched by the field's id, name or
// label); otherwise Faker generates one for the field type, seeded with the run seed, the state, the
// action and the field, so the same field always gets the same value in a run and in its replays.
import { Faker, en } from "@faker-js/faker";
import { seedFrom } from "./random.js";

const faker = new Faker({ locale: [en] });

const GENERATORS = {
  email: () => faker.internet.email(),
  password: () => faker.internet.password({ length: 12 }),
  tel: () => faker.phone.number(),
  number: () => String(faker.number.int({ min: 0, max: 1000 })),
  url: () => faker.internet.url(),
  search: () => faker.lorem.word(),
  date: () => faker.date.past().toISOString().slice(0, 10),
  textarea: () => faker.lorem.sentence(),
  contenteditable: () => faker.lorem.sentence(),
};

/**
 * @param {{ target: string, type: string, id: string, name: string, label: string }} field
 * @param {{ seed: number, values: Record<string, string | number>, stateId: string, actionId: string }} context
 */
export function valueFor(field, { seed, values, stateId, actionId }) {
  for (const key of [field.id, field.name, field.label]) {
    if (key && Object.hasOwn(values, key)) return String(values[key]);
  }
  faker.seed(seedFrom(seed, stateId, actionId, field.target));
  return (GENERATORS[field.type] ?? (() => faker.lorem.words(2)))();
}
