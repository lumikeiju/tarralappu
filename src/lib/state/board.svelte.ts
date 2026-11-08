import {
  getBoard,
  saveBoard,
  getChainsForBoard,
  saveChain,
  deleteChain,
  getSketchesForChain,
  saveSketch,
  deleteSketch
} from "../db/repo";
import {
  decrementRefCountAndMaybeDelete,
  storeImageBlob,
  getDisplayImage,
  validateImageFile,
  blobToBase64,
  dataUrlToBlob
} from "../db/images";
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PINNED_MODEL_IDS,
  defaultBoardSettings,
  getDB
} from "../db/schema";
import type {
  Board,
  Chain,
  Sketch,
  BoardSettings,
  AttachFlags,
  ID,
  PromptNote,
  SketchStatus,
  SketchRequestSnapshot
} from "../db/schema";
import { newId } from "../util/id";
import {
  listImageModels,
  listImageModelCapabilities
} from "../openrouter/client";
import {
  resolveAllCapabilities,
  resolveCapabilities,
  advancedCapabilities,
  isGptImage26
} from "../openrouter/capabilities";
import type { ModelCapabilities } from "../openrouter/types";
import {
  chatCompletion,
  chatCompletionStream,
  imageGeneration,
  imageGenerationStream,
  ImageResponseError,
  OpenRouterApiError,
  humanizeError,
  rawErrorDetails,
  fetchGenerationCost,
  listImageModelEndpoints
} from "../openrouter/client";
import type {
  CompletionResponse,
  CompletionUsage,
  ImageGenerationRequest
} from "../openrouter/types";
import { composeRequest } from "../openrouter/compose";
import {
  addKnownCost,
  estimateCost,
  parseCostFromUsage
} from "../openrouter/cost";
import {
  requestRandomStyleGuide,
  completedStyleGuide
} from "../openrouter/styleGuide";
import {
  requestRandomPrompt,
  completedRandomPrompt
} from "../openrouter/randomPrompt";
import {
  copyGenerationSettings,
  copyRefinementSettings,
  ownedInputImages
} from "../openrouter/options";
import { rasterizeImage, validateMarkup } from "../db/media";
import { Queue } from "../queue/queue";
import { settings, auth } from "./settings.svelte";

// ── Reactive state ──────────────────────────────────────────────────────────

export const boardState = $state({
  board: null as Board | null,
  chains: [] as Chain[],
  sketches: [] as Sketch[],
  availableModels: [] as ModelCapabilities[],
  modelsLoading: false,
  modelsError: null as string | null
});

// Live partial-image preview data URLs per sketch, only populated while a
// streamed (`stream: true`) generation is in flight. Not persisted — cleared
// as soon as the job finishes (success or error), since the final images end
// up in `Sketch.resultImageIds` via IndexedDB like any other generation.
export const streamingPreviews = $state<Record<ID, string[]>>({});
const costReservations = $state<Record<ID, number>>({});
export const randomTextGeneration = $state({ inProgress: false });
const endpointLoads = new Map<string, Promise<void>>();

