import type {
  RawModel,
  ModelCapabilities,
  ImageModelDiscoveryEntry,
  ParameterDescriptor
} from "./types";

// Conservative fallback used only when discovery data is unavailable for a
// model (e.g. the /images/models fetch failed, or a brand-new model isn't
// indexed there yet). Real values normally come from resolveCapabilities'
// `discovery` argument below.
const FALLBACK_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const FALLBACK_IMAGE_SIZES = ["1K"];

function enumValues(desc: ParameterDescriptor | undefined): string[] | null {
  return desc?.type === "enum" ? desc.values : null;
}

function rangeMax(desc: ParameterDescriptor | undefined): number | null {
  return desc?.type === "range" ? desc.max : null;
}

/**
 * Resolve capabilities for a model, preferring authoritative data from
 * OpenRouter's dedicated Image API discovery endpoint
 * (`GET /api/v1/images/models`, see
 * https://openrouter.ai/blog/announcements/image-api/) over guesswork.
 *
 * `discovery` is the matching entry for this model ID, or undefined if the
 * discovery fetch failed or the model isn't listed there — in that case we
 * fall back to conservative defaults and mark the result `estimated`.
 */
export function resolveCapabilities(
  model: RawModel,
  discovery: ImageModelDiscoveryEntry | undefined
): ModelCapabilities {
  const outputModalities = (model.architecture?.output_modalities ?? []).filter(
    (m): m is "image" | "text" => m === "image" || m === "text"
  );
  // The discovery API doesn't have its own "conversational" concept — this
  // app's meaning (does the model support a multi-turn chat thread with
  // images) maps directly to whether it emits text output alongside images.
  const conversational = outputModalities.includes("text");

  const params = discovery?.supported_parameters;
  const aspectRatios =
    enumValues(params?.aspect_ratio) ??
    (discovery ? [] : FALLBACK_ASPECT_RATIOS);
  const imageSizes =
    enumValues(params?.resolution) ?? (discovery ? [] : FALLBACK_IMAGE_SIZES);
  const maxInputImages = rangeMax(params?.input_references) ?? 1;

  return {
    id: model.id,
    name: model.name,
    outputModalities,
    conversational,
    maxInputImages,
    aspectRatios,
    imageSizes,
    supportsImageConfig: aspectRatios.length > 0 || imageSizes.length > 0,
    estimated: discovery === undefined,
    pricing: model.pricing
  };
}

export function resolveAllCapabilities(
  models: RawModel[],
  discoveryEntries: ImageModelDiscoveryEntry[]
): ModelCapabilities[] {
  const byId = new Map(discoveryEntries.map((d) => [d.id, d]));
  return models.map((m) => resolveCapabilities(m, byId.get(m.id)));
}
