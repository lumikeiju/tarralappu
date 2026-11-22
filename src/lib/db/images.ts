import { getDB } from "./schema";
import type { StoredImage, ID, ImageRole } from "./schema";
import { newId } from "../util/id";
import { inspectImage } from "./media";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return `Unsupported format "${file.type}". Please upload a PNG, JPEG, or WebP image.`;
  }
  if (file.size >= 50 * 1024 * 1024)
    return "Reference images must be smaller than 50 MB.";
  return null;
}

async function prepareStoredImage(
  blob: Blob,
  role: ImageRole
): Promise<StoredImage> {
  const metadata = await inspectImage(blob);
  if (role !== "generated" && !ALLOWED_MIME.has(metadata.mime)) {
    throw new Error(
      "Edit inputs must be PNG, JPEG, or WebP. Extract a still frame or rasterize vector output explicitly first."
    );
  }
  if (role === "markup" && metadata.mime !== "image/png")
    throw new Error("Markup must be PNG.");
  return {
    id: newId(),
    role,
    blob: new Blob([blob], { type: metadata.mime }),
    ...metadata,
    refCount: 1,
    createdAt: Date.now()
  };
}

export async function storeImageBlob(
  blob: Blob,
  role: ImageRole
): Promise<StoredImage> {
  const image = await prepareStoredImage(blob, role);
  await (await getDB()).put("images", image);
  return image;
}

export async function getStoredImage(id: ID): Promise<StoredImage | undefined> {
  return (await getDB()).get("images", id);
}

export async function setImageDescription(
  id: ID,
  description: string
): Promise<void> {
  const value = description.trim();
  if (value.length > 500) {
    throw new Error("Image descriptions must be 500 characters or fewer.");
  }
  const tx = (await getDB()).transaction("images", "readwrite");
  const image = await tx.store.get(id);
  if (!image) throw new Error("The stored image is no longer available.");
  image.description = value || undefined;
  await Promise.all([tx.store.put(image), tx.done]);
}

export async function getDisplayImage(id: ID): Promise<StoredImage> {
  const image = await getStoredImage(id);
  if (!image) throw new Error("The stored image is no longer available.");
  if (
    image.width &&
    image.height &&
    (image.mime !== "image/gif" || image.poster)
  )
    return image;
  const metadata = await inspectImage(image.blob);
  const tx = (await getDB()).transaction("images", "readwrite");
  const current = await tx.store.get(id);
  if (!current) throw new Error("The stored image is no longer available.");
  const updated = {
    ...current,
    ...metadata,
    blob: new Blob([image.blob], { type: metadata.mime })
  };
  await Promise.all([tx.store.put(updated), tx.done]);
  return updated;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export function createObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export async function decrementRefCountAndMaybeDelete(
  ids: ID[]
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("images", "readwrite");
  const releaseAll = async () => {
    for (const id of ids) await releaseImage(tx.store, id);
  };
  await Promise.all([releaseAll(), tx.done]);
}

async function releaseImage(
  store: {
    get(id: ID): Promise<StoredImage | undefined>;
    delete(id: ID): Promise<unknown>;
    put(image: StoredImage): Promise<unknown>;
  },
  id: ID
): Promise<void> {
  const image = await store.get(id);
  if (!image) return;
  if (--image.refCount <= 0) await store.delete(id);
  else await store.put(image);
}

export type GlobalReferenceSlot = "styleRefImageId" | "layoutRefImageId";

export async function writeGlobalReference(
  boardId: ID,
  slot: GlobalReferenceSlot,
  file: File | null
): Promise<ID | null> {
  const error = file && validateImageFile(file);
  if (error) throw new Error(error);
  const image =
    file &&
    (await prepareStoredImage(
      file,
      slot === "styleRefImageId" ? "styleRef" : "layoutRef"
    ));
  const nextId = image?.id ?? null;
  const tx = (await getDB()).transaction(["boards", "images"], "readwrite");
  const boards = tx.objectStore("boards");
  const images = tx.objectStore("images");
  const write = async () => {
    const board = await boards.get(boardId);
    if (!board) throw new Error("The board is no longer available.");
    const previousId = board.settings[slot];
    board.settings[slot] = nextId;
    await boards.put(board);
    if (image) await images.add(image);
    if (previousId) await releaseImage(images, previousId);
  };
  await Promise.all([write(), tx.done]);
  return nextId;
}