export function loadImageEndpoints(
  modelId: string,
  refresh = false
): Promise<void> {
  if (!isGptImage26(modelId)) return Promise.resolve();
  const existing = endpointLoads.get(modelId);
  if (existing && !refresh) return existing;
  const caps = capabilitiesFor(modelId);
  if (!caps) return Promise.resolve();
  caps.advanced = { ...caps.advanced, pending: true, error: null };
  const load = (async () => {
    try {
      const response = await listImageModelEndpoints(modelId);
      const endpoint = response.endpoints.find(
        (item) => item.provider_slug === "openai"
      );
      if (!endpoint)
        throw new Error("No eligible OpenAI image endpoint is available.");
      const resolved = resolveCapabilities(
        {
          id: caps.id,
          name: caps.name,
          pricing: caps.pricing,
          architecture: {
            input_modalities: ["text", "image"],
            output_modalities: caps.outputModalities
          }
        },
        {
          id: caps.id,
          name: caps.name,
          architecture: {
            input_modalities: ["text", "image"],
            output_modalities: caps.outputModalities
          },
          supported_parameters: endpoint.supported_parameters,
          supports_streaming: endpoint.supports_streaming,
          endpoints: ""
        }
      );
      Object.assign(caps, resolved, {
        advanced: advancedCapabilities(endpoint)
      });
    } catch (error) {
      caps.advanced = {
        ...caps.advanced,
        pending: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  })();
  endpointLoads.set(modelId, load);
  return load;
}

// ── Derived ─────────────────────────────────────────────────────────────────

export function getChainsOrdered(): Chain[] {
  return [...boardState.chains].sort((a, b) => a.order - b.order);
}

export function sketchesForChain(chainId: ID): Sketch[] {
  return boardState.sketches
    .filter((s) => s.chainId === chainId)
    .sort((a, b) => a.order - b.order);
}

export function getSketchById(id: ID): Sketch | undefined {
  return boardState.sketches.find((s) => s.id === id);
}

export function getChainById(id: ID): Chain | undefined {
  return boardState.chains.find((c) => c.id === id);
}

export function capabilitiesFor(
  modelId: string
): ModelCapabilities | undefined {
  return boardState.availableModels.find((m) => m.id === modelId);
}

export function getSessionCostTotal(): number {
  return (
    (boardState.board?.styleGuideCostUsd ?? 0) +
    (boardState.board?.randomPromptCostUsd ?? 0) +
    boardState.sketches.reduce((sum, s) => sum + (s.costActualUsd ?? 0), 0)
  );
}

export function getSessionBudgetUsed(): number {
  return (
    getSessionCostTotal() +
    Object.values(costReservations).reduce((sum, cost) => sum + cost, 0)
  );
}

export function chainCostTotal(chainId: ID): number {
  return boardState.sketches
    .filter((s) => s.chainId === chainId)
    .reduce((sum, s) => sum + (s.costActualUsd ?? 0), 0);
}

// ── Queue ────────────────────────────────────────────────────────────────────

const queue = new Queue(settings.concurrency, () => {
  // reactive update trigger — queue state changed
});

$effect.root(() => {
  $effect(() => {
    queue.concurrency = settings.concurrency;
  });
});

// ── Init ─────────────────────────────────────────────────────────────────────

export async function initBoard(): Promise<void> {
  // Load or create the single board
  let board = await getBoard(DEFAULT_BOARD_ID);
  if (!board) {
    board = {
      id: DEFAULT_BOARD_ID,
      name: "Board",
      createdAt: Date.now(),
      settings: defaultBoardSettings()
    };
    await saveBoard(board);
  } else if (!board.settings.defaultModelPinsApplied) {
    board.settings.pinnedModelIds = [
      ...new Set([
        ...(board.settings.pinnedModelIds ?? []),
        ...DEFAULT_PINNED_MODEL_IDS
      ])
    ];
    board.settings.defaultModelPinsApplied = true;
    await saveBoard(board);
  }
  boardState.board = board;

  // Load chains + sketches
  const chains = await getChainsForBoard(DEFAULT_BOARD_ID);
  const allSketches: Sketch[] = [];
  for (const chain of chains) {
    const sketches = await getSketchesForChain(chain.id);
    allSketches.push(...sketches);
  }
  boardState.chains = chains;
  boardState.sketches = allSketches;

  const interrupted = allSketches.filter(
    (sketch) => sketch.status === "queued" || sketch.status === "generating"
  );
  for (const sketch of interrupted) {
    const mayHaveUnreportedCost = sketch.status === "generating";
    Object.assign(sketch, {
      status: "error",
      error:
        "Interrupted — the page was closed or reloaded before generation finished.",
      errorRaw: null,
      ...(mayHaveUnreportedCost ? { costUnreported: true } : {})
    });
  }
  await Promise.all(interrupted.map(saveSketch));

  // Load models in background (no key needed)
  void loadAvailableModels();
}

export async function loadAvailableModels(): Promise<void> {
  boardState.modelsLoading = true;
  boardState.modelsError = null;
  try {
    const [res, discovery] = await Promise.all([
      listImageModels(),
      // Real capability data (aspect ratios, sizes, max input images) from
      // OpenRouter's dedicated Image API. Best-effort: if it fails, fall
      // back to conservative per-model defaults marked "estimated".
      listImageModelCapabilities().catch(() => ({ data: [] }))
    ]);
    boardState.availableModels = resolveAllCapabilities(
      res.data,
      discovery.data
    );
    endpointLoads.clear();
  } catch (e) {
    boardState.modelsError = e instanceof Error ? e.message : String(e);
  } finally {
    boardState.modelsLoading = false;
  }
}

// ── Board settings mutations ─────────────────────────────────────────────────

export async function updateBoardSettings(
  updates: Partial<BoardSettings>
): Promise<void> {
  if (!boardState.board) return;
  Object.assign(boardState.board.settings, updates);
  await saveBoard(JSON.parse(JSON.stringify(boardState.board)));
}

type RandomTextOptions = {
  signal?: AbortSignal;
  budgetAcknowledged?: boolean;
};

async function resolveAttemptCost(
  usage: CompletionUsage | undefined,
  generationId: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<number | null> {
  const cost = parseCostFromUsage(usage);
  return cost === null && generationId
    ? fetchGenerationCost(generationId, apiKey, signal)
    : cost;
}

async function generateRandomText(
  target:
    | { kind: "styleGuide" }
    | { kind: "prompt"; noteId: ID }
    | { kind: "sketch"; sketchId: ID },
  options: RandomTextOptions
): Promise<{ costUsd: number | null }> {
  const board = boardState.board;
  const apiKey = auth.apiKey;
  if (!board) throw new Error("The board is not loaded.");
  if (!apiKey) throw new Error("Connect an OpenRouter API key to use Random.");
  if (
    target.kind === "prompt" &&
    !board.settings.promptNotes?.some((note) => note.id === target.noteId)
  ) {
    throw new Error("The prompt note no longer exists.");
  }
  const targetSketch =
    target.kind === "sketch"
      ? boardState.sketches.find((sketch) => sketch.id === target.sketchId)
      : undefined;
  if (
    target.kind === "sketch" &&
    (!targetSketch ||
      (targetSketch.status !== "draft" && targetSketch.status !== "error"))
  ) {
    throw new Error("Random requires an editable draft or errored sketch.");
  }
  const originalPrompt = targetSketch?.prompt;
  if (randomTextGeneration.inProgress)
    throw new Error("Another Random text request is already running.");
  options.signal?.throwIfAborted();
  const cap = board.settings.sessionCostCapUsd;
  if (cap !== null && getSessionBudgetUsed() >= cap) {
    throw new Error(
      "The session cap is reached, including in-flight estimates. Increase it before using Random."
    );
  }
  if (cap !== null && !options.budgetAcknowledged) {
    throw new Error(
      "Random has no reliable pre-send estimate. Acknowledge the budget limitation before generating."
    );
  }
  const costKey =
    target.kind === "styleGuide" ? "styleGuideCostUsd" : "randomPromptCostUsd";
  const unknownCostKey =
    target.kind === "styleGuide"
      ? "styleGuideUnreportedCosts"
      : "randomPromptUnreportedCosts";
  randomTextGeneration.inProgress = true;
  let costRecorded = false;
  async function recordRandomCost(
    response: Pick<CompletionResponse, "id" | "usage">,
    currentBoard: Board,
    credential: string
  ): Promise<number | null> {
    const costUsd = await resolveAttemptCost(
      response.usage,
      response.id,
      credential,
      options.signal
    );
    if (costUsd === null) {
      currentBoard[unknownCostKey] = (currentBoard[unknownCostKey] ?? 0) + 1;
    } else {
      currentBoard[costKey] = (currentBoard[costKey] ?? 0) + costUsd;
    }
    await saveBoard(JSON.parse(JSON.stringify(currentBoard)));
    costRecorded = true;
    return costUsd;
  }
  try {
    const response =
      target.kind === "styleGuide"
        ? await requestRandomStyleGuide(apiKey, options.signal)
        : await requestRandomPrompt(
            apiKey,
            options.signal,
            targetSketch?.parentSketchId ? "refinement" : "generation"
          );
    const costUsd = await recordRandomCost(response, board, apiKey);
    options.signal?.throwIfAborted();
    if (target.kind === "styleGuide") {
      const styleDoc = completedStyleGuide(response);
      const previous = board.settings.styleDoc;
      try {
        await updateBoardSettings({ styleDoc });
      } catch (error) {
        if (board.settings.styleDoc === styleDoc) {
          board.settings.styleDoc = previous;
        }
        throw error;
      }
    } else if (target.kind === "sketch") {
      const prompt = completedRandomPrompt(response);
      const sketch = boardState.sketches.find(
        (sketch) => sketch.id === target.sketchId
      );
      if (
        !sketch ||
        (sketch.status !== "draft" && sketch.status !== "error") ||
        sketch.prompt !== originalPrompt
      ) {
        throw new Error(
          "The sketch was removed or changed before Random completed. Its prompt was not replaced."
        );
      }
      const previous = {
        prompt: sketch.prompt,
        budgetAcknowledged: sketch.budgetAcknowledged
      };
      try {
        await updateSketch(sketch.id, { prompt });
      } catch (error) {
        if (sketch.prompt === prompt) Object.assign(sketch, previous);
        throw error;
      }
    } else {
      const text = completedRandomPrompt(response);
      const note = board.settings.promptNotes?.find(
        (note) => note.id === target.noteId
      );
      if (!note) {
        throw new Error(
          "The prompt note was removed before generation completed."
        );
      }
      const previous = note.text;
      try {
        await updatePromptNote(target.noteId, { text });
      } catch (error) {
        if (note.text === text) note.text = previous;
        throw error;
      }
    }
    return { costUsd };
  } catch (error) {
    if (!costRecorded && error instanceof OpenRouterApiError && error.inBand) {
      await recordRandomCost(
        { id: error.generationId, usage: error.usage },
        board,
        apiKey
      );
    }
    if (
      !costRecorded &&
      ((error instanceof DOMException && error.name === "AbortError") ||
        error instanceof TypeError ||
        error instanceof SyntaxError)
    ) {
      board[unknownCostKey] = (board[unknownCostKey] ?? 0) + 1;
      await saveBoard(JSON.parse(JSON.stringify(board)));
    }
    throw error;
  } finally {
    randomTextGeneration.inProgress = false;
  }
}

export function generateRandomStyleGuide(
  options: RandomTextOptions = {}
): Promise<{ costUsd: number | null }> {
  return generateRandomText({ kind: "styleGuide" }, options);
}

export function generateRandomPrompt(
  noteId: ID,
  options: RandomTextOptions = {}
): Promise<{ costUsd: number | null }> {
  return generateRandomText({ kind: "prompt", noteId }, options);
}

export function generateRandomSketchPrompt(
  sketchId: ID,
  options: RandomTextOptions = {}
): Promise<{ costUsd: number | null }> {
  return generateRandomText({ kind: "sketch", sketchId }, options);
}

// ── Prompt board (scratchpad notes) ──────────────────────────────────────────

/** Add a new blank prompt note to the Prompt Board shelf. */
export async function addPromptNote(): Promise<void> {
  const board = boardState.board;
  if (!board) return;
  if (!board.settings.promptNotes) board.settings.promptNotes = [];
  board.settings.promptNotes.push({ id: newId(), name: "", text: "" });
  await saveBoard(JSON.parse(JSON.stringify(board)));
}

export async function updatePromptNote(
  id: ID,
  updates: Partial<Pick<PromptNote, "name" | "text">>
): Promise<void> {
  const board = boardState.board;
  if (!board) return;
  const note = board.settings.promptNotes?.find((n) => n.id === id);
  if (!note) return;
  Object.assign(note, updates);
  await saveBoard(JSON.parse(JSON.stringify(board)));
}

export async function removePromptNote(id: ID): Promise<void> {
  const board = boardState.board;
  if (!board) return;
  board.settings.promptNotes = (board.settings.promptNotes ?? []).filter(
    (n) => n.id !== id
  );
  await saveBoard(JSON.parse(JSON.stringify(board)));
}

export async function togglePinnedModel(modelId: string): Promise<void> {
  const board = boardState.board;
  if (!board) return;
  const pinnedModelIds = board.settings.pinnedModelIds ?? [];
  board.settings.pinnedModelIds = pinnedModelIds.includes(modelId)
    ? pinnedModelIds.filter((id) => id !== modelId)
    : [...pinnedModelIds, modelId];
  await saveBoard(JSON.parse(JSON.stringify(board)));
}

/**
 * "Send to" a Prompt Board note: create one new chain + draft root sketch
 * per chosen model, all pre-filled with the same prompt text. Each sketch
 * lands as an editable DRAFT (per-chain aspect ratio/size/model still to be
 * confirmed) — the user must still click Generate on each card themselves.
 * Chains are created sequentially (not in parallel) so each one sees the
 * previous chain's `order` — see createChain().
 */
export async function sendPromptToModels(
  prompt: string,
  modelIds: string[]
): Promise<void> {
  for (const modelId of modelIds) {
    const chain = await createChain(modelId);
    await createRootSketch(chain.id, prompt, modelId);
  }
}

// ── Chain mutations ──────────────────────────────────────────────────────────

export async function createChain(modelId: string): Promise<Chain> {
  const maxOrder = boardState.chains.reduce((m, c) => Math.max(m, c.order), -1);
  const chain: Chain = {
    id: newId(),
    boardId: DEFAULT_BOARD_ID,
    order: maxOrder + 1,
    modelId,
    forkedFrom: null,
    chainCostCapUsd: null,
    createdAt: Date.now()
  };
  await saveChain(chain);
  boardState.chains.push(chain);
  return chain;
}

export async function updateChain(
  chainId: ID,
  updates: Partial<Chain>
): Promise<void> {
  const chain = boardState.chains.find((c) => c.id === chainId);
  if (!chain) return;
  Object.assign(chain, updates);
  await saveChain(JSON.parse(JSON.stringify(chain)));
}

/** Create a root draft sketch in a chain. */
export async function createRootSketch(
  chainId: ID,
  prompt: string,
  modelId: string
): Promise<Sketch> {
  const board = boardState.board;
  const sketch: Sketch = {
    id: newId(),
    chainId,
    parentSketchId: null,
    order: 0,
    modelId,
    prompt,
    attach: {
      styleDoc: board?.settings.styleDoc ? true : false,
      styleRef: board?.settings.styleRefImageId ? true : false,
      layoutRef: board?.settings.layoutRefImageId ? true : false
    },
    aspectRatio: board?.settings.defaultAspectRatio ?? "1:1",
    imageSize: board?.settings.defaultImageSize ?? "1K",
    quality: null,
    background: null,
    outputCount: 1,
    outputFormat: null,
    outputCompression: null,
    seed: null,
    streamEnabled: false,
    reasoningEffort: null,
    imageOptions: {},
    referenceImageIds: [],
    editSourceImageId: null,
    budgetAcknowledged: false,
    status: "draft",
    error: null,
    errorRaw: null,
    costEstimateUsd: null,
    costActualUsd: null,
    resultImageIds: [],
    requestSnapshot: null,
    createdAt: Date.now()
  };
  await saveSketch(sketch);
  boardState.sketches.push(sketch);
  return sketch;
}

/** Create a refinement draft sketch at the end of a chain. */
export async function createRefinementSketch(
  parentSketchId: ID
): Promise<Sketch> {
  const parent = boardState.sketches.find((s) => s.id === parentSketchId);
  if (!parent) throw new Error("Parent sketch not found");
  if (parent.status !== "done") {
    throw new Error("Only completed sketches can be refined");
  }
  const chain = boardState.chains.find((c) => c.id === parent.chainId);
  if (!chain) throw new Error("Chain not found");
  const chainSketches = sketchesForChain(chain.id);
  if (chainSketches.at(-1)?.id !== parent.id) {
    throw new Error("Only the latest sketch in a chain can be refined");
  }
  const sketch: Sketch = {
    id: newId(),
    chainId: parent.chainId,
    parentSketchId,
    order: parent.order + 1,
    modelId: chain.modelId,
    prompt: "",
    // Refinements: all refs default OFF (already in conversation history)
    attach: {
      styleDoc: false,
      styleRef: false,
      layoutRef: false
    },
    ...copyRefinementSettings(parent),
    status: "draft",
    error: null,
    errorRaw: null,
    costEstimateUsd: null,
    costActualUsd: null,
    resultImageIds: [],
    requestSnapshot: null,
    createdAt: Date.now()
  };
  await persistSketchesWithImages([sketch]);
  boardState.sketches.push(sketch);
  return sketch;
}

// ── Sketch mutations ─────────────────────────────────────────────────────────

export async function updateSketch(
  sketchId: ID,
  updates: Partial<Sketch>
): Promise<void> {
  const sketch = boardState.sketches.find((s) => s.id === sketchId);
  if (!sketch) return;
  const generationKeys: (keyof Sketch)[] = [
    "prompt",
    "attach",
    "aspectRatio",
    "imageSize",
    "quality",
    "background",
    "outputCount",
    "outputFormat",
    "outputCompression",
    "seed",
    "streamEnabled",
    "reasoningEffort",
    "imageOptions",
    "referenceImageIds",
    "editSourceImageId",
    "markup"
  ];
  if (
    generationKeys.some(
      (key) =>
        key in updates &&
        JSON.stringify(updates[key]) !== JSON.stringify(sketch[key])
    )
  ) {
    sketch.budgetAcknowledged = false;
  }
  Object.assign(sketch, updates);
  // JSON roundtrip strips Svelte 5 reactive proxies before IDB serialization
  await saveSketch(JSON.parse(JSON.stringify(sketch)));
}

type SketchReferenceUpdates = Partial<
  Pick<
    Sketch,
    | "referenceImageIds"
    | "editSourceImageId"
    | "markup"
    | "outputFormat"
    | "imageOptions"
  >
>;

export async function updateSketchReferences(
  sketchId: ID,
  updates: SketchReferenceUpdates
): Promise<void> {
  const sketch = getSketchById(sketchId);
  if (!sketch) throw new Error("Sketch not found.");
  const previous = {
    referenceImageIds: sketch.referenceImageIds?.slice(),
    editSourceImageId: sketch.editSourceImageId,
    markup: sketch.markup ? { ...sketch.markup } : undefined,
    outputFormat: sketch.outputFormat,
    imageOptions: sketch.imageOptions ? { ...sketch.imageOptions } : undefined
  };
  try {
    await updateSketch(sketchId, updates);
  } catch (error) {
    for (const key of [
      "referenceImageIds",
      "editSourceImageId",
      "markup",
      "outputFormat",
      "imageOptions"
    ] as const) {
      if (
        key in updates &&
        JSON.stringify(sketch[key]) === JSON.stringify(updates[key])
      ) {
        Object.assign(sketch, { [key]: previous[key] });
      }
    }
    throw error;
  }
}

export async function addSketchReference(
  sketchId: ID,
  blob: Blob,
  derivedFromImageId?: ID
): Promise<void> {
  const sketch = getSketchById(sketchId);
  if (!sketch) throw new Error("Sketch not found.");
  if (blob instanceof File) {
    const error = validateImageFile(blob);
    if (error) throw new Error(error);
  }
  if (
    (sketch.referenceImageIds?.length ?? 0) >=
    (capabilitiesFor(sketch.modelId)?.maxInputImages ?? 0)
  ) {
    throw new Error("The reference-image limit is reached.");
  }
  const image = await storeImageBlob(blob, "reference");
  try {
    if (derivedFromImageId) {
      image.derivedFromImageId = derivedFromImageId;
      await (await getDB()).put("images", image);
    }
    await updateSketchReferences(sketchId, {
      referenceImageIds: [...(sketch.referenceImageIds ?? []), image.id],
      ...(derivedFromImageId
        ? {
            editSourceImageId: image.id,
            outputFormat: "png",
            imageOptions: {
              ...sketch.imageOptions,
              frameCount: null,
              frameDurationMs: null
            }
          }
        : {})
    });
  } catch (error) {
    await decrementRefCountAndMaybeDelete([image.id]);
    throw error;
  }
}

export async function removeSketchReference(
  sketchId: ID,
  imageId: ID
): Promise<void> {
  const sketch = getSketchById(sketchId);
  if (!sketch) throw new Error("Sketch not found.");
  if (!(sketch.referenceImageIds ?? []).includes(imageId))
    throw new Error("This reference is not attached to the sketch.");
  const wasEditSource = sketch.editSourceImageId === imageId;
  const oldMarkup = wasEditSource ? sketch.markup : undefined;
  await updateSketchReferences(sketchId, {
    referenceImageIds: (sketch.referenceImageIds ?? []).filter(
      (id) => id !== imageId
    ),
    ...(wasEditSource ? { editSourceImageId: null, markup: undefined } : {})
  });
  await decrementRefCountAndMaybeDelete([
    imageId,
    ...(oldMarkup ? [oldMarkup.imageId] : [])
  ]);
}

export async function selectEditSource(
  sketchId: ID,
  imageId: ID | null
): Promise<void> {
  const sketch = getSketchById(sketchId);
  if (!sketch) throw new Error("Sketch not found.");
  if (sketch.editSourceImageId === imageId) return;
  const oldMarkup = sketch.markup;
  await updateSketchReferences(sketchId, {
    editSourceImageId: imageId,
    markup: undefined
  });
  if (oldMarkup) await decrementRefCountAndMaybeDelete([oldMarkup.imageId]);
}

export async function clearMarkup(sketchId: ID): Promise<void> {
  const sketch = getSketchById(sketchId);
  if (!sketch) throw new Error("Sketch not found.");
  const previous = sketch.markup;
  await updateSketchReferences(sketchId, { markup: undefined });
  if (previous) await decrementRefCountAndMaybeDelete([previous.imageId]);
}

export async function attachMarkup(
  sketchId: ID,
  baseImageId: ID,
  blob: Blob
): Promise<void> {
  const sketch = getSketchById(sketchId);
  if (!sketch) throw new Error("Sketch not found.");
  if (!capabilitiesFor(sketch.modelId)?.advanced.markup)
    throw new Error(
      "OpenRouter has not confirmed markup support for this endpoint."
    );
  const base = await getDisplayImage(baseImageId);
  await validateMarkup(blob, base);
  const markup = await storeImageBlob(blob, "markup");
  const previous = sketch.markup;
  try {
    await updateSketchReferences(sketchId, {
      editSourceImageId: baseImageId,
      markup: { imageId: markup.id, baseImageId }
    });
  } catch (error) {
    await decrementRefCountAndMaybeDelete([markup.id]);
    throw error;
  }
  if (previous) await decrementRefCountAndMaybeDelete([previous.imageId]);
}

export async function extractRasterReference(
  sketchId: ID,
  imageId: ID
): Promise<void> {
  const image = await getDisplayImage(imageId);
  await addSketchReference(
    sketchId,
    image.poster ?? (await rasterizeImage(image.blob)),
    imageId
  );
}

// ── Submit ────────────────────────────────────────────────────────────────────

export function submitSketch(sketchId: ID): void {
  const sketch = boardState.sketches.find((s) => s.id === sketchId);
  if (!sketch || (sketch.status !== "draft" && sketch.status !== "error"))
    return;

  void updateSketch(sketchId, {
    status: "queued",
    error: null,
    errorRaw: null,
    costEstimateUsd: null
  });

  queue.enqueue({
    id: sketchId,
    run: (controller) => runGeneration(sketchId, controller)
  });
}

async function recordGenerationAttempt(
  sketch: Sketch,
  response: Pick<CompletionResponse, "id" | "usage" | "imageMetadata">,
  snapshot: SketchRequestSnapshot,
  apiKey: string,
  signal: AbortSignal
): Promise<void> {
  const attemptCost = await resolveAttemptCost(
    response.usage,
    response.id,
    apiKey,
    signal
  );
  signal.throwIfAborted();
  delete costReservations[sketch.id];
  await updateSketch(sketch.id, {
    costActualUsd: addKnownCost(sketch.costActualUsd, attemptCost),
    costUnreported: !!sketch.costUnreported || attemptCost === null,
    generationId: response.id || sketch.generationId,
    requestSnapshot: snapshot,
    resultMetadata: response.imageMetadata
  });
}

async function runGeneration(
  sketchId: ID,
  controller: AbortController
): Promise<void> {
  const sketch = boardState.sketches.find((s) => s.id === sketchId);
  if (!sketch) return;
  const chain = boardState.chains.find((c) => c.id === sketch.chainId);
  if (!chain) return;
  const board = boardState.board;
  if (!board) return;
  const apiKey = auth.apiKey;
  if (!apiKey) {
    await updateSketch(sketchId, {
      status: "error",
      error: "No API key set.",
      errorRaw: null
    });
    return;
  }

  const capabilities = capabilitiesFor(chain.modelId);
  if (!capabilities) {
    await updateSketch(sketchId, {
      status: "error",
      error: "Model capabilities unknown.",
      errorRaw: null
    });
    return;
  }

  await updateSketch(sketchId, { status: "generating" });

  const stagedImageIds: ID[] = [];
  let requestSnapshot: SketchRequestSnapshot | null = null;
  let requestStarted = false;
  let responseReceived = false;
  try {
    await loadImageEndpoints(chain.modelId);
    if (
      isGptImage26(chain.modelId) &&
      (!capabilities.advanced.endpoint || capabilities.advanced.error)
    ) {
      throw new Error(
        capabilities.advanced.error ??
          "Sunburst image endpoint capabilities could not be confirmed."
      );
    }
    const chainSketches = sketchesForChain(sketch.chainId);

    const composed = await composeRequest({
      sketch,
      chainSketches,
      boardSettings: board.settings,
      capabilities,
      getImageBase64: async (id) => {
        const stored = await getDisplayImage(id);
        if (!["image/png", "image/jpeg", "image/webp"].includes(stored.mime)) {
          throw new Error(
            "Edit inputs must be raster PNG, JPEG, or WebP. Extract a GIF still frame or rasterize SVG explicitly first."
          );
        }
        const url = await blobToBase64(stored.blob);
        if (url.length > 20_971_520)
          throw new Error(
            "This reference exceeds the upstream JSON image limit after base64 encoding. Use a smaller image."
          );
        return url;
      }
    });
    requestSnapshot = composed.snapshot;

    // Validate the effective input count before estimating or sending.
    if (composed.inputImageCount < capabilities.minInputImages) {
      await updateSketch(sketchId, {
        status: "error",
        error: `This model requires at least ${capabilities.minInputImages} reference image${capabilities.minInputImages === 1 ? "" : "s"}. Attach more images before generating.`,
        errorRaw: null
      });
      return;
    }
    if (composed.inputImageCount > capabilities.maxInputImages) {
      await updateSketch(sketchId, {
        status: "error",
        error: `Too many reference images (${composed.inputImageCount} > ${capabilities.maxInputImages}). Uncheck some attachments.`,
        errorRaw: null
      });
      return;
    }

    const estimate = estimateCost(
      capabilities,
      composed.inputImageCount,
      sketch.outputCount ?? 1
    );
    const reservationTotal = (chainOnly: boolean) =>
      Object.entries(costReservations).reduce(
        (sum, [id, value]) =>
          sum +
          (!chainOnly || getSketchById(id)?.chainId === chain.id ? value : 0),
        0
      );
    const sessionCap = board.settings.sessionCostCapUsd;
    const chainCap = chain.chainCostCapUsd;
    if (
      (sessionCap !== null && getSessionBudgetUsed() >= sessionCap) ||
      (chainCap !== null &&
        chainCostTotal(chain.id) + reservationTotal(true) >= chainCap)
    ) {
      throw new Error(
        "The cost cap is already reached, including in-flight estimates. Increase it before generating."
      );
    }
    if (
      estimate === null &&
      (sessionCap !== null || chainCap !== null) &&
      !sketch.budgetAcknowledged
    ) {
      throw new Error(
        "This token-billed request has no reliable pre-send estimate. Acknowledge the budget limitation before generating; use an OpenRouter key spending limit for a hard cap."
      );
    }
    if (estimate !== null) {
      if (
        sessionCap !== null &&
        getSessionBudgetUsed() + estimate > sessionCap
      ) {
        await updateSketch(sketchId, {
          status: "error",
          error:
            "Session cost cap would be exceeded. Increase the cap or clear existing cost.",
          errorRaw: null
        });
        return;
      }
      if (
        chainCap !== null &&
        chainCostTotal(chain.id) + reservationTotal(true) + estimate > chainCap
      ) {
        await updateSketch(sketchId, {
          status: "error",
          error:
            "Chain cost cap would be exceeded. Increase the cap or clear existing cost.",
          errorRaw: null
        });
        return;
      }
      costReservations[sketchId] = estimate;
      await updateSketch(sketchId, { costEstimateUsd: estimate });
    } else {
      await updateSketch(sketchId, { costEstimateUsd: null });
    }

    const onImages = (images: { image_url: { url: string } }[]) => {
      streamingPreviews[sketchId] = images.map((img) => img.image_url.url);
    };
    requestStarted = true;
    const response =
      composed.generationApi === "images"
        ? composed.body.stream
          ? await imageGenerationStream(
              composed.body as ImageGenerationRequest,
              apiKey,
              controller.signal,
              { onImages }
            )
          : await imageGeneration(
              composed.body as ImageGenerationRequest,
              apiKey,
              controller.signal
            )
        : composed.body.stream
          ? await chatCompletionStream(
              composed.body as Exclude<
                typeof composed.body,
                ImageGenerationRequest
              >,
              apiKey,
              controller.signal,
              { onImages }
            )
          : await chatCompletion(
              composed.body as Exclude<
                typeof composed.body,
                ImageGenerationRequest
              >,
              apiKey,
              controller.signal
            );

    responseReceived = true;
    await recordGenerationAttempt(
      sketch,
      response,
      composed.snapshot,
      apiKey,
      controller.signal
    );

    if (!response.choices?.[0]?.message?.images?.length) {
      await updateSketch(sketchId, {
        status: "error",
        error: "Model returned no image. Try a different prompt or model.",
        errorRaw: null
      });
      return;
    }

    // Store generated images as Blobs
    const warnings: string[] = [];
    const expectedMime = (
      {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        svg: "image/svg+xml"
      } as Record<string, string>
    )[sketch.outputFormat ?? ""];
    for (const imgItem of response.choices[0].message.images) {
      const dataUrl = imgItem.image_url.url;
      const blob = await dataUrlToBlob(dataUrl);
      const stored = await storeImageBlob(blob, "generated");
      stagedImageIds.push(stored.id);
      if (expectedMime && stored.mime !== expectedMime)
        warnings.push(
          `Requested ${sketch.outputFormat}, but the provider returned ${stored.mime}. The original output was preserved.`
        );
      if (stored.mime === "image/gif" && (stored.frameCount ?? 0) < 2)
        warnings.push(
          "The provider returned a static GIF, not a multi-frame animation."
        );
    }

    if (controller.signal.aborted) {
      const imageIds = stagedImageIds.splice(0);
      await decrementRefCountAndMaybeDelete(imageIds);
      return;
    }

    await updateSketch(sketchId, {
      status: "done",
      resultImageIds: [...stagedImageIds],
      requestSnapshot: composed.snapshot,
      error: null,
      errorRaw: null,
      resultWarning: warnings.length ? [...new Set(warnings)].join(" ") : null
    });
    stagedImageIds.length = 0;
  } catch (e) {
    if (stagedImageIds.length > 0) {
      const imageIds = stagedImageIds.splice(0);
      await decrementRefCountAndMaybeDelete(imageIds);
    }
    if (
      controller.signal.aborted ||
      (e instanceof DOMException && e.name === "AbortError")
    ) {
      // Cancelled by trash — don't update status (sketch is being deleted)
      return;
    }
    let displayError: unknown = e;
    if (
      requestSnapshot &&
      (e instanceof ImageResponseError ||
        (e instanceof OpenRouterApiError && e.inBand))
    ) {
      try {
        await recordGenerationAttempt(
          sketch,
          { id: e.generationId, usage: e.usage },
          requestSnapshot,
          apiKey,
          controller.signal
        );
      } catch (billingError) {
        if (controller.signal.aborted) return;
        displayError = new Error(
          `${humanizeError(e)} Saving billing details failed: ${humanizeError(billingError)}`,
          { cause: billingError }
        );
      }
    }
    if (controller.signal.aborted) return;
    await updateSketch(sketchId, {
      status: "error",
      resultImageIds: [],
      error: humanizeError(displayError),
      errorRaw: rawErrorDetails(e),
      ...(requestStarted &&
      !responseReceived &&
      (e instanceof TypeError || e instanceof SyntaxError)
        ? { costUnreported: true }
        : {})
    });
  } finally {
    delete streamingPreviews[sketchId];
    delete costReservations[sketchId];
  }
}

// ── Cancel ────────────────────────────────────────────────────────────────────
// Not exported: only used internally by trashSketchesFrom() below. Trashing a
// queued/generating card is the only way to cancel a job (no standalone
// cancel button in the UI).
function cancelSketch(sketchId: ID): void {
  queue.cancel(sketchId);
}

// ── Retry (error cards only) ──────────────────────────────────────────────────

export function retrySketch(sketchId: ID): void {
  const sketch = boardState.sketches.find((s) => s.id === sketchId);
  if (!sketch || sketch.status !== "error") return;
  void updateSketch(sketchId, { status: "draft", error: null, errorRaw: null });
  submitSketch(sketchId);
}

// ── Trash (cascade) ───────────────────────────────────────────────────────────

/** Delete all sketches at order >= fromOrder in the chain, then the chain if empty. */
export async function trashSketchesFrom(
  chainId: ID,
  fromOrder: number
): Promise<void> {
  const doomed = boardState.sketches.filter(
    (s) => s.chainId === chainId && s.order >= fromOrder
  );

  // Cancel any active jobs first
  for (const s of doomed) {
    if (s.status === "queued" || s.status === "generating") {
      cancelSketch(s.id);
    }
  }

  // Collect all generated image IDs to decrement
  const allImageIds = doomed.flatMap((s) => [
    ...s.resultImageIds,
    ...ownedInputImages(s)
  ]);
  await decrementRefCountAndMaybeDelete(allImageIds);

  // Delete from DB
  for (const s of doomed) {
    await deleteSketch(s.id);
  }

  // Remove from state
  boardState.sketches = boardState.sketches.filter(
    (s) => !(s.chainId === chainId && s.order >= fromOrder)
  );

  // If chain is now empty, delete it
  const remaining = boardState.sketches.filter((s) => s.chainId === chainId);
  if (remaining.length === 0) {
    await deleteChain(chainId);
    boardState.chains = boardState.chains.filter((c) => c.id !== chainId);
  }
}

// ── Forks ───────────────────────────────────────────────────────────────────

export type ForkCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

function completedPathThrough(source: Sketch): Sketch[] {
  const path = sketchesForChain(source.chainId).filter(
    (sketch) => sketch.order <= source.order
  );
  if (path.some((sketch) => sketch.status !== "done")) {
    throw new Error("Forks require a completed chain path");
  }
  return JSON.parse(JSON.stringify(path)) as Sketch[];
}

function newForkChain(
  source: Sketch,
  kind: "initial" | "reroll" | "refinement"
): Chain {
  const sourceChain = boardState.chains.find((c) => c.id === source.chainId);
  if (!sourceChain) throw new Error("Source chain not found");
  const maxOrder = boardState.chains.reduce((m, c) => Math.max(m, c.order), -1);
  return {
    id: newId(),
    boardId: DEFAULT_BOARD_ID,
    order: maxOrder + 1,
    modelId: sourceChain.modelId,
    forkedFrom: {
      chainId: source.chainId,
      sketchId: source.id,
      sketchOrder: source.order,
      kind
    },
    chainCostCapUsd: null,
    createdAt: Date.now()
  };
}

function initialForkDraft(
  source: Sketch,
  chainId: ID,
  modelId: string
): Sketch {
  return {
    id: newId(),
    chainId,
    parentSketchId: null,
    order: 0,
    modelId,
    prompt: source.prompt,
    attach: { ...source.attach },
    ...copyGenerationSettings(source),
    status: "draft",
    error: null,
    errorRaw: null,
    costEstimateUsd: null,
    costActualUsd: null,
    resultImageIds: [],
    requestSnapshot: null,
    createdAt: Date.now()
  };
}

/** Create one to ten independent initial-run drafts with copied settings. */
export async function forkInitialDrafts(
  sourceSketchId: ID,
  count: ForkCount
): Promise<Chain[]> {
  const source = boardState.sketches.find((s) => s.id === sourceSketchId);
  if (
    !source ||
    (source.status !== "draft" && source.status !== "error") ||
    source.parentSketchId !== null
  ) {
    throw new Error("Only a root draft can create initial forks");
  }

  const forks: Chain[] = [];
  for (let index = 0; index < count; index++) {
    const chain = newForkChain(source, "initial");
    const draft = initialForkDraft(source, chain.id, chain.modelId);
    await persistFork(chain, [], draft);
    forks.push(chain);
  }
  return forks;
}

function copyCompletedPath(path: Sketch[], newChainId: ID): Sketch[] {
  const copiedIds = new Map<ID, ID>();
  for (const sketch of path) copiedIds.set(sketch.id, newId());
  return path.map((sketch) => ({
    ...sketch,
    id: copiedIds.get(sketch.id)!,
    chainId: newChainId,
    parentSketchId: sketch.parentSketchId
      ? (copiedIds.get(sketch.parentSketchId) ?? null)
      : null,
    // Copied history reuses an existing image; it did not incur a new request
    // or cost in this fork.
    costEstimateUsd: null,
    costActualUsd: null,
    costUnreported: false,
    createdAt: Date.now()
  }));
}

async function persistSketchesWithImages(
  sketches: Sketch[],
  chain?: Chain
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["chains", "sketches", "images"], "readwrite");
  try {
    if (chain) await tx.objectStore("chains").put(chain);
    for (const sketch of sketches) {
      for (const id of [
        ...sketch.resultImageIds,
        ...ownedInputImages(sketch)
      ]) {
        const image = await tx.objectStore("images").get(id);
        if (!image)
          throw new Error("A referenced image is no longer available.");
        image.refCount++;
        await tx.objectStore("images").put(image);
      }
      await tx.objectStore("sketches").put(sketch);
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch (abortError) {
      if (!(
        abortError instanceof DOMException &&
        abortError.name === "InvalidStateError"
      ))
        throw abortError;
    }
    await tx.done.then(
      () => {},
      () => {}
    );
    throw error;
  }
}

async function persistFork(
  chain: Chain,
  copies: Sketch[],
  draft: Sketch
): Promise<void> {
  await persistSketchesWithImages([...copies, draft], chain);
  boardState.chains.push(chain);
  boardState.sketches.push(...copies, draft);
}

function refinementDraft(
  parent: Sketch,
  template: Sketch,
  chainId: ID,
  modelId: string,
  prompt: string
): Sketch {
  return {
    id: newId(),
    chainId,
    parentSketchId: parent.id,
    order: parent.order + 1,
    modelId,
    prompt,
    attach: { ...template.attach },
    ...copyRefinementSettings(template),
    status: "draft",
    error: null,
    errorRaw: null,
    costEstimateUsd: null,
    costActualUsd: null,
    resultImageIds: [],
    requestSnapshot: null,
    createdAt: Date.now()
  };
}

/** Re-run a completed prompt in one to ten new rows with editable settings. */
export async function forkReroll(
  sourceSketchId: ID,
  count: ForkCount = 1
): Promise<Chain[]> {
  const source = boardState.sketches.find((s) => s.id === sourceSketchId);
  if (!source || source.status !== "done") {
    throw new Error("Only completed sketches can be re-run in a fork");
  }
  const path = completedPathThrough(source).slice(0, -1);
  const forks: Chain[] = [];
  for (let index = 0; index < count; index++) {
    const chain = newForkChain(source, "reroll");
    const copies = copyCompletedPath(path, chain.id);
    const draft: Sketch = {
      id: newId(),
      chainId: chain.id,
      parentSketchId: copies.at(-1)?.id ?? null,
      order: source.order,
      modelId: chain.modelId,
      prompt: source.prompt,
      attach: { ...source.attach },
      ...copyGenerationSettings(source),
      status: "draft",
      error: null,
      errorRaw: null,
      costEstimateUsd: null,
      costActualUsd: null,
      resultImageIds: [],
      requestSnapshot: null,
      createdAt: Date.now()
    };
    await persistFork(chain, copies, draft);
    forks.push(chain);
  }
  return forks;
}

/** Create one to ten refinement branches from a completed parent.
 * A draft/error refinement resolves to its completed parent, enabling siblings
 * before the first refinement is generated while preserving the draft's
 * prompt and settings. */
export async function forkRefinementDrafts(
  sourceSketchId: ID,
  count: ForkCount
): Promise<Chain[]> {
  const selected = boardState.sketches.find((s) => s.id === sourceSketchId);
  if (!selected) throw new Error("Source sketch not found");
  const source =
    selected.status === "done"
      ? selected
      : selected.parentSketchId &&
          (selected.status === "draft" || selected.status === "error")
        ? boardState.sketches.find((s) => s.id === selected.parentSketchId)
        : undefined;
  if (!source || source.status !== "done") {
    throw new Error("Fork a completed sketch or one of its draft refinements");
  }

  const forks: Chain[] = [];
  for (let index = 0; index < count; index++) {
    const chain = newForkChain(source, "refinement");
    const copies = copyCompletedPath(completedPathThrough(source), chain.id);
    const draft = refinementDraft(
      copies.at(-1)!,
      selected,
      chain.id,
      chain.modelId,
      selected.prompt
    );
    await persistFork(chain, copies, draft);
    forks.push(chain);
  }
  return forks;
}
