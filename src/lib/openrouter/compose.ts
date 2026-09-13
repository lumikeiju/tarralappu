import type {
  ModelCapabilities,
  CompletionRequest,
  ImageGenerationRequest,
  ContentPart,
  ChatMessage
} from "./types";
import type {
  Sketch,
  BoardSettings,
  ID,
  SketchRequestSnapshot
} from "../db/schema";

export interface ComposeInput {
  sketch: Sketch;
  /** All sketches in the chain, ordered by .order */
  chainSketches: Sketch[];
  boardSettings: BoardSettings;
  capabilities: ModelCapabilities;
  /** Returns base64 data URL for a stored image ID */
  getImageBase64: (id: ID) => Promise<string>;
}

export interface ComposeResult {
  body: CompletionRequest | ImageGenerationRequest;
  generationApi: "images" | "chat";
  snapshot: SketchRequestSnapshot;
  inputImageCount: number;
}

function ordinal(n: number): string {
  return (
    [
      "first",
      "second",
      "third",
      "fourth",
      "fifth",
      "sixth",
      "seventh",
      "eighth"
    ][n - 1] ?? `${n}th`
  );
}

/** Build label text for reference images in the current turn. */
function buildRefLabels(
  styleRef: boolean,
  layoutRef: boolean,
  hasStyleRefAsset: boolean,
  hasLayoutRefAsset: boolean
): string {
  const lines: string[] = [];
  let idx = 0;
  if (styleRef && hasStyleRefAsset) {
    idx++;
    lines.push(
      `The ${ordinal(idx)} attached image is a STYLE REFERENCE — match its palette, texture, lighting, and mood; do not copy its subject.`
    );
  }
  if (layoutRef && hasLayoutRefAsset) {
    idx++;
    lines.push(
      `The ${ordinal(idx)} attached image is a LAYOUT REFERENCE — match its composition and element placement; ignore its colours and content.`
    );
  }
  return lines.join("\n");
}

/** Build user message content for a given prompt + attach flags. */
async function buildUserMessage(opts: {
  prompt: string;
  attach: Sketch["attach"];
  boardSettings: BoardSettings;
  conversational: boolean;
  isRefinement: boolean;
  getImageBase64: (id: ID) => Promise<string>;
}): Promise<{ parts: ContentPart[]; imageRefs: ID[]; text: string }> {
  const {
    prompt,
    attach,
    boardSettings,
    conversational,
    isRefinement,
    getImageBase64
  } = opts;
  const textParts: string[] = [];
  const imageRefs: ID[] = [];
  const imageParts: ContentPart[] = [];

  const hasStyleDoc = boardSettings.styleDoc.trim().length > 0;
  const hasStyleRef = boardSettings.styleRefImageId !== null;
  const hasLayoutRef = boardSettings.layoutRefImageId !== null;

  // Style doc
  if (attach.styleDoc && hasStyleDoc) {
    textParts.push(`[STYLE GUIDE]\n${boardSettings.styleDoc.trim()}`);
  }

  // Reference labels (conversational models know their images have roles)
  if (conversational && (attach.styleRef || attach.layoutRef)) {
    const labelText = buildRefLabels(
      attach.styleRef,
      attach.layoutRef,
      hasStyleRef,
      hasLayoutRef
    );
    if (labelText) textParts.push(labelText);
  }

  // Refinement label
  if (isRefinement) {
    textParts.push(`[REFINEMENT REQUEST]\n${prompt}`);
  } else {
    textParts.push(`[REQUEST]\n${prompt}`);
  }

  const text = textParts.join("\n\n");

  // Style ref image (before layout ref to match labels)
  if (attach.styleRef && boardSettings.styleRefImageId) {
    const b64 = await getImageBase64(boardSettings.styleRefImageId);
    imageRefs.push(boardSettings.styleRefImageId);
    imageParts.push({ type: "image_url", image_url: { url: b64 } });
  }
  // Layout ref image
  if (attach.layoutRef && boardSettings.layoutRefImageId) {
    const b64 = await getImageBase64(boardSettings.layoutRefImageId);
    imageRefs.push(boardSettings.layoutRefImageId);
    imageParts.push({ type: "image_url", image_url: { url: b64 } });
  }

  const parts: ContentPart[] = [{ type: "text", text }, ...imageParts];
  return { parts, imageRefs, text };
}

