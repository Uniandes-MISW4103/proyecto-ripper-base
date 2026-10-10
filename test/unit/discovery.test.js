import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverActions, excludedBy, inScope, orderActions } from "../../src/discovery.js";

const scope = ["http://localhost:2368/"];

test("inScope matches whole prefixes, not look-alike hosts", () => {
  assert.ok(inScope("http://localhost:2368/ghost/#/posts", scope));
  assert.ok(!inScope("http://localhost:23680/", scope));
  assert.ok(!inScope("https://ghost.org/", scope));
  assert.ok(!inScope("not a url", scope));
});

test("excludedBy matches label, link or target, ignoring case", () => {
  const patterns = ["sign out", "delete"];
  assert.equal(excludedBy({ label: "Sign Out", target: "a" }, patterns), "sign out");
  assert.equal(excludedBy({ label: "Remove", href: "http://h/#/delete", target: "a" }, patterns), "delete");
  assert.equal(excludedBy({ label: "Posts", target: "a" }, patterns), null);
});

const scan = {
  elements: [
    { kind: "link", target: "#posts", label: "Posts", href: "http://localhost:2368/ghost/#/posts" },
    { kind: "link", target: "#ghost-org", label: "Ghost", href: "https://ghost.org/" },
    { kind: "link", target: "#signout", label: "Sign out", href: "http://localhost:2368/ghost/#/signout" },
    { kind: "select", target: "#color", label: "Color", options: [{ value: "r", label: "Red" }, { value: "b", label: "Blue" }] },
    { kind: "click", target: "#save", label: "Save" },
    { kind: "click", target: "#save", label: "Save" },
    { kind: "fill", target: "#q", label: "Search", field: { target: "#q", type: "search", id: "q", name: "", label: "Search" } },
  ],
};

test("discoverActions expands select options, dedups, and reports exclusions", () => {
  const { actions, excluded } = discoverActions(scan, { scope, exclude: ["sign out"] });
  assert.deepEqual(
    actions.map((action) => `${action.kind}:${action.label}`),
    ["link:Posts", "select:Color: Red", "select:Color: Blue", "click:Save", "fill:Search"],
  );
  assert.deepEqual(
    excluded.map((item) => `${item.label}:${item.reason}`),
    ["Ghost:fuera del alcance", "Sign out:exclude: sign out"],
  );
  assert.equal(new Set(actions.map((action) => action.id)).size, actions.length);
});

test("action ids are stable", () => {
  const first = discoverActions(scan, { scope, exclude: [] }).actions.map((action) => action.id);
  const second = discoverActions(structuredClone(scan), { scope, exclude: [] }).actions.map((action) => action.id);
  assert.deepEqual(first, second);
});

test("hooks.isExcluded removes actions too", () => {
  const { actions, excluded } = discoverActions(scan, { scope, exclude: [], isExcluded: (action) => action.label === "Save" });
  assert.ok(!actions.some((action) => action.label === "Save"));
  assert.ok(excluded.some((item) => item.reason === "hooks.isExcluded"));
});

test("orderActions depends on the seed and the state only", () => {
  const actions = Array.from({ length: 12 }, (_, index) => ({ id: `a${index}` }));
  const order = orderActions(actions, { seed: 4103, stateId: "s1" });
  assert.deepEqual(order, orderActions([...actions], { seed: 4103, stateId: "s1" }));
  assert.notDeepEqual(order, orderActions(actions, { seed: 7, stateId: "s1" }));
  assert.notDeepEqual(order, orderActions(actions, { seed: 4103, stateId: "s2" }));
});
