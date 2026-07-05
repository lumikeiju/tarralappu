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
  incrementRefCount,
  storeImageBlob,
  getStoredImage,
  blobToBase64,
  dataUrlToBlob
} from "../db/images";
import { DEFAULT_BOARD_ID, defaultBoardSettings } from "../db/schema";
import type {
  Board,
  Chain,
  Sketch,
  BoardSettings,
  AttachFlags,
  ID,
  SketchStatus
} from "../db/schema";
import { newId } from "../util/id";
import {
  listImageModels,
  listImageModelCapabilities
} from "../openrouter/client";
import { resolveAllCapabilities } from "../openrouter/capabilities";
import type { ModelCapabilities } from "../openrouter/types";
import {
  chatCompletion,
  chatCompletionStream,
  humanizeError,
  rawErrorDetails,
  fetchGenerationCost
} from "../openrouter/client";
import { composeRequest } from "../openrouter/compose";
import { estimateCost, parseCostFromResponse } from "../openrouter/cost";
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
  return boardState.sketches.reduce(
    (sum, s) => sum + (s.costActualUsd ?? 0),
    0
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

// ── Prompt board (scratchpad notes) ──────────────────────────────────────────

/** Add a new blank prompt note to the Prompt Board shelf. */
export async function addPromptNote(): Promise<void> {
  const board = boardState.board;
  if (!board) return;
  if (!board.settings.promptNotes) board.settings.promptNotes = [];
  board.settings.promptNotes.push({ id: newId(), text: "" });
  await saveBoard(JSON.parse(JSON.stringify(board)));
}

export async function updatePromptNote(id: ID, text: string): Promise<void> {
  const board = boardState.board;
  if (!board) return;
  const note = board.settings.promptNotes?.find((n) => n.id === id);
  if (!note) return;
  note.text = text;
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
    streamEnabled: false,
    reasoningEffort: null,
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
  const chain = boardState.chains.find((c) => c.id === parent.chainId);
  if (!chain) throw new Error("Chain not found");
  const board = boardState.board;

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
    aspectRatio: parent.aspectRatio,
    imageSize: parent.imageSize,
    quality: parent.quality,
    background: parent.background,
    streamEnabled: parent.streamEnabled,
    reasoningEffort: parent.reasoningEffort,
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

// ── Sketch mutations ─────────────────────────────────────────────────────────

export async function updateSketch(
  sketchId: ID,
  updates: Partial<Sketch>
): Promise<void> {
  const sketch = boardState.sketches.find((s) => s.id === sketchId);
  if (!sketch) return;
  Object.assign(sketch, updates);
  // JSON roundtrip strips Svelte 5 reactive proxies before IDB serialization
  await saveSketch(JSON.parse(JSON.stringify(sketch)));
}

// ── Submit ────────────────────────────────────────────────────────────────────

export function submitSketch(sketchId: ID): void {
  const sketch = boardState.sketches.find((s) => s.id === sketchId);
  if (!sketch || (sketch.status !== "draft" && sketch.status !== "error"))
    return;

  void updateSketch(sketchId, {
    status: "queued",
    error: null,
    errorRaw: null
  });

  queue.enqueue({
    id: sketchId,
    run: (controller) => runGeneration(sketchId, controller)
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

  // Cost cap pre-flight
  const estimate = estimateCost(capabilities);
  if (estimate !== null) {
    const sessionCap = board.settings.sessionCostCapUsd;
    if (sessionCap !== null && getSessionCostTotal() + estimate > sessionCap) {
      await updateSketch(sketchId, {
        status: "error",
        error:
          "Session cost cap would be exceeded. Increase the cap or clear existing cost.",
        errorRaw: null
      });
      return;
    }
    const chainCap = chain.chainCostCapUsd;
    if (chainCap !== null && chainCostTotal(chain.id) + estimate > chainCap) {
      await updateSketch(sketchId, {
        status: "error",
        error:
          "Chain cost cap would be exceeded. Increase the cap or clear existing cost.",
        errorRaw: null
      });
      return;
    }
    await updateSketch(sketchId, { costEstimateUsd: estimate });
  }

  await updateSketch(sketchId, { status: "generating" });

  try {
    const chainSketches = sketchesForChain(sketch.chainId);

    const composed = await composeRequest({
      sketch,
      chainSketches,
      boardSettings: board.settings,
      capabilities,
      getImageBase64: async (id) => {
        const stored = await getStoredImage(id);
        if (!stored) throw new Error(`Image ${id} not found`);
        return blobToBase64(stored.blob);
      }
    });

    // Block if over cap after composition (e.g. unexpected i2i refs)
    if (composed.inputImageCount > capabilities.maxInputImages) {
      await updateSketch(sketchId, {
        status: "error",
        error: `Too many reference images (${composed.inputImageCount} > ${capabilities.maxInputImages}). Uncheck some attachments.`,
        errorRaw: null
      });
      return;
    }

    const response = composed.body.stream
      ? await chatCompletionStream(composed.body, apiKey, controller.signal, {
          onImages: (images) => {
            streamingPreviews[sketchId] = images.map(
              (img) => img.image_url.url
            );
          }
        })
      : await chatCompletion(composed.body, apiKey, controller.signal);

    if (!response.choices?.[0]?.message?.images?.length) {
      await updateSketch(sketchId, {
        status: "error",
        error: "Model returned no image. Try a different prompt or model.",
        errorRaw: null
      });
      return;
    }

    // Store generated images as Blobs
    const resultImageIds: ID[] = [];
    for (const imgItem of response.choices[0].message.images) {
      const dataUrl = imgItem.image_url.url;
      const blob = await dataUrlToBlob(dataUrl);
      const stored = await storeImageBlob(blob, "generated");
      resultImageIds.push(stored.id);
    }

    // Parse cost
    let actualCost = parseCostFromResponse(response);
    if (actualCost === null) {
      actualCost = await fetchGenerationCost(response.id, apiKey);
    }

    await updateSketch(sketchId, {
      status: "done",
      resultImageIds,
      costActualUsd: actualCost,
      requestSnapshot: composed.snapshot,
      error: null,
      errorRaw: null
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // Cancelled by trash — don't update status (sketch is being deleted)
      return;
    }
    await updateSketch(sketchId, {
      status: "error",
      error: humanizeError(e),
      errorRaw: rawErrorDetails(e)
    });
  } finally {
    delete streamingPreviews[sketchId];
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
  const allImageIds = doomed.flatMap((s) => s.resultImageIds);
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

// ── Fork (Refresh) ────────────────────────────────────────────────────────────

/** Fork the chain up to and including `atSketchOrder` into a new chain.
 *  Ancestors are copied (sharing the same image IDs, refcounted).
 *  The fork position becomes a new editable draft pre-filled from the original.
 *
 *  State is updated synchronously before any async DB calls so that the new
 *  chain row renders with its full content in a single frame, not as an empty
 *  row that fills in later. */
export async function forkChain(
  chainId: ID,
  atSketchOrder: number
): Promise<Chain> {
  const sourceChain = boardState.chains.find((c) => c.id === chainId);
  if (!sourceChain) throw new Error("Chain not found");

  // Read source values eagerly (before any awaits) so proxy access is clean.
  const source = boardState.sketches.find(
    (s) => s.chainId === chainId && s.order === atSketchOrder
  );
  const sourcePrompt = source?.prompt ?? "";
  const sourceAspectRatio =
    source?.aspectRatio ??
    boardState.board?.settings.defaultAspectRatio ??
    "1:1";
  const sourceImageSize =
    source?.imageSize ?? boardState.board?.settings.defaultImageSize ?? "1K";
  const sourceQuality = source?.quality ?? null;
  const sourceBackground = source?.background ?? null;
  const sourceStreamEnabled = source?.streamEnabled ?? false;
  const sourceReasoningEffort = source?.reasoningEffort ?? null;

  // Collect ancestors (order < atSketchOrder) and JSON-roundtrip them to strip
  // Svelte 5 reactive proxies before using them as plain data.
  const ancestorProxies = boardState.sketches
    .filter((s) => s.chainId === chainId && s.order < atSketchOrder)
    .sort((a, b) => a.order - b.order);
  const ancestors: Sketch[] = ancestorProxies.map(
    (a) => JSON.parse(JSON.stringify(a)) as Sketch
  );

  const maxOrder = boardState.chains.reduce((m, c) => Math.max(m, c.order), -1);
  const newChain: Chain = {
    id: newId(),
    boardId: DEFAULT_BOARD_ID,
    order: maxOrder + 1,
    modelId: sourceChain.modelId,
    forkedFrom: { chainId, sketchOrder: atSketchOrder },
    chainCostCapUsd: null,
    createdAt: Date.now()
  };

  // Build plain copy objects (new IDs, new chainId).
  const copies: Sketch[] = ancestors.map((ancestor) => ({
    ...ancestor,
    id: newId(),
    chainId: newChain.id,
    createdAt: Date.now()
  }));

  const draft: Sketch = {
    id: newId(),
    chainId: newChain.id,
    parentSketchId: copies.length > 0 ? copies[copies.length - 1].id : null,
    order: atSketchOrder,
    modelId: newChain.modelId,
    prompt: sourcePrompt,
    attach: { styleDoc: false, styleRef: false, layoutRef: false },
    aspectRatio: sourceAspectRatio,
    imageSize: sourceImageSize,
    quality: sourceQuality,
    background: sourceBackground,
    streamEnabled: sourceStreamEnabled,
    reasoningEffort: sourceReasoningEffort,
    status: "draft",
    error: null,
    errorRaw: null,
    costEstimateUsd: null,
    costActualUsd: null,
    resultImageIds: [],
    requestSnapshot: null,
    createdAt: Date.now()
  };

  // ── Synchronous state update (all at once, no awaits) ──────────────────────
  // This ensures the new chain row renders with its full content immediately,
  // rather than rendering an empty row and filling in later.
  boardState.chains.push(newChain);
  for (const copy of copies) boardState.sketches.push(copy);
  boardState.sketches.push(draft);

  // ── Async persistence (state already reflects the fork) ───────────────────
  await saveChain(newChain);
  for (const copy of copies) {
    await incrementRefCount(copy.resultImageIds);
    await saveSketch(copy);
  }
  await saveSketch(draft);

  return newChain;
}
