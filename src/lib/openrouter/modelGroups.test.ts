/// <reference types="bun" />
import { expect, test } from "bun:test";
import {
  getPinnedModels,
  groupModelsByCreator,
  isSelectedModelOption,
  modelNameForCreator
} from "./modelGroups";
import { resolveCapabilities } from "./capabilities";

function model(id: string, name: string) {
  return resolveCapabilities(
    {
      id,
      name,
      pricing: {},
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["image"]
      }
    },
    undefined
  );
}

test("model names omit only the exact creator heading", () => {
  expect(modelNameForCreator("Google: Nano Banana", "Google")).toBe(
    "Nano Banana"
  );
  expect(modelNameForCreator("Google:Nano: Pro", "Google")).toBe("Nano: Pro");
  expect(modelNameForCreator("Google:   Nano", "Google")).toBe("Nano");
  expect(modelNameForCreator("Google AI: Nano", "Google")).toBe(
    "Google AI: Nano"
  );
  expect(modelNameForCreator("google: Nano", "Google")).toBe("google: Nano");
  expect(modelNameForCreator("Google : Nano", "Google")).toBe("Google : Nano");
  expect(modelNameForCreator("Nano Banana", "Google")).toBe("Nano Banana");
  expect(modelNameForCreator("Google: ", "Google")).toBe("Google: ");
  expect(modelNameForCreator("Google: Nano", "PINNED")).toBe("Google: Nano");
});

test("full creator-prefixed names remain searchable", () => {
  const models = [model("google/nano", "Google: Nano Banana")];
  const groups = groupModelsByCreator(models, "Google: Nano");
  expect(groups[0]?.models[0]?.name).toBe("Google: Nano Banana");
  expect(getPinnedModels(models, ["google/nano"], "Google: Nano")).toEqual(
    models
  );
});

test("pinned models are sorted, unique, and limited to available models", () => {
  const models = [
    model("openai/z", "Zulu"),
    model("google/a", "Alpha"),
    model("openai/b", "Beta")
  ];
  expect(
    getPinnedModels(models, [
      "openai/z",
      "google/a",
      "google/a",
      "missing"
    ]).map((model) => model.id)
  ).toEqual(["google/a", "openai/z"]);
  expect(models.map((model) => model.name)).toEqual(["Zulu", "Alpha", "Beta"]);
  expect(getPinnedModels(models, [])).toEqual([]);
});

test("pinned and catalog sections share case-insensitive name/id filtering", () => {
  const models = [model("openai/z", "Zulu"), model("google/a", "Alpha")];
  const pinnedIds = models.map((model) => model.id);
  for (const filter of [" ALPHA ", "OPENAI/", "", "no match"]) {
    expect(
      getPinnedModels(models, pinnedIds, filter).map((model) => model.id)
    ).toEqual(
      groupModelsByCreator(models, filter)
        .flatMap((group) => group.models)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((model) => model.id)
    );
  }
});

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
