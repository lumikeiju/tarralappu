import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type ID = string;

/** A single free-text scratchpad note on the "Prompt Board" shelf. */
export interface PromptNote {
  id: ID;
  text: string;
}

export interface BoardSettings {
  defaultModelId: string | null;
  styleDoc: string;
  styleRefImageId: ID | null;
  layoutRefImageId: ID | null;
  sessionCostCapUsd: number | null;
  defaultAspectRatio: string;
  defaultImageSize: string;
  promptNotes: PromptNote[];
}

export interface Board {
  id: ID;
  name: string;
  createdAt: number;
  settings: BoardSettings;
}

export interface Chain {
  id: ID;
  boardId: ID;
  order: number;
  modelId: string;
  forkedFrom: { chainId: ID; sketchOrder: number } | null;
  chainCostCapUsd: number | null;
  createdAt: number;
}

export type SketchStatus = "draft" | "queued" | "generating" | "done" | "error";

export interface AttachFlags {
  styleDoc: boolean;
  styleRef: boolean;
  layoutRef: boolean;
}

export interface SketchRequestSnapshot {
  model: string;
  modalities: ("image" | "text")[];
  image_config?: {
    aspect_ratio?: string;
    image_size?: string;
    quality?: string;
    background?: string;
  };
  provider?: { reasoning_effort?: "low" | "medium" | "high" };
  messages: Array<{
    role: "user" | "assistant";
    text: string;
    imageRefs: ID[];
  }>;
}

export interface Sketch {
  id: ID;
  chainId: ID;
  parentSketchId: ID | null;
  order: number;
  modelId: string;
  prompt: string;
  attach: AttachFlags;
  aspectRatio: string;
  imageSize: string;
  /** Only for models without aspect_ratio/resolution support (e.g. GPT image models) */
  quality: string | null;
  background: string | null;
  reasoningEffort: "low" | "medium" | "high" | null;
  status: SketchStatus;
  error: string | null;
  /** Raw API error response (pretty-printed JSON), for the "view raw response" debug affordance. Null for local/synthetic errors with no API response. */
  errorRaw: string | null;
  costEstimateUsd: number | null;
  costActualUsd: number | null;
  resultImageIds: ID[];
  requestSnapshot: SketchRequestSnapshot | null;
  createdAt: number;
}

export type ImageRole = "generated" | "styleRef" | "layoutRef";

export interface StoredImage {
  id: ID;
  role: ImageRole;
  blob: Blob;
  mime: string;
  refCount: number;
  createdAt: number;
}

export interface AppSettings {
  id: "app";
  apiKeyRemembered: boolean;
  defaultModelId: string | null;
  theme: "light" | "dark" | null;
  concurrency: number;
  sessionCostCapUsd: number | null;
  defaultAspectRatio: string;
  defaultImageSize: string;
}

// --- IndexedDB schema ---

interface TarralappuDB extends DBSchema {
  boards: { key: string; value: Board };
  chains: {
    key: string;
    value: Chain;
    indexes: { boardId: string; order: number };
  };
  sketches: {
    key: string;
    value: Sketch;
    indexes: { chainId: string; parentSketchId: string };
  };
  images: {
    key: string;
    value: StoredImage;
    indexes: { role: string };
  };
  settings: { key: string; value: AppSettings };
}

let _db: IDBPDatabase<TarralappuDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<TarralappuDB>> {
  if (_db) return _db;
  _db = await openDB<TarralappuDB>("tarralappu", 1, {
    upgrade(db) {
      db.createObjectStore("boards", { keyPath: "id" });

      const chains = db.createObjectStore("chains", { keyPath: "id" });
      chains.createIndex("boardId", "boardId");
      chains.createIndex("order", "order");

      const sketches = db.createObjectStore("sketches", { keyPath: "id" });
      sketches.createIndex("chainId", "chainId");
      sketches.createIndex("parentSketchId", "parentSketchId");

      const images = db.createObjectStore("images", { keyPath: "id" });
      images.createIndex("role", "role");

      db.createObjectStore("settings", { keyPath: "id" });
    }
  });
  return _db;
}

export const DEFAULT_BOARD_ID = "default";

export function defaultBoardSettings(): BoardSettings {
  return {
    defaultModelId: null,
    styleDoc: "",
    styleRefImageId: null,
    layoutRefImageId: null,
    sessionCostCapUsd: null,
    defaultAspectRatio: "1:1",
    defaultImageSize: "1K",
    promptNotes: []
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    id: "app",
    apiKeyRemembered: false,
    defaultModelId: null,
    theme: null,
    concurrency: 2,
    sessionCostCapUsd: null,
    defaultAspectRatio: "1:1",
    defaultImageSize: "1K"
  };
}
