/// <reference types="bun" />
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { advancedCapabilities, resolveCapabilities } from "./capabilities";
import {
  imageRequestOptions,
  validatePixelSize,
  copyGenerationSettings,
  copyRefinementSettings,
  effectiveInputImages
} from "./options";
import { composeRequest, elidedRequestJson } from "./compose";
import {
  imageGenerationStream,
  imageGeneration,
  listImageModelEndpoints
} from "./client";
import { addKnownCost, estimateCost, formatUsd } from "./cost";
import { defaultBoardSettings, type Sketch } from "../db/schema";
import { identifyImage, gifMetadata } from "../db/media";
import type { ImageModelEndpoint } from "./types";

const endpoint: ImageModelEndpoint = {
  provider_name: "OpenAI",
  provider_slug: "openai",
  provider_tag: "openai",
  supported_parameters: {
    quality: {
      type: "enum",
      values: ["auto", "low", "medium", "high", "xhigh", "max"]
    },
    output_format: { type: "enum", values: ["png", "jpeg", "webp", "gif"] },
    background: { type: "enum", values: ["auto", "opaque", "transparent"] },
    n: { type: "range", min: 1, max: 10 },
    input_references: { type: "range", min: 0, max: 16 },
    output_compression: { type: "range", min: 0, max: 100 }
  },
  allowed_passthrough_parameters: ["complexity", "moderation"],
  supports_streaming: true,
  pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.00003 }]
};
function capabilities() {
  const caps = resolveCapabilities(
    {
      id: "openai/gpt-image-2.6-sunburst",
      name: "Sunburst",
      pricing: {},
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["image"]
      }
    },
    {
      id: "openai/gpt-image-2.6-sunburst",
      name: "Sunburst",
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["image"]
      },
      supported_parameters: endpoint.supported_parameters,
      supports_streaming: true,
      endpoints: ""
    }
  );
  caps.advanced = advancedCapabilities(endpoint);
  return caps;
}
function sketch(updates: Partial<Sketch> = {}): Sketch {
  return {
    id: "draft",
    chainId: "chain",
    parentSketchId: null,
    order: 0,
    modelId: capabilities().id,
    prompt: "A bakery logo",
    attach: { styleDoc: false, styleRef: false, layoutRef: false },
    aspectRatio: "1:1",
    imageSize: "1K",
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
    createdAt: 0,
    ...updates
  };
}
afterEach(() => {
  mock.restore();
});
function respond(response: Response) {
  spyOn(globalThis, "fetch").mockResolvedValue(response);
}
function streamed(events: unknown[], suffix = "data: [DONE]\n\n") {
  const bytes = new TextEncoder().encode(
    events.map((event) => `data:${JSON.stringify(event)}\r\n\r\n`).join("") +
      suffix
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7)
          controller.enqueue(bytes.slice(index, index + 7));
        controller.close();
      }
    })
  );
}