function countImages(messages: ChatMessage[]): number {
  let n = 0;
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      n += msg.content.filter((p) => p.type === "image_url").length;
    }
  }
  return n;
}

/** Truncate oldest user+assistant pairs (that carry images) until within cap. */
function truncateHistoryToFitCap(
  messages: ChatMessage[],
  maxImages: number
): ChatMessage[] {
  const result = [...messages];
  // Always keep the last message (current user turn)
  while (countImages(result) > maxImages && result.length > 1) {
    const firstAssistIdx = result.findIndex((m) => m.role === "assistant");
    if (firstAssistIdx === -1) break;
    // Remove the assistant message and its preceding user message
    result.splice(firstAssistIdx, 1);
    if (result.length > 1 && result[0].role === "user") {
      result.splice(0, 1);
    }
  }
  return result;
}

function buildImageApiLabels(
  parentImageCount: number,
  attach: Sketch["attach"],
  boardSettings: BoardSettings
): string {
  const lines: string[] = [];
  let index = 0;
  for (let i = 0; i < parentImageCount; i++) {
    index++;
    lines.push(
      `The ${ordinal(index)} attached image is a PREVIOUS GENERATED OUTPUT — use it as the image to edit.`
    );
  }
  if (attach.styleRef && boardSettings.styleRefImageId) {
    index++;
    lines.push(
      `The ${ordinal(index)} attached image is a STYLE REFERENCE — match its palette, texture, lighting, and mood; do not copy its subject.`
    );
  }
  if (attach.layoutRef && boardSettings.layoutRefImageId) {
    index++;
    lines.push(
      `The ${ordinal(index)} attached image is a LAYOUT REFERENCE — match its composition and element placement; ignore its colours and content.`
    );
  }
  return lines.join("\n");
}

async function composeImageApiRequest(
  input: ComposeInput
): Promise<ComposeResult> {
  const { sketch, chainSketches, boardSettings, capabilities, getImageBase64 } =
    input;
  const parent = sketch.parentSketchId
    ? chainSketches.find((s) => s.id === sketch.parentSketchId)
    : undefined;
  const parentImageIds = parent?.resultImageIds ?? [];
  const built = await buildUserMessage({
    prompt: sketch.prompt,
    attach: sketch.attach,
    boardSettings,
    conversational: false,
    isRefinement: parent !== undefined,
    getImageBase64
  });
  const promptParts = [
    parentImageIds.length > 0
      ? "[PREVIOUS OUTPUTS]\nUse the attached previous output images as the starting point for this edit."
      : "",
    buildImageApiLabels(parentImageIds.length, sketch.attach, boardSettings),
    built.text
  ].filter(Boolean);
  const prompt = promptParts.join("\n\n");
  const imageRefs = [...parentImageIds, ...built.imageRefs];

  const body: ImageGenerationRequest = {
    model: sketch.modelId,
    prompt,
    stream: capabilities.supportsStreaming && sketch.streamEnabled
  };
  const outputCount = Math.max(
    1,
    Math.min(sketch.outputCount ?? 1, capabilities.maxOutputs)
  );
  if (capabilities.maxOutputs > 1 && outputCount > 1) body.n = outputCount;
  if (capabilities.aspectRatios.length > 0) {
    body.aspect_ratio = sketch.aspectRatio;
  }
  if (capabilities.imageSizes.length > 0) {
    body.resolution = sketch.imageSize;
  }
  if (capabilities.quality.length > 0 && sketch.quality) {
    body.quality = sketch.quality;
  }
  if (capabilities.outputFormats.length > 0 && sketch.outputFormat) {
    body.output_format = sketch.outputFormat;
  }
  if (capabilities.background.length > 0 && sketch.background) {
    body.background = sketch.background;
  }
  if (capabilities.outputCompression && sketch.outputCompression !== null) {
    body.output_compression = sketch.outputCompression;
  }
  if (capabilities.supportsSeed && sketch.seed !== null) {
    body.seed = sketch.seed;
  }
  if (imageRefs.length > 0) {
    const inputReferences = [];
    for (const id of imageRefs) {
      inputReferences.push({
        type: "image_url" as const,
        image_url: { url: await getImageBase64(id) }
      });
    }
    body.input_references = inputReferences;
  }

  const snapshotMessages: SketchRequestSnapshot["messages"] = [
    { role: "user", text: prompt, imageRefs }
  ];
  const snapshotRequest: NonNullable<SketchRequestSnapshot["image_request"]> = {
    model: body.model,
    prompt: body.prompt,
    ...(body.n !== undefined ? { n: body.n } : {}),
    ...(body.resolution ? { resolution: body.resolution } : {}),
    ...(body.aspect_ratio ? { aspect_ratio: body.aspect_ratio } : {}),
    ...(body.quality ? { quality: body.quality } : {}),
    ...(body.output_format ? { output_format: body.output_format } : {}),
    ...(body.background ? { background: body.background } : {}),
    ...(body.output_compression !== undefined
      ? { output_compression: body.output_compression }
      : {}),
    ...(body.seed !== undefined ? { seed: body.seed } : {}),
    stream: body.stream,
    imageRefs
  };

  return {
    body,
    generationApi: "images",
    snapshot: {
      api: "images",
      model: sketch.modelId,
      modalities: ["image"],
      image_request: snapshotRequest,
      stream: body.stream,
      messages: snapshotMessages
    },
    inputImageCount: imageRefs.length
  };
}

