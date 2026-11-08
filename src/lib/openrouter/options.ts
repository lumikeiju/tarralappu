import type { Sketch, ID } from "../db/schema";
import type { ImageGenerationRequest, ModelCapabilities } from "./types";
import { effectiveOption, isGptImage26 } from "./capabilities";

export function copyGenerationSettings(sketch: Sketch) {
  return {
    aspectRatio: sketch.aspectRatio,
    imageSize: sketch.imageSize,
    quality: sketch.quality,
    background: sketch.background,
    outputCount: sketch.outputCount ?? 1,
    outputFormat: sketch.outputFormat ?? null,
    outputCompression: sketch.outputCompression ?? null,
    seed: sketch.seed ?? null,
    streamEnabled: sketch.streamEnabled,
    reasoningEffort: sketch.reasoningEffort,
    imageOptions: { ...sketch.imageOptions },
    referenceImageIds: [...(sketch.referenceImageIds ?? [])],
    editSourceImageId: sketch.editSourceImageId ?? null,
    ...(sketch.markup ? { markup: { ...sketch.markup } } : {}),
    budgetAcknowledged: false
  };
}

export function ownedInputImages(sketch: Sketch): ID[] {
  return [
    ...(sketch.referenceImageIds ?? []),
    ...(sketch.markup ? [sketch.markup.imageId] : [])
  ];
}

export function copyRefinementSettings(sketch: Sketch) {
  const settings = copyGenerationSettings(sketch);
  if (sketch.status === "done") {
    settings.editSourceImageId = null;
    delete settings.markup;
  }
  return settings;
}

export function effectiveInputImages(
  sketch: Sketch,
  parentImageIds: ID[]
): ID[] {
  const references = sketch.referenceImageIds ?? [];
  const available = [...parentImageIds, ...references];
  if (
    sketch.editSourceImageId &&
    !available.includes(sketch.editSourceImageId)
  ) {
    throw new Error(
      "The selected edit source is no longer available. Choose another image."
    );
  }
  const parents = sketch.editSourceImageId
    ? [sketch.editSourceImageId]
    : parentImageIds;
  return [...parents, ...references.filter((id) => !parents.includes(id))];
}

export function validatePixelSize(size: string): void {
  if (size === "auto") return;
  const match = /^([1-9]\d*)x([1-9]\d*)$/.exec(size);
  if (!match)
    throw new Error("Size must be auto or WIDTHxHEIGHT, such as 1536x1024.");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width % 16 ||
    height % 16
  ) {
    throw new Error("Width and height must be positive multiples of 16.");
  }
  if (Math.max(width, height) > 3840)
    throw new Error("Neither image edge may exceed 3840 pixels.");
  if (Math.max(width, height) / Math.min(width, height) > 3)
    throw new Error("Image aspect ratio must be between 1:3 and 3:1.");
  if (width * height < 655_360 || width * height > 8_294_400) {
    throw new Error("Still images must contain 655,360 to 8,294,400 pixels.");
  }
}

export function imageRequestOptions(
  sketch: Sketch,
  caps: ModelCapabilities,
  isEdit: boolean
): Omit<
  ImageGenerationRequest,
  "model" | "prompt" | "input_references" | "markup"
