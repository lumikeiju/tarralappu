/// <reference types="bun" />
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { patchBoard, getBoard, saveBoard } from "./repo";
import { defaultBoardSettings, getDB, type StoredImage } from "./schema";
import {
  decrementRefCountAndMaybeDelete,
  getDisplayImage,
  getStoredImage,
  setImageDescription,
  writeGlobalReference
} from "./images";
import { embeddedImageBlob } from "./media";

const png = new File(
  [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)],
  "test.png",
  { type: "image/png" }
);
const bitmap = { width: 4, height: 3, close() {} } as ImageBitmap;
const browserDecoder = Object.getOwnPropertyDescriptor(
  globalThis,
  "createImageBitmap"
);
let boardId: string;

beforeEach(async () => {
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    writable: true,
    value: async () => bitmap
  });
  boardId = crypto.randomUUID();
  await saveBoard({
    id: boardId,
    name: "Test board",
    createdAt: 0,
    settings: defaultBoardSettings()
  });
});

afterEach(() => {
  mock.restore();
  if (browserDecoder)
    Object.defineProperty(globalThis, "createImageBitmap", browserDecoder);
  else Reflect.deleteProperty(globalThis, "createImageBitmap");
});

function legacyImage(refCount: number): StoredImage {
  return {
    id: crypto.randomUUID(),
    role: "generated",
    mime: "image/png",
    blob: png,
    refCount,
    createdAt: 0
  };
}

test("changing references and unrelated board settings preserves both slots", async () => {
  const [styleId, layoutId] = await Promise.all([
    writeGlobalReference(boardId, "styleRefImageId", png),
    writeGlobalReference(boardId, "layoutRefImageId", png),
    patchBoard(boardId, { settings: { styleDoc: "Soft lighting" } })
  ]);
  const replacement = await writeGlobalReference(
    boardId,
    "styleRefImageId",
    png
  );
  expect((await getBoard(boardId))?.settings).toMatchObject({
    styleRefImageId: replacement,
    layoutRefImageId: layoutId,
    styleDoc: "Soft lighting"
  });
  expect(await getStoredImage(styleId!)).toBeUndefined();
  expect(await getStoredImage(replacement!)).toMatchObject({
    role: "styleRef",
    refCount: 1
  });
  expect(await getStoredImage(layoutId!)).toMatchObject({
    role: "layoutRef",
    refCount: 1
  });
  await writeGlobalReference(boardId, "layoutRefImageId", null);
  expect((await getBoard(boardId))?.settings.layoutRefImageId).toBeNull();
  expect(await getStoredImage(layoutId!)).toBeUndefined();
});

test("a failed image write rolls back a reference replacement", async () => {
  const previous = await writeGlobalReference(boardId, "styleRefImageId", png);
  const occupied = legacyImage(1);
  await (await getDB()).put("images", occupied);
  spyOn(crypto, "randomUUID").mockReturnValue(
    occupied.id as ReturnType<typeof crypto.randomUUID>
  );

  await expect(
    writeGlobalReference(boardId, "styleRefImageId", png)
  ).rejects.toThrow();
  expect((await getBoard(boardId))?.settings.styleRefImageId).toBe(previous);
  expect(await getStoredImage(previous!)).toMatchObject({
    role: "styleRef",
    refCount: 1
  });
  expect(await getStoredImage(occupied.id)).toMatchObject({
    role: "generated"
  });
});

test("decoding old image metadata preserves concurrent descriptions and ownership", async () => {
  const image = legacyImage(2);
  await (await getDB()).put("images", image);
  const decoding = Promise.withResolvers<void>();
  const decoded = Promise.withResolvers<ImageBitmap>();
  spyOn(globalThis, "createImageBitmap").mockImplementation(() => {
    decoding.resolve();
    return decoded.promise;
  });
  const displayed = getDisplayImage(image.id);
  await decoding.promise;
  await Promise.all([
    decrementRefCountAndMaybeDelete([image.id]),
    setImageDescription(image.id, "A new description")
  ]);
  decoded.resolve(bitmap);
  expect(await displayed).toMatchObject({
    width: 4,
    height: 3,
    refCount: 1,
    description: "A new description"
  });
});

test("finishing a preview cannot resurrect a deleted image", async () => {
  const image = legacyImage(1);
  await (await getDB()).put("images", image);
  spyOn(globalThis, "createImageBitmap").mockImplementation(async () => {
    await decrementRefCountAndMaybeDelete([image.id]);
    return bitmap;
  });
  await expect(getDisplayImage(image.id)).rejects.toThrow(
    "no longer available"
  );
  expect(await getStoredImage(image.id)).toBeUndefined();
});

test("generated image extraction accepts embedded image bytes", async () => {
  const blob = await embeddedImageBlob("data:image/png;base64,iVBORw0KGgo=");
  expect(blob.type).toBe("image/png");
  expect(await blob.bytes()).toEqual(await png.bytes());
});

test("unsupported generated URLs are rejected before any fetch", async () => {
  const fetch = spyOn(globalThis, "fetch");
  for (const url of [
    "https://example.invalid/image.png",
    "//example.invalid/image.png",
    "/image.png",
    "data:text/html;base64,AA==",
    "data:image/png;base64,",
    undefined
  ]) {
    await expect(embeddedImageBlob(url)).rejects.toThrow(
      "without embedded data"
    );
  }
  expect(fetch).not.toHaveBeenCalled();
});