export async function composeRequest(
  input: ComposeInput
): Promise<ComposeResult> {
  const { sketch, chainSketches, boardSettings, capabilities, getImageBase64 } =
    input;
  if (capabilities.generationApi === "images") {
    return composeImageApiRequest(input);
  }
  const {
    conversational,
    maxInputImages,
    outputModalities,
    supportsImageConfig
  } = capabilities;
  const isRoot = sketch.parentSketchId === null;

  const messages: ChatMessage[] = [];
  const snapshotMessages: SketchRequestSnapshot["messages"] = [];

  if (isRoot) {
    // Single user message for a root sketch
    const { parts, imageRefs, text } = await buildUserMessage({
      prompt: sketch.prompt,
      attach: sketch.attach,
      boardSettings,
      conversational,
      isRefinement: false,
      getImageBase64
    });
    messages.push({ role: "user", content: parts });
    snapshotMessages.push({ role: "user", text, imageRefs });
  } else if (conversational) {
    // Full conversation thread for conversational models
    const ancestors = chainSketches
      .filter((s) => s.order < sketch.order)
      .sort((a, b) => a.order - b.order);

    for (const ancestor of ancestors) {
      const isAncestorRoot = ancestor.parentSketchId === null;
      const { parts, imageRefs, text } = await buildUserMessage({
        prompt: ancestor.prompt,
        attach: ancestor.attach,
        boardSettings,
        conversational,
        isRefinement: !isAncestorRoot,
        getImageBase64
      });
      messages.push({ role: "user", content: parts });
      snapshotMessages.push({ role: "user", text, imageRefs });

      // Assistant reply carries the generated image(s)
      if (ancestor.resultImageIds.length > 0) {
        const imgParts: ContentPart[] = [];
        for (const imgId of ancestor.resultImageIds) {
          const b64 = await getImageBase64(imgId);
          imgParts.push({ type: "image_url", image_url: { url: b64 } });
        }
        messages.push({ role: "assistant", content: imgParts });
        snapshotMessages.push({
          role: "assistant",
          text: "",
          imageRefs: ancestor.resultImageIds
        });
      }
    }

    // Current turn
    const { parts, imageRefs, text } = await buildUserMessage({
      prompt: sketch.prompt,
      attach: sketch.attach,
      boardSettings,
      conversational,
      isRefinement: true,
      getImageBase64
    });
    messages.push({ role: "user", content: parts });
    snapshotMessages.push({ role: "user", text, imageRefs });
  } else {
    // Image-to-image fallback for non-conversational models
    const parent = chainSketches.find((s) => s.id === sketch.parentSketchId);
    const parentImageIds = parent?.resultImageIds ?? [];

    const {
      parts: refParts,
      imageRefs: refRefs,
      text
    } = await buildUserMessage({
      prompt: sketch.prompt,
      attach: sketch.attach,
      boardSettings,
      conversational: false,
      isRefinement: false,
      getImageBase64
    });

    // Parent image goes first, then style/layout refs
    const textPart = refParts.find((p) => p.type === "text")!;
    const allParts: ContentPart[] = [textPart];
    for (const imgId of parentImageIds) {
      const b64 = await getImageBase64(imgId);
      allParts.push({ type: "image_url", image_url: { url: b64 } });
    }
    for (const p of refParts.filter((p) => p.type === "image_url")) {
      allParts.push(p);
    }

    messages.push({ role: "user", content: allParts });
    snapshotMessages.push({
      role: "user",
      text,
      imageRefs: [...parentImageIds, ...refRefs]
    });
  }

  // Apply input-image cap
  let finalMessages = messages;
  if (countImages(messages) > maxInputImages && conversational) {
    finalMessages = truncateHistoryToFitCap(messages, maxInputImages);
  }
  const inputImageCount = countImages(finalMessages);

  const streamRequested =
    capabilities.supportsStreaming && sketch.streamEnabled;

  const body: CompletionRequest = {
    model: sketch.modelId,
    messages: finalMessages,
    modalities: outputModalities,
    stream: streamRequested,
    usage: { include: true }
  };

  if (supportsImageConfig) {
    const imageConfig: NonNullable<CompletionRequest["image_config"]> = {};
    if (capabilities.aspectRatios.length > 0) {
      imageConfig.aspect_ratio = sketch.aspectRatio;
    }
    if (capabilities.imageSizes.length > 0) {
      imageConfig.image_size = sketch.imageSize;
    }
    if (capabilities.quality.length > 0 && sketch.quality) {
      imageConfig.quality = sketch.quality;
    }
    if (capabilities.background.length > 0 && sketch.background) {
      imageConfig.background = sketch.background;
    }
    body.image_config = imageConfig;
  }

  if (sketch.reasoningEffort) {
    body.provider = { reasoning_effort: sketch.reasoningEffort };
  }

  const snapshot: SketchRequestSnapshot = {
    api: "chat",
    model: sketch.modelId,
    modalities: body.modalities,
    image_config: body.image_config,
    provider: body.provider,
    stream: streamRequested,
    messages: snapshotMessages
  };

  return { body, generationApi: "chat", snapshot, inputImageCount };
}