> {
  const format = sketch.outputFormat || undefined;
  if (format && !caps.outputFormats.includes(format)) {
    throw new Error(`This endpoint does not support ${format} output.`);
  }
  const vector = format === "svg" && isGptImage26(caps.id);
  const animated = format === "gif";
  if (vector && isEdit)
    throw new Error(
      "Sunburst SVG output is generation-only. Start a new draft or rasterize the source."
    );
  if (
    sketch.background === "transparent" &&
    format &&
    !["png", "webp"].includes(format)
  ) {
    throw new Error("Transparent backgrounds require PNG or WebP output.");
  }
  const body: ReturnType<typeof imageRequestOptions> = {
    stream:
      caps.supportsStreaming && sketch.streamEnabled && !animated && !vector
  };
  const count = sketch.outputCount ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > caps.maxOutputs) {
    throw new Error(
      `Output count must be an integer from 1 to ${caps.maxOutputs}.`
    );
  }
  if (vector && count !== 1)
    throw new Error("SVG generation requires exactly one output.");
  if (count > 1) body.n = count;
  if (count > 1) body.stream = false;
  if (format) body.output_format = format;
  const aspect = effectiveOption(sketch.aspectRatio, caps.aspectRatios);
  const resolution = effectiveOption(sketch.imageSize, caps.imageSizes);
  const quality = effectiveOption(sketch.quality ?? "auto", caps.quality);
  const background = effectiveOption(
    sketch.background ?? "auto",
    caps.background
  );
  if (aspect) body.aspect_ratio = aspect;
  if (resolution) body.resolution = resolution;
  if (quality) body.quality = quality;
  if (background) body.background = background;
  if (
    typeof sketch.outputCompression === "number" &&
    ["jpeg", "webp"].includes(format ?? "")
  ) {
    const range = caps.outputCompression;
    if (
      !range ||
      !Number.isInteger(sketch.outputCompression) ||
      sketch.outputCompression < range.min ||
      sketch.outputCompression > range.max
    ) {
      throw new Error("Compression is outside this endpoint's accepted range.");
    }
    body.output_compression = sketch.outputCompression;
  }
  if (sketch.seed != null) {
    if (
      !caps.supportsSeed ||
      !Number.isSafeInteger(sketch.seed) ||
      sketch.seed < 0
    ) {
      throw new Error("This endpoint does not accept the selected seed.");
    }
    body.seed = sketch.seed;
  }
  const options = sketch.imageOptions ?? {};
  const advanced = caps.advanced;
  if (options.size) {
    if (!advanced.customSize)
      throw new Error(
        "Custom pixel sizing is not confirmed by this OpenRouter endpoint."
      );
    if (animated) {
      if (options.size !== "auto")
        throw new Error(
          "GIF uses automatic frame sizing until OpenRouter confirms its pixel-budget limits."
        );
    } else validatePixelSize(options.size);
    body.size = options.size;
    delete body.aspect_ratio;
    delete body.resolution;
  }
  function setRange(
    value: number | null | undefined,
    range: { min: number; max: number } | null,
    name: string
  ): number | undefined {
    if (value == null) return undefined;
    if (!range)
      throw new Error(`${name} is not confirmed by this OpenRouter endpoint.`);
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(
        `${name} must be an integer from ${range.min} to ${range.max}.`
      );
    }
    return value;
  }
  if (animated) {
    body.frame_count = setRange(
      options.frameCount,
      advanced.frameCount,
      "GIF frame count"
    );
    body.frame_duration_ms = setRange(
      options.frameDurationMs,
      advanced.frameDurationMs,
      "GIF frame duration"
    );
    if (
      body.frame_duration_ms !== undefined &&
      body.frame_duration_ms % 10 !== 0
    ) {
      throw new Error("GIF frame duration must be in 10 ms increments.");
    }
  }
  if (body.stream)
    body.partial_images = setRange(
      options.partialImages,
      advanced.partialImages,
      "Partial preview count"
    );
  const providerOptions: {
    complexity?: "low" | "medium" | "high";
    moderation?: "auto" | "low";
  } = {};
  if (options.complexity) {
    if (
      !advanced.complexity ||
      !["low", "medium", "high"].includes(options.complexity)
    ) {
      throw new Error(
        "The selected complexity is not supported by this OpenRouter endpoint."
      );
    }
    providerOptions.complexity = options.complexity;
  }
  if (options.moderation) {
    if (!advanced.moderation || !["auto", "low"].includes(options.moderation)) {
      throw new Error(
        "The selected moderation option is not supported by this OpenRouter endpoint."
      );
    }
    providerOptions.moderation = options.moderation;
  }
  const usesEndpoint =
    Object.keys(providerOptions).length > 0 ||
    body.size ||
    body.frame_count !== undefined ||
    body.frame_duration_ms !== undefined ||
    body.partial_images !== undefined ||
    sketch.markup;
  if (usesEndpoint) {
    const endpoint = advanced.endpoint;
    if (!endpoint?.provider_tag)
      throw new Error(
        "An eligible provider must be confirmed before using advanced image controls."
      );
    body.provider = {
      only: [endpoint.provider_tag],
      allow_fallbacks: false,
      ...(Object.keys(providerOptions).length
        ? { options: { [endpoint.provider_slug]: providerOptions } }
        : {})
    };
  }
  return body;
}