describe("Sunburst endpoint contract", () => {
  test("new boards default-pin Sunburst and Flare with independent favorites", () => {
    const first = defaultBoardSettings();
    const second = defaultBoardSettings();
    expect(first.pinnedModelIds).toEqual([
      "openai/gpt-image-2.6-sunburst",
      "openai/gpt-image-2.6-flare"
    ]);
    expect(first.defaultModelPinsApplied).toBe(true);
    first.pinnedModelIds.splice(0, 1);
    expect(second.pinnedModelIds).toHaveLength(2);
  });
  test("live capability fixture does not fabricate undocumented fields", () => {
    const caps = capabilities();
    expect(caps.generationApi).toBe("images");
    expect(caps.conversational).toBe(false);
    expect(caps.maxInputImages).toBe(16);
    expect(caps.maxOutputs).toBe(10);
    expect(caps.advanced.complexity).toBe(true);
    expect(caps.advanced.customSize).toBe(false);
    expect(caps.advanced.markup).toBe(false);
    expect(caps.advanced.frameCount).toBeNull();
    expect(caps.outputFormats).not.toContain("svg");
  });
  test("complexity and moderation are correctly provider-pinned", () => {
    const body = imageRequestOptions(
      sketch({ imageOptions: { complexity: "low", moderation: "auto" } }),
      capabilities(),
      false
    );
    expect(body.provider).toEqual({
      only: ["openai"],
      allow_fallbacks: false,
      options: { openai: { complexity: "low", moderation: "auto" } }
    });
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("complexity");
  });
  for (const quality of endpoint.supported_parameters.quality?.type === "enum"
    ? endpoint.supported_parameters.quality.values
    : []) {
    test(`quality ${quality} round-trips`, () => {
      expect(
        imageRequestOptions(sketch({ quality }), capabilities(), false).quality
      ).toBe(quality);
    });
  }
  test("GIF omits incompatible inherited options", () => {
    const body = imageRequestOptions(
      sketch({
        outputFormat: "gif",
        streamEnabled: true,
        outputCompression: 50,
        imageOptions: { partialImages: 3 }
      }),
      capabilities(),
      false
    );
    expect(body.stream).toBe(false);
    expect(body.output_compression).toBeUndefined();
    expect(body.partial_images).toBeUndefined();
  });
  test("unconfirmed GIF controls, pixel size and SVG are blocked", () => {
    expect(() =>
      imageRequestOptions(
        sketch({ outputFormat: "gif", imageOptions: { frameCount: 9 } }),
        capabilities(),
        false
      )
    ).toThrow("not confirmed");
    expect(() =>
      imageRequestOptions(
        sketch({ imageOptions: { size: "1024x1024" } }),
        capabilities(),
        false
      )
    ).toThrow("not confirmed");
    expect(() =>
      imageRequestOptions(
        sketch({ outputFormat: "svg" }),
        capabilities(),
        false
      )
    ).toThrow("does not support");
  });
  test("transparent JPEG is blocked", () => {
    expect(() =>
      imageRequestOptions(
        sketch({ outputFormat: "jpeg", background: "transparent" }),
        capabilities(),
        false
      )
    ).toThrow("PNG or WebP");
  });
  test("multi-output uses the unambiguous buffered path", () => {
    expect(
      imageRequestOptions(
        sketch({ outputCount: 10, streamEnabled: true }),
        capabilities(),
        false
      )
    ).toMatchObject({ n: 10, stream: false });
  });
  test("endpoint response ID must match", async () => {
    respond(Response.json({ id: "wrong", endpoints: [] }));
    await expect(listImageModelEndpoints(capabilities().id)).rejects.toThrow(
      "invalid"
    );
  });
  test("confirmed advanced fields serialize without conflicting size options", () => {
    const caps = capabilities();
    caps.advanced = advancedCapabilities({
      ...endpoint,
      supported_parameters: {
        ...endpoint.supported_parameters,
        size: { type: "boolean" },
        frame_count: { type: "range", min: 2, max: 16 },
        frame_duration_ms: { type: "range", min: 20, max: 2000 },
        partial_images: { type: "range", min: 0, max: 3 }
      }
    });
    const sized = imageRequestOptions(
      sketch({
        imageOptions: { size: "1024x640", partialImages: 3 },
        streamEnabled: true
      }),
      caps,
      false
    );
    expect(sized).toMatchObject({
      size: "1024x640",
      partial_images: 3,
      provider: { only: ["openai"], allow_fallbacks: false }
    });
    expect(sized.aspect_ratio).toBeUndefined();
    expect(sized.resolution).toBeUndefined();
    expect(
      imageRequestOptions(
        sketch({
          outputFormat: "gif",
          imageOptions: { frameCount: 16, frameDurationMs: 2000 }
        }),
        caps,
        true
      )
    ).toMatchObject({
      frame_count: 16,
      frame_duration_ms: 2000,
      stream: false
    });
    for (const frameDurationMs of [19, 25, 2001]) {
      expect(() =>
        imageRequestOptions(
          sketch({ outputFormat: "gif", imageOptions: { frameDurationMs } }),
          caps,
          false
        )
      ).toThrow();
    }
    expect(() =>
      imageRequestOptions(
        sketch({ outputFormat: "gif", imageOptions: { frameCount: 17 } }),
        caps,
        false
      )
    ).toThrow();
    expect(() =>
      imageRequestOptions(
        sketch({ streamEnabled: true, imageOptions: { partialImages: 4 } }),
        caps,
        false
      )
    ).toThrow();
    expect(
      imageRequestOptions(
        sketch({ imageOptions: { frameCount: 9, frameDurationMs: 200 } }),
        caps,
        false
      ).frame_count
    ).toBeUndefined();
  });
  test("SVG remains generation-only and suppresses inherited streaming and compression", () => {
    const caps = capabilities();
    caps.outputFormats.push("svg");
    const source = sketch({
      outputFormat: "svg",
      streamEnabled: true,
      outputCompression: 50
    });
    expect(imageRequestOptions(source, caps, false)).toMatchObject({
      output_format: "svg",
      stream: false
    });
    expect(
      imageRequestOptions(source, caps, false).output_compression
    ).toBeUndefined();
    expect(() => imageRequestOptions(source, caps, true)).toThrow(
      "generation-only"
    );
    expect(() =>
      imageRequestOptions({ ...source, outputCount: 2 }, caps, false)
    ).toThrow("exactly one");
  });
});

