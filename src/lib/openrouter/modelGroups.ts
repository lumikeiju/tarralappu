import type { ModelCapabilities } from "./types";

export interface CreatorGroup {
  key: string;
  label: string;
  models: ModelCapabilities[];
}

// Friendly display names for known creators (model id prefix before "/").
const CREATOR_LABELS: Record<string, string> = {
  google: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "black-forest-labs": "Black Forest Labs",
  "bytedance-seed": "ByteDance Seed",
  microsoft: "Microsoft",
  recraft: "Recraft",
  sourceful: "Sourceful",
  "x-ai": "xAI",
  openrouter: "OpenRouter"
};

export function creatorKey(id: string): string {
  return id.split("/")[0] ?? id;
}

export function creatorLabel(key: string): string {
  return (
    CREATOR_LABELS[key] ??
    key
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

/**
 * Group models by creator (id prefix before "/"), optionally filtered by a
 * case-insensitive search term against the model's name/id. Groups are
 * sorted alphabetically by label; models within a group are sorted by name.
 * Shared by ModelPicker.svelte and SendToDialog.svelte so both list models
 * the same way.
 */
export function groupModelsByCreator(
  models: ModelCapabilities[],
  filterTerm = ""
): CreatorGroup[] {
  const term = filterTerm.trim().toLowerCase();
  const filtered = models.filter(
    (m) =>
      term === "" ||
      m.name.toLowerCase().includes(term) ||
      m.id.toLowerCase().includes(term)
  );
  const byCreator = new Map<string, ModelCapabilities[]>();
  for (const m of filtered) {
    const key = creatorKey(m.id);
    const list = byCreator.get(key);
    if (list) list.push(m);
    else byCreator.set(key, [m]);
  }
  return [...byCreator.entries()]
    .map(([key, groupModels]) => ({
      key,
      label: creatorLabel(key),
      models: [...groupModels].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
