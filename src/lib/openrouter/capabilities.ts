import type {
  RawModel,
  ModelCapabilities,
  ImageModelDiscoveryEntry,
  ImageModelEndpoint,
  AdvancedImageCapabilities,
  ParameterDescriptor
} from "./types";

// Conservative fallback used only when discovery data is unavailable for a
// model (e.g. the /images/models fetch failed, or a brand-new model isn't
// indexed there yet). Real values normally come from resolveCapabilities'
// `discovery` argument below.
const FALLBACK_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const FALLBACK_IMAGE_SIZES = ["1K"];

// OpenAI's GPT-5/5.4 image models generate images by having an LLM call a
// tool rather than through a dedicated image endpoint — see
// https://openrouter.ai/blog/announcements/image-api/ FAQ. These models are
// normally listed by `/images/models` and routed through the Image API with
// their discovery parameters. If discovery is unavailable and they fall back
// to /chat/completions, these are the image_config values known to work there.
const CHAT_COMPLETIONS_IMAGE_TOOL_MODELS = new Set([
  "openai/gpt-5-image",
  "openai/gpt-5-image-mini",
  "openai/gpt-5.4-image-2"
]);
const CHAT_COMPLETIONS_ASPECT_RATIOS = [
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
const CHAT_COMPLETIONS_IMAGE_SIZES = ["1K", "2K", "4K"];
// The Image API has no reasoning parameter, so the effort control applies
// only when one of these models is served through /chat/completions.
const REASONING_EFFORT_MODELS = new Set(["openai/gpt-5.4-image-2"]);

export function isGptImage26(modelId: string): boolean {
  return /^openai\/gpt-image-2\.6-(sunburst|flare)(?:-|$)/.test(modelId);
}

export function advancedCapabilities(
  endpoint: ImageModelEndpoint | null = null
): AdvancedImageCapabilities {
  const params = endpoint?.supported_parameters;
  const allowed = endpoint?.allowed_passthrough_parameters ?? [];
  function range(key: string, min: number, max: number) {
    const descriptor = params?.[key];
    if (descriptor?.type !== "range") return null;
    const result = {
      min: Math.max(min, descriptor.min),
      max: Math.min(max, descriptor.max)
    };
    if (
      result.min > result.max ||
      !Number.isInteger(result.min) ||
      !Number.isInteger(result.max)
    ) {
      throw new Error(`OpenRouter returned incompatible ${key} limits.`);
    }
    return result;
  }
  return {
    endpoint,
    complexity: allowed.includes("complexity"),
    moderation: allowed.includes("moderation"),
    customSize: params?.size?.type === "boolean",
    markup: params?.markup !== undefined,
    partialImages: range("partial_images", 0, 3),
    frameCount: range("frame_count", 2, 16),
    frameDurationMs: range("frame_duration_ms", 20, 2000),
    pending: false,
    error: null
  };
}

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
  const generationApi = discovery ? "images" : "chat";
  // The discovery API doesn't have its own "conversational" concept — this
  // app's meaning is tied to the selected generation endpoint. The dedicated
  // Image API is stateless, even when the catalog model also emits text.
  const conversational =
    generationApi === "chat" && outputModalities.includes("text");
  const isChatCompletionsImageToolModel =
    generationApi === "chat" &&
    CHAT_COMPLETIONS_IMAGE_TOOL_MODELS.has(model.id);

  const params = discovery?.supported_parameters;
  const aspectRatios =
    enumValues(params?.aspect_ratio) ??
    (isChatCompletionsImageToolModel
      ? CHAT_COMPLETIONS_ASPECT_RATIOS
      : discovery
        ? []
        : FALLBACK_ASPECT_RATIOS);
  const imageSizes =
    enumValues(params?.resolution) ??
    (isChatCompletionsImageToolModel
      ? CHAT_COMPLETIONS_IMAGE_SIZES
      : discovery
        ? []
        : FALLBACK_IMAGE_SIZES);
  // Some models (e.g. OpenAI's GPT image models) expose `quality`/`background`
  // instead of aspect_ratio/resolution — surface those so the UI still has
  // *some* image-shape control for them.
  const quality = enumValues(params?.quality) ?? [];
  const background = enumValues(params?.background) ?? [];
  const inputReferences = params?.input_references;
  const minInputImages =
    inputReferences?.type === "range" ? inputReferences.min : 0;
  const maxInputImages = rangeMax(inputReferences) ?? (discovery ? 0 : 1);
  const maxOutputs = rangeMax(params?.n) ?? 1;
  const outputCompression =
    params?.output_compression?.type === "range"
      ? {
          min: params.output_compression.min,
          max: params.output_compression.max
        }
      : null;
  const outputFormats = enumValues(params?.output_format) ?? [];
  const supportsSeed = params?.seed?.type === "boolean";

  return {
    id: model.id,
    name: model.name,
    generationApi,
    outputModalities,
    conversational,
    minInputImages,
    maxInputImages,
    maxOutputs,
    aspectRatios,
    imageSizes,
    quality,
    background,
    outputFormats,
    outputCompression,
    supportsSeed,
    supportsImageConfig:
      aspectRatios.length > 0 ||
      imageSizes.length > 0 ||
      quality.length > 0 ||
      background.length > 0,
    // From discovery, so only Image API models can stream; their SSE events
    // carry partial previews (see imageGenerationStream() in client.ts).
    supportsStreaming: discovery?.supports_streaming ?? false,
    estimated: discovery === undefined,
    pricing: model.pricing,
    advanced: advancedCapabilities()
  };
}

export function resolveAllCapabilities(
  models: RawModel[],
  discoveryEntries: ImageModelDiscoveryEntry[]
): ModelCapabilities[] {
  const byId = new Map(discoveryEntries.map((d) => [d.id, d]));
  return models.map((m) => resolveCapabilities(m, byId.get(m.id)));
}

/**
 * Resolve a stored option against a model's accepted values: the value itself
 * when allowed, otherwise the model's first listed value (e.g. a default "1K"
 * on a model that only accepts ["2K", "4K"]). Undefined when the model lists
 * no values, meaning the parameter should not be sent.
 */
export function effectiveOption(
  value: string | null | undefined,
  allowed: readonly string[]
): string | undefined {
  if (allowed.length === 0) return undefined;
  return value && allowed.includes(value) ? value : allowed[0];
}

/** Whether the model accepts OpenRouter's `reasoning` parameter. */
export function supportsReasoningEffort(
  capabilities: ModelCapabilities | undefined
): boolean {
  return (
    capabilities?.generationApi === "chat" &&
    REASONING_EFFORT_MODELS.has(capabilities.id)
  );
}
