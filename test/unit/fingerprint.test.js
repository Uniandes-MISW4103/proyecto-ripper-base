import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_ID_PATTERN, abstractionOf, fingerprintOf, matches, normalizeRoute, routeOf, similarity } from "../../src/fingerprint.js";

const scan = (overrides = {}) => ({
  url: "http://localhost:2368/ghost/?ref=1#/posts",
  headings: ["Posts"],
  dialog: null,
  alerts: false,
  descriptors: ["link|a|||data-test-nav=posts", "click|button|||", "link|a|||", "link|a|||", "link|a|||"],
  ...overrides,
});

test("the route keeps the hash route and drops the query unless requested", () => {
  assert.equal(normalizeRoute("http://h/ghost/?ref=1#/posts", false), "http://h/ghost/#/posts");
  assert.equal(normalizeRoute("http://h/ghost/?ref=1#/posts", true), "http://h/ghost/?ref=1#/posts");
});

test("order and repetition of features don't matter, so list sizes don't create states", () => {
  const short = abstractionOf(scan(), { includeQuery: false });
  const reordered = abstractionOf(scan({ descriptors: [...scan().descriptors].reverse() }), { includeQuery: false });
  const long = abstractionOf(scan({ descriptors: [...scan().descriptors, "link|a|||"] }), { includeQuery: false });
  assert.equal(fingerprintOf(reordered), fingerprintOf(short));
  assert.equal(fingerprintOf(long), fingerprintOf(short));
  assert.equal(routeOf(short), "http://localhost:2368/ghost/#/posts");
});

test("an open dialog or an alert is a different state", () => {
  const base = fingerprintOf(abstractionOf(scan(), { includeQuery: false }));
  assert.notEqual(base, fingerprintOf(abstractionOf(scan({ dialog: "Delete post" }), { includeQuery: false })));
  assert.notEqual(base, fingerprintOf(abstractionOf(scan({ alerts: true }), { includeQuery: false })));
});

test("generated ids are recognised", () => {
  const auto = new RegExp(AUTO_ID_PATTERN);
  for (const id of ["ember123", ":r1a:", "react-select-2", "mui-12", "radix-:r3:", "headlessui-menu-1", "42"]) assert.ok(auto.test(id), id);
  for (const id of ["main-nav", "title", "ember"]) assert.ok(!auto.test(id), id);
});

test("similarity is 0 across routes and 1 for identical abstractions", () => {
  const a = abstractionOf(scan(), { includeQuery: false });
  const b = abstractionOf(scan({ url: "http://localhost:2368/ghost/#/pages" }), { includeQuery: false });
  assert.equal(similarity(a, b), 0);
  assert.equal(similarity(a, a), 1);
});

test("matches accepts the same fingerprint or a very similar abstraction", () => {
  const abstraction = abstractionOf(scan(), { includeQuery: false });
  const state = { fingerprint: fingerprintOf(abstraction), abstraction };
  assert.ok(matches({ fingerprint: state.fingerprint, abstraction }, state));
  const different = abstractionOf(scan({ headings: ["Members"], descriptors: ["click|button|||"] }), { includeQuery: false });
  assert.ok(!matches({ fingerprint: fingerprintOf(different), abstraction: different }, state));
});