describe("input order, snapshots and inheritance", () => {
  test("selected output is first, without duplicate local references", () => {
    expect(
      effectiveInputImages(
        sketch({ editSourceImageId: "b", referenceImageIds: ["c", "d"] }),
        ["a", "b"]
      )
    ).toEqual(["b", "c", "d"]);
    expect(
      effectiveInputImages(
        sketch({ editSourceImageId: "c", referenceImageIds: ["c", "d"] }),
        ["a", "b"]
      )
    ).toEqual(["c", "d"]);
    expect(effectiveInputImages(sketch(), ["a", "b"])).toEqual(["a", "b"]);
  });
  test("deleted edit target is not silently replaced", () => {
    expect(() =>
      effectiveInputImages(sketch({ editSourceImageId: "missing" }), ["a"])
    ).toThrow("no longer available");
  });
  test("selected local edit source is labeled as the base, not an unattached previous output", async () => {
    const parent = sketch({
      id: "parent",
      status: "done",
      resultImageIds: ["previous"]
    });
    const composed = await composeRequest({
      sketch: sketch({
        parentSketchId: parent.id,
        editSourceImageId: "local",
        referenceImageIds: ["subject", "local"]
      }),
      chainSketches: [parent],
      boardSettings: defaultBoardSettings(),
      capabilities: capabilities(),
      getImageBase64: async (id) => `data:image/png;base64,${id}`
    });
    expect(composed.snapshot.messages[0]?.imageRefs).toEqual([
      "local",
      "subject"
    ]);
    expect(composed.snapshot.messages[0]?.text).toContain(
      "first attached image is the BASE IMAGE"
    );
    expect(composed.snapshot.messages[0]?.text).not.toContain(
      "[PREVIOUS OUTPUTS]"
    );
  });
  test("copied options/references are independent and budget approval resets", () => {
    const source = sketch({
      imageOptions: { complexity: "high" },
      referenceImageIds: ["ref"],
      markup: { imageId: "guide", baseImageId: "ref" },
      budgetAcknowledged: true
    });
    const copy = copyGenerationSettings(source);
    copy.referenceImageIds.push("other");
    copy.imageOptions.complexity = "low";
    expect(source.referenceImageIds).toEqual(["ref"]);
    expect(source.imageOptions?.complexity).toBe("high");
    expect(copy.markup).toEqual(source.markup);
    expect(copy.budgetAcknowledged).toBe(false);
  });
  test("completed refinements clear old base/guidance; draft sibling forks preserve them", () => {
    const source = sketch({
      status: "done",
      editSourceImageId: "old-base",
      markup: { imageId: "guide", baseImageId: "old-base" },
      referenceImageIds: ["subject"]
    });
    const next = copyRefinementSettings(source);
    expect(next.editSourceImageId).toBeNull();
    expect(next.markup).toBeUndefined();
    expect(next.referenceImageIds).toEqual(["subject"]);
    expect(
      copyRefinementSettings({ ...source, status: "draft" }).markup?.imageId
    ).toBe("guide");
  });
  test("16 references compose; 17 fail before base64 loading", async () => {
    const input = {
      sketch: sketch({
        referenceImageIds: Array.from({ length: 16 }, (_, i) => String(i))
      }),
      chainSketches: [],
      boardSettings: defaultBoardSettings(),
      capabilities: capabilities(),
      getImageBase64: mock(async () => "data:image/png;base64,AAA=")
    };
    const composed = await composeRequest(input);
    expect(composed.inputImageCount).toBe(16);
    input.sketch.referenceImageIds!.push("17");
    input.getImageBase64.mockClear();
    await expect(composeRequest(input)).rejects.toThrow("17");
    expect(input.getImageBase64).not.toHaveBeenCalled();
  });
  test("provider options survive the redacted source view", async () => {
    const composed = await composeRequest({
      sketch: sketch({
        imageOptions: { complexity: "medium" },
        referenceImageIds: ["ref"]
      }),
      chainSketches: [],
      boardSettings: defaultBoardSettings(),
      capabilities: capabilities(),
      getImageBase64: async () => "data:image/png;base64,SECRET_BYTES"
    });
    const source = elidedRequestJson(composed.snapshot);
    expect(source).toContain('"complexity": "medium"');
    expect(source).not.toContain("SECRET_BYTES");
  });
  test("chat snapshots contain only the history sent after image-cap truncation", async () => {
    const root = sketch({
      id: "root",
      status: "done",
      prompt: "First prompt",
      resultImageIds: ["first-output"]
    });
    const parent = sketch({
      id: "parent",
      parentSketchId: root.id,
      order: 1,
      status: "done",
      prompt: "Second prompt",
      resultImageIds: ["second-output"]
    });
    const caps = capabilities();
    caps.generationApi = "chat";
    caps.conversational = true;
    caps.maxInputImages = 1;
    const composed = await composeRequest({
      sketch: sketch({
        parentSketchId: parent.id,
        order: 2,
        prompt: "Third prompt"
      }),
      chainSketches: [root, parent],
      boardSettings: defaultBoardSettings(),
      capabilities: caps,
      getImageBase64: async (id) => `data:image/png;base64,${id}`
    });
    if (!("messages" in composed.body))
      throw new Error("Expected chat request");
    expect(composed.body.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user"
    ]);
    expect(composed.snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user"
    ]);
    expect(
      composed.snapshot.messages.map((message) => message.imageRefs)
    ).toEqual([[], ["second-output"], []]);
    expect(JSON.stringify(composed.snapshot)).not.toContain("First prompt");
  });
  test("composed style context counts toward the prompt limit", async () => {
    await expect(
      composeRequest({
        sketch: sketch({ prompt: "x".repeat(32_000) }),
        chainSketches: [],
        boardSettings: defaultBoardSettings(),
        capabilities: capabilities(),
        getImageBase64: async () => ""
      })
    ).rejects.toThrow("32,000");
  });
});

