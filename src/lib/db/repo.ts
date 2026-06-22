import { getDB } from "./schema";
import type { Board, Chain, Sketch, AppSettings, ID } from "./schema";

// --- Board ---
export async function getBoard(id: ID): Promise<Board | undefined> {
  return (await getDB()).get("boards", id);
}
export async function saveBoard(board: Board): Promise<void> {
  await (await getDB()).put("boards", board);
}

// --- Chains ---
export async function getChain(id: ID): Promise<Chain | undefined> {
  return (await getDB()).get("chains", id);
}
export async function getChainsForBoard(boardId: ID): Promise<Chain[]> {
  return (await getDB()).getAllFromIndex("chains", "boardId", boardId);
}
export async function saveChain(chain: Chain): Promise<void> {
  await (await getDB()).put("chains", chain);
}
export async function deleteChain(id: ID): Promise<void> {
  await (await getDB()).delete("chains", id);
}

// --- Sketches ---
export async function getSketch(id: ID): Promise<Sketch | undefined> {
  return (await getDB()).get("sketches", id);
}
export async function getSketchesForChain(chainId: ID): Promise<Sketch[]> {
  return (await getDB()).getAllFromIndex("sketches", "chainId", chainId);
}
export async function saveSketch(sketch: Sketch): Promise<void> {
  await (await getDB()).put("sketches", sketch);
}
export async function deleteSketch(id: ID): Promise<void> {
  await (await getDB()).delete("sketches", id);
}

// --- Settings ---
export async function getAppSettings(): Promise<AppSettings | undefined> {
  return (await getDB()).get("settings", "app");
}
export async function saveAppSettings(s: AppSettings): Promise<void> {
  await (await getDB()).put("settings", s);
}
