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

export async function storeImageBlob(
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
  const db = await getDB();
  const image: StoredImage = {
    id: newId(),
    role,
    blob: new Blob([blob], { type: metadata.mime }),
    ...metadata,
    refCount: 1,
    createdAt: Date.now()
  };
  await db.put("images", image);
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
  const db = await getDB();
  const image = await db.get("images", id);
  if (!image) throw new Error("The stored image is no longer available.");
  image.description = value || undefined;
  await db.put("images", image);
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
  const updated = {
    ...image,
    ...metadata,
    blob: new Blob([image.blob], { type: metadata.mime })
  };
  await (await getDB()).put("images", updated);
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
  const image = await storeImageBlob(blob, role);
  if (oldId) {
    await decrementRefCountAndMaybeDelete([oldId]);
  }
  return image;
}

/** Delete a global reference image entirely. */
export async function deleteGlobalImage(id: ID): Promise<void> {
  const db = await getDB();
  await db.delete("images", id);
}
