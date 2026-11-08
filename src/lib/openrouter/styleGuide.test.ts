/// <reference types="bun" />
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { completedStyleGuide, requestRandomStyleGuide } from "./styleGuide";
import { parseCostFromResponse } from "./cost";
import type { CompletionResponse } from "./types";

function response(
  content: string | null,
  finish_reason = "stop"
): CompletionResponse {
  return {
    id: "style-test",
    choices: [
      { index: 0, message: { role: "assistant", content }, finish_reason }
    ],
    usage: { cost: 0.004 }
  };
}

afterEach(() => mock.restore());

test("Random uses a bounded, text-only request with usage and cancellation", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(response("A rich ink-and-paper style."))
  );
  const signal = new AbortController().signal;
  await requestRandomStyleGuide("local-test-only", signal);
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(init?.signal).toBe(signal);
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: "~deepseek/deepseek-flash-latest",
    modalities: ["text"],
    reasoning: { effort: "none" },
    max_tokens: 512,
    temperature: 1,
    stream: false,
    usage: { include: true }
  });
  expect(body.image_config).toBeUndefined();
  expect(body.messages).toHaveLength(2);
});

test("completed style text is trimmed", () => {
  expect(completedStyleGuide(response("  A rich ink-and-paper style.\n"))).toBe(
    "A rich ink-and-paper style."
  );
});

test("empty, filtered, truncated and missing style text fail explicitly", () => {
  for (const invalid of [
    response(null),
    response("  "),
    response("Incomplete", "length"),
    response("Filtered", "content_filter"),
    { id: "empty", choices: [] }
  ]) {
    expect(() => completedStyleGuide(invalid)).toThrow();
  }
  expect(() => completedStyleGuide(response("x".repeat(32_001)))).toThrow(
    "prompt length"
  );
});

test("style request errors retain the provider message", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { error: { code: 429, message: "Too many requests" } },
      { status: 429 }
    )
  );
  const result = requestRandomStyleGuide("local-test-only");
  await expect(result).rejects.toThrow("Too many requests");
  await expect(result).rejects.toMatchObject({ inBand: false });
});

test("in-band errors cannot become a style guide", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      ...response(null),
      choices: [{ error: { code: 500, message: "Provider failed" } }]
    })
  );
  const result = requestRandomStyleGuide("local-test-only");
  await expect(result).rejects.toThrow("Provider failed");
  await expect(result).rejects.toMatchObject({
    inBand: true,
    generationId: "style-test",
    usage: { cost: 0.004 }
  });
});

test("in-band errors remain distinguishable without a generation ID or usage", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      choices: [{ error: { code: 500, message: "Provider failed" } }]
    })
  );
  await expect(
    requestRandomStyleGuide("local-test-only")
  ).rejects.toMatchObject({
    inBand: true,
    generationId: ""
  });
});

test("non-finite usage cannot corrupt session cost totals", () => {
  expect(parseCostFromResponse(response("Valid"))).toBe(0.004);
  expect(
    parseCostFromResponse({ ...response("Valid"), usage: { cost: Infinity } })
  ).toBeNull();
  expect(
    parseCostFromResponse({ ...response("Valid"), usage: { cost: NaN } })
  ).toBeNull();
});
