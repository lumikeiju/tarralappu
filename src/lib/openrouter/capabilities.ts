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

// OpenAI's GPT-5/5.4 image models generate images by having an LLM call a
// tool (OpenAI's Responses API `image_generation` tool), not through
// OpenRouter's dedicated Image API — see
// https://openrouter.ai/blog/announcements/image-api/ FAQ: "GPT 5 and 5.4
// versions generate images through an LLM, so they don't provide access to
// the full set of supported parameters". Tarralappu talks to these models
// via /chat/completions (not /images), so the `/images/models` discovery
// endpoint's `supported_parameters` — which lists only `quality`/
// `background` for them — describes a *different* API surface and doesn't
// mean aspect_ratio/image_size are unsupported here. These are the same
// values that worked via image_config before the discovery migration.
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
  // OpenAI's GPT image models (generated through an LLM, not the dedicated
  // Image API) don't support aspect_ratio/resolution at all \u2014 discovery
  // lists `quality`/`background` for them instead. Surface those so the UI
  // still has *some* image-shape control for these models.
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
    // OpenRouter's discovery marks this true only for OpenAI's GPT image
    // models today. Whether /chat/completions actually forwards partial
    // image previews for `stream: true` (vs. only text deltas) is
    // unconfirmed — see chatCompletionStream() in client.ts — but the flag
    // itself is accurate: these models do support SSE streaming.
    supportsStreaming: discovery?.supports_streaming ?? false,
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
