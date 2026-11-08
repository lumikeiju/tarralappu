/// <reference types="bun" />
import { expect, test } from "bun:test";
import { isSelectedModelOption } from "./modelGroups";

test("one radio represents a selected model even when it is pinned", () => {
  const id = "openai/gpt-image-2.6-sunburst";
  expect(isSelectedModelOption(id, id, "pinned", "pinned", true)).toBe(true);
  expect(isSelectedModelOption(id, id, "catalog", "pinned", true)).toBe(false);
  expect(isSelectedModelOption(id, id, "pinned", "catalog", true)).toBe(false);
  expect(isSelectedModelOption(id, id, "catalog", "catalog", true)).toBe(true);
  expect(isSelectedModelOption(id, id, "catalog", "pinned", false)).toBe(true);
  expect(isSelectedModelOption(id, "other", "pinned", "pinned", true)).toBe(
    false
  );
  expect(isSelectedModelOption(id, null, "catalog", "catalog", false)).toBe(
    false
  );
});
