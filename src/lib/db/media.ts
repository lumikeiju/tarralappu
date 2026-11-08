export interface MediaInfo {
  mime: string;
  width: number;
  height: number;
  frameCount?: number;
  durationMs?: number;
  poster?: Blob;
}

export function identifyImage(bytes: Uint8Array): string {
  const starts = (...prefix: number[]) =>
    prefix.every((value, index) => bytes[index] === value);
  const text = new TextDecoder().decode(bytes.subarray(0, 512));
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (starts(255, 216, 255)) return "image/jpeg";
  if (/^GIF8[79]a/.test(text)) return "image/gif";
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP")
    return "image/webp";
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/.test(text))
    return "image/svg+xml";
  throw new Error(
    "The result is not a recognized PNG, JPEG, WebP, GIF, or SVG image."
  );
}

export function gifMetadata(
  bytes: Uint8Array
): Pick<MediaInfo, "width" | "height" | "frameCount" | "durationMs"> {
  if (bytes.length < 14 || identifyImage(bytes) !== "image/gif")
    throw new Error("Invalid GIF header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  let offset = 13 + (bytes[10]! & 128 ? 3 * (2 << (bytes[10]! & 7)) : 0);
  let frameCount = 0;
  let durationMs = 0;
  let delay = 0;
  function requireBytes(count: number) {
    if (offset + count > bytes.length) throw new Error("The GIF is truncated.");
  }
  function blocks() {
    while (true) {
      requireBytes(1);
      const size = bytes[offset++]!;
      if (!size) return;
      requireBytes(size);
      offset += size;
    }
  }
  while (offset < bytes.length) {
    requireBytes(1);
    const marker = bytes[offset++];
    if (marker === 59) {
      if (!width || !height || !frameCount)
        throw new Error("The GIF has no valid frames.");
      return { width, height, frameCount, durationMs };
    }
    if (marker === 33) {
      requireBytes(1);
      const label = bytes[offset++];
      if (label === 249) {
        requireBytes(6);
        if (bytes[offset] !== 4 || bytes[offset + 5] !== 0)
          throw new Error("Invalid GIF frame control.");
        delay = view.getUint16(offset + 2, true) * 10;
        offset += 6;
      } else blocks();
    } else if (marker === 44) {
      requireBytes(9);
      const packed = bytes[offset + 8]!;
      offset += 9 + (packed & 128 ? 3 * (2 << (packed & 7)) : 0);
      requireBytes(1);
      offset++;
      blocks();
      frameCount++;
      durationMs += delay;
      delay = 0;
    } else throw new Error("Invalid GIF block.");
  }
  throw new Error("The GIF is missing its completion marker.");
}

export function validateStaticSvg(text: string): {
  width: number;
  height: number;
} {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("SVG document types and entities are not allowed.");
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = document.documentElement;
  if (
    document.querySelector("parsererror") ||
    root.localName !== "svg" ||
    root.namespaceURI !== "http://www.w3.org/2000/svg"
  ) {
    throw new Error("The SVG document is malformed.");
  }
  const allowed = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textPath",
    "defs",
    "use",
    "title",
    "desc",
    "linearGradient",
    "radialGradient",
    "stop",
    "clipPath",
    "mask",
    "pattern",
    "filter",
    "feGaussianBlur",
    "feOffset",
    "feBlend",
    "feColorMatrix",
    "feComposite",
    "feFlood",
    "feMerge",
    "feMergeNode",
    "feComponentTransfer",
    "feFuncR",
    "feFuncG",
    "feFuncB",
    "feFuncA",
    "feDropShadow"
  ]);
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (
      !allowed.has(element.localName) ||
      element.namespaceURI !== root.namespaceURI
    ) {
      throw new Error(
        "SVG must contain static vector content only, without scripts, animation, embedded images, or external resources."
      );
    }
    for (const attribute of element.attributes) {
      const externalUrl = [
        ...attribute.value.matchAll(/url\s*\(([^)]*)\)/gi)
      ].some(
        (match) =>
          !match[1]!
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .startsWith("#")
      );
      if (
        /^on/i.test(attribute.localName) ||
        (attribute.localName === "href" && !attribute.value.startsWith("#")) ||
        externalUrl ||
        /@import|javascript:/i.test(attribute.value)
      ) {
        throw new Error(
          "SVG active content and external resources are not allowed."
        );
      }
    }
  }
  const viewBox = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const dimension = (name: string, fallback: number | undefined) => {
    const value = root.getAttribute(name);
    return value && /^\d+(?:\.\d+)?(?:px)?$/.test(value)
      ? parseFloat(value)
      : fallback;
  };
  const width = dimension(
    "width",
    viewBox.length === 4 ? viewBox[2] : undefined
  );
  const height = dimension(
    "height",
    viewBox.length === 4 ? viewBox[3] : undefined
  );
  if (
    !width ||
    !height ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("SVG must declare positive dimensions or a viewBox.");
  }
  return { width, height };
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not encode the image as PNG.")),
      "image/png"
    );
  });
}

export async function rasterizeImage(blob: Blob): Promise<Blob> {
  const { width, height, poster } = await inspectImage(blob);
  if (poster) return poster;
  if (width * height > 16_777_216) {
    throw new Error("Raster conversion is limited to 16,777,216 pixels.");
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image conversion is not available in this browser.");
    context.drawImage(image, 0, 0, width, height);
    return canvasBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function inspectImage(blob: Blob): Promise<MediaInfo> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = identifyImage(bytes);
  const typedBlob = new Blob([blob], { type: mime });
  if (mime === "image/svg+xml") {
    return {
      mime,
      ...validateStaticSvg(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      )
    };
  }
  const bitmap = await createImageBitmap(typedBlob);
  try {
    if (mime !== "image/gif")
      return { mime, width: bitmap.width, height: bitmap.height };
    const metadata = gifMetadata(bytes);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("GIF poster creation is not available in this browser.");
    // ImageBitmap decodes the default (first) frame of animated images.
    context.drawImage(bitmap, 0, 0);
    return { mime, ...metadata, poster: await canvasBlob(canvas) };
  } finally {
    bitmap.close();
  }
}

export async function validateMarkup(
  blob: Blob,
  base: { width?: number; height?: number }
): Promise<void> {
  if (blob.size >= 50 * 1024 * 1024)
    throw new Error("Markup must be smaller than 50 MB.");
  if (identifyImage(new Uint8Array(await blob.arrayBuffer())) !== "image/png")
    throw new Error("Markup must be a separate transparent PNG.");
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width !== base.width || bitmap.height !== base.height)
      throw new Error("Markup must match the oriented base image dimensions.");
    if (bitmap.width * bitmap.height > 16_777_216)
      throw new Error(
        "Markup and its base may contain at most 16,777,216 pixels."
      );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Markup validation is not available in this browser.");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index]! < 255) return;
    }
    throw new Error(
      "Markup must contain transparent pixels; do not flatten it onto the source image."
    );
  } finally {
    bitmap.close();
  }
}