/** Produce elided JSON for the view-source panel (no base64, no key). */
export function elidedRequestJson(snapshot: SketchRequestSnapshot): string {
  if (snapshot.api === "images" && snapshot.image_request) {
    const request = snapshot.image_request;
    return JSON.stringify(
      {
        model: request.model,
        prompt: request.prompt,
        ...(request.n !== undefined ? { n: request.n } : {}),
        ...(request.resolution ? { resolution: request.resolution } : {}),
        ...(request.aspect_ratio ? { aspect_ratio: request.aspect_ratio } : {}),
        ...(request.quality ? { quality: request.quality } : {}),
        ...(request.output_format
          ? { output_format: request.output_format }
          : {}),
        ...(request.background ? { background: request.background } : {}),
        ...(request.output_compression !== undefined
          ? { output_compression: request.output_compression }
          : {}),
        ...(request.seed !== undefined ? { seed: request.seed } : {}),
        ...(request.imageRefs.length > 0
          ? {
              input_references: request.imageRefs.map((id) => ({
                type: "image_url",
                image_url: {
                  url: `data:image/*;base64,\u2026<imageId=${id}>`
                }
              }))
            }
          : {}),
        stream: request.stream
      },
      null,
      2
    );
  }

  const display = {
    model: snapshot.model,
    modalities: snapshot.modalities,
    ...(snapshot.image_config ? { image_config: snapshot.image_config } : {}),
    ...(snapshot.provider ? { provider: snapshot.provider } : {}),
    messages: snapshot.messages.map((msg) => ({
      role: msg.role,
      content: [
        ...(msg.text ? [{ type: "text", text: msg.text }] : []),
        ...msg.imageRefs.map((id) => ({
          type: "image_url",
          image_url: { url: `data:image/*;base64,\u2026<imageId=${id}>` }
        }))
      ]
    })),
    stream: snapshot.stream,
    usage: { include: true }
  };
  return JSON.stringify(display, null, 2);
}
