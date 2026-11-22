/// <reference types="bun" />
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  chatCompletion,
  chatCompletionStream,
  fetchGenerationCost,
  humanizeError,
  imageGeneration,
  imageGenerationStream,
  OpenRouterApiError
} from "./client";
import type { CompletionImageItem, CompletionRequest } from "./types";

const request: CompletionRequest = {
  model: "test/model",
  messages: [],
  modalities: ["image", "text"],
  stream: true,
  usage: { include: true }
};
const key = "test-key";
const embedded = "data:image/png;base64,iVBORw0KGgo=";

afterEach(() => mock.restore());

test("legacy image streams parse multi-line events and preview only embedded images", async () => {
  const preview = mock<(images: CompletionImageItem[]) => void>(() => {});
  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      ': keepalive\r\ndata:{"id":"chat-id",\r\ndata: "choices":[{"delta":{"images":[{"image_url":{"url":"https://example.invalid/preview.png"}}]}}]}\r\n\r\n' +
        `data: {"choices":[{"delta":{"images":[{"type":"image_url","image_url":{"url":"${embedded}"}}]},"finish_reason":"stop"}]}\n\n` +
        'data:{"usage":{"cost":0.12}}\n\ndata: [DONE]'
    )
  );
  const response = await chatCompletionStream(request, key, undefined, {
    onImages: preview
  });
  expect(response).toMatchObject({ id: "chat-id", usage: { cost: 0.12 } });
  expect(response.choices[0]?.message.images?.[0]?.image_url.url).toBe(
    embedded
  );
  expect(preview).toHaveBeenCalledTimes(2);
  expect(preview).toHaveBeenNthCalledWith(1, []);
  expect(preview).toHaveBeenNthCalledWith(2, [
    { type: "image_url", image_url: { url: embedded } }
  ]);
});

test("legacy stream EOF after previews is an error even when a cost was reported", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      `data:{"usage":{"cost":0.12},"choices":[{"delta":{"images":[{"image_url":{"url":"${embedded}"}}]}}]}\n\n`,
      { headers: { "X-Generation-Id": "chat-header-id" } }
    )
  );
  await expect(
    chatCompletionStream(request, key, undefined)
  ).rejects.toMatchObject({
    name: "ImageResponseError",
    generationId: "chat-header-id",
    usage: { cost: 0.12 }
  });
});

test("a malformed stream record cancels the reader and keeps earlier billing data", async () => {
  const cancel = mock(() => {});
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'data:{"id":"chat-id","usage":{"cost":0.01}}\n\ndata:bad-json\n\n'
        )
      );
    },
    cancel
  });
  spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
  await expect(
    chatCompletionStream(request, key, undefined)
  ).rejects.toMatchObject({ generationId: "chat-id", usage: { cost: 0.01 } });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(body.locked).toBe(false);
});

test("a buffered top-level provider error preserves billing details", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      {
        error: { message: "Provider failed", code: 502 },
        usage: { cost: 0.04 }
      },
      { headers: { "X-Generation-Id": "chat-header-id" } }
    )
  );
  await expect(chatCompletion(request, key)).rejects.toMatchObject({
    name: "OpenRouterApiError",
    inBand: true,
    generationId: "chat-header-id",
    usage: { cost: 0.04 }
  });
});

test("authenticated OpenRouter requests never opt into redirect forwarding", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 502 })
  );
  await Promise.allSettled([
    chatCompletion(request, key),
    chatCompletionStream(request, key, undefined),
    imageGeneration(
      { model: request.model, prompt: "test", stream: false },
      key
    ),
    imageGenerationStream(
      { model: request.model, prompt: "test", stream: true },
      key,
      undefined
    ),
    fetchGenerationCost("test-id", key)
  ]);
  expect(fetch).toHaveBeenCalledTimes(5);
  for (const [url, options] of fetch.mock.calls) {
    expect(String(url)).toStartWith("https://openrouter.ai/api/v1/");
    expect(options?.redirect).toBe("error");
  }
});

test("unknown error types cannot resolve to inherited properties", () => {
  const error = new OpenRouterApiError({
    status: 400,
    message: "Provider failed",
    metadata: { error_type: "constructor" },
    rawBody: ""
  });
  expect(humanizeError(error)).toBe("Bad request: Provider failed");
});