describe("custom-size boundaries", () => {
  for (const size of ["1024x640", "3840x2160", "2160x3840", "auto"])
    test(`${size} valid`, () =>
      expect(() => validatePixelSize(size)).not.toThrow());
  for (const size of [
    "1024x624",
    "1025x1024",
    "3856x2160",
    "3840x3840",
    "2048x640",
    "0x1024",
    "bad"
  ])
    test(`${size} invalid`, () =>
      expect(() => validatePixelSize(size)).toThrow());
});

describe("completed images, not partials", () => {
  test("three fragmented previews plus completion produce exactly one output", async () => {
    respond(
      streamed(
        [0, 1, 2]
          .map((i) => ({
            type: "image_generation.partial_image",
            partial_image_index: i,
            b64_json: `preview${i}`
          }))
          .concat([
            {
              type: "image_generation.completed",
              partial_image_index: 0,
              b64_json: "final"
            }
          ])
      )
    );
    const previews = mock(() => {});
    const response = await imageGenerationStream(
      { model: capabilities().id, prompt: "p", stream: true },
      "test-key",
      undefined,
      { onImages: previews }
    );
    expect(response.choices[0]?.message.images).toHaveLength(1);
    expect(response.choices[0]?.message.images?.[0]?.image_url.url).toContain(
      "final"
    );
    expect(previews).toHaveBeenCalledTimes(3);
  });
  test("preview-only disconnect is failure", async () => {
    respond(
      streamed(
        [
          {
            type: "image_generation.partial_image",
            id: "stream-id",
            b64_json: "preview",
            usage: { cost: 0.19 }
          }
        ],
        ""
      )
    );
    const result = imageGenerationStream(
      { model: capabilities().id, prompt: "p", stream: true },
      "test-key",
      undefined
    );
    await expect(result).rejects.toThrow("without a completed");
    await expect(result).rejects.toMatchObject({
      name: "ImageResponseError",
      generationId: "stream-id",
      usage: { cost: 0.19 }
    });
  });
  test("zero previews and final usage work", async () => {
    respond(
      streamed([
        {
          type: "image_generation.completed",
          b64_json: "final",
          usage: { cost: 0.2 },
          size: "1536x1024"
        }
      ])
    );
    const response = await imageGenerationStream(
      { model: capabilities().id, prompt: "p", stream: true },
      "test-key",
      undefined
    );
    expect(response.usage?.cost).toBe(0.2);
    expect(response.imageMetadata?.size).toBe("1536x1024");
  });
  test("multi-line data records are parsed as one completed event", async () => {
    respond(
      new Response(
        'data: {"type":"image_generation.completed",\r\ndata: "b64_json":"final"}\r\n\r\n'
      )
    );
    const response = await imageGenerationStream(
      { model: capabilities().id, prompt: "p", stream: true },
      "test-key",
      undefined
    );
    expect(response.choices[0]?.message.images).toHaveLength(1);
  });
  test("midstream error and malformed data fail explicitly", async () => {
    respond(
      streamed([
        {
          type: "error",
          id: "stream-error-id",
          usage: { cost: 0.06 },
          error: { code: "server_error", message: "Upstream failed" }
        }
      ])
    );
    const result = imageGenerationStream(
      { model: capabilities().id, prompt: "p", stream: true },
      "test-key",
      undefined
    );
    await expect(result).rejects.toThrow("Upstream failed");
    await expect(result).rejects.toMatchObject({
      generationId: "stream-error-id",
      usage: { cost: 0.06 }
    });
    respond(new Response("data: {bad json}\n\n"));
    await expect(
      imageGenerationStream(
        { model: capabilities().id, prompt: "p", stream: true },
        "test-key",
        undefined
      )
    ).rejects.toThrow();
  });
  test("empty buffered data cannot masquerade as success", async () => {
    respond(
      Response.json(
        { data: [], usage: { cost: 0.19 } },
        { headers: { "X-Generation-Id": "buffered-id" } }
      )
    );
    const result = imageGeneration(
      { model: capabilities().id, prompt: "p", stream: false },
      "test-key"
    );
    await expect(result).rejects.toThrow("no valid completed");
    await expect(result).rejects.toMatchObject({
      name: "ImageResponseError",
      generationId: "buffered-id",
      usage: { cost: 0.19 }
    });
  });
  test("in-band image errors retain reported billing details", async () => {
    respond(
      Response.json(
        {
          error: { code: 500, message: "Provider failed" },
          usage: { cost: 0.09 }
        },
        { headers: { "X-Generation-Id": "image-error-id" } }
      )
    );
    const result = imageGeneration(
      { model: capabilities().id, prompt: "p", stream: false },
      "test-key"
    );
    await expect(result).rejects.toThrow("Provider failed");
    await expect(result).rejects.toMatchObject({
      generationId: "image-error-id",
      usage: { cost: 0.09 }
    });
  });
  test("invalid buffered bodies retain the generation ID for cost lookup", async () => {
    respond(
      new Response("not JSON", { headers: { "X-Generation-Id": "invalid-id" } })
    );
    await expect(
      imageGeneration(
        { model: capabilities().id, prompt: "p", stream: false },
        "test-key"
      )
    ).rejects.toMatchObject({
      name: "ImageResponseError",
      generationId: "invalid-id"
    });
  });
  test("malformed stream records preserve earlier usage and generation ID", async () => {
    respond(
      streamed(
        [{ id: "broken-stream-id", usage: { total_cost: 0.17 } }],
        "data: {bad json}\n\n"
      )
    );
    await expect(
      imageGenerationStream(
        { model: capabilities().id, prompt: "p", stream: true },
        "test-key",
        undefined
      )
    ).rejects.toMatchObject({
      name: "ImageResponseError",
      generationId: "broken-stream-id",
      usage: { total_cost: 0.17 }
    });
  });
  test("aborted response parsing remains cancellation, not a billed error", async () => {
    const bufferedController = new AbortController();
    const buffered = Response.json({});
    spyOn(buffered, "json").mockImplementation(async () => {
      bufferedController.abort();
      throw new SyntaxError("Interrupted JSON");
    });
    respond(buffered);
    await expect(
      imageGeneration(
        { model: capabilities().id, prompt: "p", stream: false },
        "test-key",
        bufferedController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    const streamController = new AbortController();
    respond(
      new Response(
        new ReadableStream({
          start(controller) {
            streamController.abort();
            controller.error(new TypeError("Interrupted stream"));
          }
        })
      )
    );
    await expect(
      imageGenerationStream(
        { model: capabilities().id, prompt: "p", stream: true },
        "test-key",
        streamController.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  test("buffered multi-output retains media types and usage", async () => {
    respond(
      Response.json({
        data: [
          { b64_json: "a", media_type: "image/gif" },
          { b64_json: "b", media_type: "image/webp" }
        ],
        usage: { cost: 1 }
      })
    );
    const response = await imageGeneration(
      { model: capabilities().id, prompt: "p", stream: false },
      "test-key"
    );
    expect(response.choices[0]?.message.images).toHaveLength(2);
    expect(response.choices[0]?.message.images?.[0]?.image_url.url).toContain(
      "image/gif"
    );
  });
});

test("token billing remains unknown; per-image prices include outputs", () => {
  const caps = capabilities();
  expect(estimateCost(caps, 0, 10)).toBeNull();
  caps.advanced.endpoint = {
    ...endpoint,
    pricing: [{ billable: "output_image", unit: "image", cost_usd: 0.1 }]
  };
  expect(estimateCost(caps, 0, 10)).toBe(1);
});
test("known retry costs accumulate while unknown costs remain distinct", () => {
  expect(addKnownCost(null, 0.19)).toBe(0.19);
  expect(addKnownCost(0.19, 0.08)).toBeCloseTo(0.27);
  expect(addKnownCost(0.19, null)).toBe(0.19);
  expect(addKnownCost(null, null)).toBeNull();
  expect(addKnownCost(null, 0)).toBe(0);
});
test("tiny positive charges never display as zero", () => {
  expect(formatUsd(0)).toBe("$0.00");
  expect(formatUsd(0.000001)).toBe("<$0.00001");
  expect(formatUsd(0.00001)).toBe("$0.00001");
  expect(formatUsd(0.19)).toBe("$0.19");
});
test("file identity is derived from bytes and truncated GIFs fail", () => {
  expect(identifyImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
    "image/png"
  );
  expect(
    identifyImage(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    )
  ).toBe("image/svg+xml");
  expect(
    identifyImage(
      new TextEncoder().encode(
        '<?xml version="1.0"?>\n<!-- vector -->\n<svg xmlns="http://www.w3.org/2000/svg"/>'
      )
    )
  ).toBe("image/svg+xml");
  expect(identifyImage(new Uint8Array([255, 216, 255]))).toBe("image/jpeg");
  expect(identifyImage(new TextEncoder().encode("RIFFxxxxWEBP"))).toBe(
    "image/webp"
  );
  expect(() =>
    identifyImage(new TextEncoder().encode("not an image"))
  ).toThrow();
  expect(() => gifMetadata(new TextEncoder().encode("GIF89a"))).toThrow();
});
test("GIF metadata measures encoded frame blocks and delays", () => {
  const bytes = new Uint8Array([
    71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33,
    249, 4, 0, 20, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 33,
    249, 4, 0, 20, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 76, 1, 0, 59
  ]);
  expect(gifMetadata(bytes)).toEqual({
    width: 1,
    height: 1,
    frameCount: 2,
    durationMs: 400
  });
  expect(() => gifMetadata(bytes.slice(0, -1))).toThrow("completion marker");
  const truncated = bytes.slice(0, 39);
  expect(() => gifMetadata(truncated)).toThrow("truncated");
});
