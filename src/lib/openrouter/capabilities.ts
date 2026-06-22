import type { RawModel, ModelCapabilities } from "./types";

const DEFAULT_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9"
];
const DEFAULT_IMAGE_SIZES = ["1K", "2K", "4K"];

type CapOverride = {
  conversational?: boolean;
  maxInputImages?: number;
  aspectRatios?: string[];
  imageSizes?: string[];
  supportsImageConfig?: boolean;
};

// Family prefix → override (first match wins, more specific first)
const FAMILY_OVERRIDES: Array<{ prefix: string; caps: CapOverride }> = [
  {
    prefix: "google/gemini",
    caps: {
      conversational: true,
      maxInputImages: 16,
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      imageSizes: ["0.5K", "1K", "2K", "4K"],
      supportsImageConfig: true
    }
  },
  {
    prefix: "black-forest-labs/flux",
    caps: {
      conversational: false,
      maxInputImages: 1,
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      imageSizes: DEFAULT_IMAGE_SIZES,
      supportsImageConfig: true
    }
  },
  {
    prefix: "microsoft/mai-image",
    caps: {
      conversational: false,
      maxInputImages: 1,
      aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
      imageSizes: ["1K"],
      supportsImageConfig: true
    }
  },
  {
    prefix: "openai/gpt",
    caps: {
      conversational: true,
      maxInputImages: 10,
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      imageSizes: DEFAULT_IMAGE_SIZES,
      supportsImageConfig: true
    }
  },
  {
    prefix: "openai/",
    caps: {
      conversational: true,
      maxInputImages: 10,
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      imageSizes: DEFAULT_IMAGE_SIZES,
      supportsImageConfig: true
    }
  },
  {
    prefix: "recraft/",
    caps: {
      conversational: false,
      maxInputImages: 1,
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      imageSizes: ["1K", "2K"],
      supportsImageConfig: true
    }
  },
  {
    prefix: "sourceful/",
    caps: {
      conversational: false,
      maxInputImages: 1,
      aspectRatios: DEFAULT_ASPECT_RATIOS,
      imageSizes: DEFAULT_IMAGE_SIZES,
      supportsImageConfig: true
    }
  }
];

// Extended aspect-ratio set shared by Gemini 3.x image models
const GEMINI_3X_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "1:4",
  "4:1",
  "1:8",
  "8:1"
];

// Exact model ID → override (wins over family prefix)
const MODEL_OVERRIDES: Record<string, CapOverride> = {
  // ── Google Gemini image models ───────────────────────────────────────────
  // Stable (non-preview) versions of Gemini 3.x support the same
  // extended aspect ratios as their preview counterparts.
  "google/gemini-3-pro-image": {
    conversational: true,
    maxInputImages: 16,
    aspectRatios: GEMINI_3X_ASPECT_RATIOS,
    imageSizes: ["0.5K", "1K", "2K", "4K"],
    supportsImageConfig: true
  },
  "google/gemini-3.1-flash-image": {
    conversational: true,
    maxInputImages: 16,
    aspectRatios: GEMINI_3X_ASPECT_RATIOS,
    imageSizes: ["0.5K", "1K", "2K", "4K"],
    supportsImageConfig: true
  },
  // Preview variants kept for backward compat
  "google/gemini-3-pro-image-preview": {
    conversational: true,
    maxInputImages: 16,
    aspectRatios: GEMINI_3X_ASPECT_RATIOS,
    imageSizes: ["0.5K", "1K", "2K", "4K"],
    supportsImageConfig: true
  },
  "google/gemini-3.1-flash-image-preview": {
    conversational: true,
    maxInputImages: 16,
    aspectRatios: GEMINI_3X_ASPECT_RATIOS,
    imageSizes: ["0.5K", "1K", "2K", "4K"],
    supportsImageConfig: true
  },

  // ── FLUX.2 models ───────────────────────────────────────────────────────
  // BFL supports multi-reference editing; max images per their docs:
  //   [pro] / [max] / [flex] → 8 refs via API
  //   [klein] 4B            → 4 refs
  // Max output resolution: ~4 MP → 2K (2048 px) is the practical ceiling.
  "black-forest-labs/flux.2-pro": {
    conversational: false,
    maxInputImages: 8,
    aspectRatios: DEFAULT_ASPECT_RATIOS,
    imageSizes: ["1K", "2K"],
    supportsImageConfig: true
  },
  "black-forest-labs/flux.2-max": {
    conversational: false,
    maxInputImages: 8,
    aspectRatios: DEFAULT_ASPECT_RATIOS,
    imageSizes: ["1K", "2K"],
    supportsImageConfig: true
  },
  "black-forest-labs/flux.2-flex": {
    conversational: false,
    maxInputImages: 8,
    aspectRatios: DEFAULT_ASPECT_RATIOS,
    imageSizes: ["1K", "2K"],
    supportsImageConfig: true
  },
  "black-forest-labs/flux.2-klein-4b": {
    conversational: false,
    maxInputImages: 4,
    aspectRatios: DEFAULT_ASPECT_RATIOS,
    imageSizes: ["1K", "2K"],
    supportsImageConfig: true
  },

  // ── Microsoft MAI-Image ──────────────────────────────────────────────────
  "microsoft/mai-image-2.5": {
    conversational: false,
    maxInputImages: 1,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
    imageSizes: ["1K"],
    supportsImageConfig: true
  }
};

/** Model IDs pinned at the top of the picker (display order).
 *  Matches the 10 models the user has selected; preview variants excluded. */
export const PINNED_MODEL_IDS = [
  // Google Gemini image models (newest → oldest)
  "google/gemini-3-pro-image",
  "google/gemini-3.1-flash-image",
  "google/gemini-2.5-flash-image",
  // OpenAI GPT image models
  "openai/gpt-5-image-mini",
  "openai/gpt-5.4-image-2",
  // FLUX.2 family (alphabetical within family)
  "black-forest-labs/flux.2-flex",
  "black-forest-labs/flux.2-klein-4b",
  "black-forest-labs/flux.2-max",
  "black-forest-labs/flux.2-pro",
  // Microsoft
  "microsoft/mai-image-2.5"
];

function resolveOverride(id: string): CapOverride | null {
  if (MODEL_OVERRIDES[id]) return MODEL_OVERRIDES[id];
  for (const { prefix, caps } of FAMILY_OVERRIDES) {
    if (id.startsWith(prefix)) return caps;
  }
  return null;
}

export function resolveCapabilities(model: RawModel): ModelCapabilities {
  const override = resolveOverride(model.id);
  const outputModalities = (model.architecture?.output_modalities ?? []).filter(
    (m): m is "image" | "text" => m === "image" || m === "text"
  );
  const inferConversational = outputModalities.includes("text");

  return {
    id: model.id,
    name: model.name,
    outputModalities,
    conversational: override?.conversational ?? inferConversational,
    maxInputImages: override?.maxInputImages ?? 1,
    aspectRatios: override?.aspectRatios ?? DEFAULT_ASPECT_RATIOS,
    imageSizes: override?.imageSizes ?? DEFAULT_IMAGE_SIZES,
    supportsImageConfig: override?.supportsImageConfig ?? true,
    estimated: override === null,
    pricing: model.pricing
  };
}

export function resolveAllCapabilities(
  models: RawModel[]
): ModelCapabilities[] {
  return models.map(resolveCapabilities);
}
