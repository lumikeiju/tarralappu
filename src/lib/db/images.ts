import { getDB } from "./schema";
import type { StoredImage, ID, ImageRole } from "./schema";
import { newId } from "../util/id";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) {
    return `Unsupported format "${file.type}". Please upload a PNG, JPEG, or WebP image.`;
  }
  return null;
}

export async function storeImageBlob(
  blob: Blob,
  role: ImageRole
): Promise<StoredImage> {
  const db = await getDB();
  const image: StoredImage = {
    id: newId(),
    role,
    blob,
    mime: blob.type,
    refCount: 1,
    createdAt: Date.now()
  };
  await db.put("images", image);
  return image;
}

export async function getStoredImage(id: ID): Promise<StoredImage | undefined> {
  return (await getDB()).get("images", id);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function createObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export async function incrementRefCount(ids: ID[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("images", "readwrite");
  for (const id of ids) {
    const img = await tx.store.get(id);
    if (img) {
      img.refCount++;
      await tx.store.put(img);
    }
  }
  await tx.done;
}

export async function decrementRefCountAndMaybeDelete(
  ids: ID[]
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("images", "readwrite");
  for (const id of ids) {
    const img = await tx.store.get(id);
    if (img) {
      img.refCount--;
      if (img.refCount <= 0) {
        await tx.store.delete(id);
      } else {
        await tx.store.put(img);
      }
    }
  }
  await tx.done;
}

/** Replace a global reference image (style/layout ref). */
export async function replaceGlobalImage(
  oldId: ID | null,
  blob: Blob,
  role: ImageRole
): Promise<StoredImage> {
  if (oldId) {
    await decrementRefCountAndMaybeDelete([oldId]);
  }
  return storeImageBlob(blob, role);
}

/** Delete a global reference image entirely. */
export async function deleteGlobalImage(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete("images", id);
}
