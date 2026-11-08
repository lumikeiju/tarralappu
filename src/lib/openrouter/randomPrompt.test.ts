/// <reference types="bun" />
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { requestRandomPrompt, completedRandomPrompt } from "./randomPrompt";
import { requestRandomStyleGuide } from "./styleGuide";
import type { CompletionResponse } from "./types";

function response(
  content: string | null,
  finish_reason = "stop"
): CompletionResponse {
  return {
    id: "prompt-test",
    choices: [
      { index: 0, message: { role: "assistant", content }, finish_reason }
    ],
    usage: { cost: 0.004 }
  };
}

afterEach(() => mock.restore());

function mockPromptFetch() {
  const implementation = Object.assign(
    async () => Response.json(response("A distinct image prompt.")),
    { preconnect: globalThis.fetch.preconnect }
  );
  return spyOn(globalThis, "fetch").mockImplementation(implementation);
}

test("prompt Random uses bounded text-only DeepSeek generation and cancellation", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(response("A tiny observatory on a floating island."))
  );
  const signal = new AbortController().signal;
  await requestRandomPrompt("local-test-only", signal);
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
  expect(body.messages[1].content).toContain("subject");
  expect(body.messages[0].content).toContain("Style clashes are welcome");
  expect(body.messages[1].content).toContain("requirements, not examples");
});

test("shared request settings preserve the existing Style Guide workflow", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(response("A quiet ink-and-paper style."))
  );
  await requestRandomStyleGuide("local-test-only");
  const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
  expect(body.model).toBe("~deepseek/deepseek-flash-latest");
  expect(body.max_tokens).toBe(512);
  expect(body.messages[1].content).toContain("art direction");
  expect(body.messages[1].content).toContain(
    "Do not prescribe a particular subject"
  );
});

test("refinement Random requests edits without sending the existing image or prompt", async () => {
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(response("Shift the lighting to a gentle blue-hour glow."))
  );
  const signal = new AbortController().signal;
  await requestRandomPrompt("local-test-only", signal, "refinement");
  const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
  expect(body.model).toBe("~deepseek/deepseek-flash-latest");
  expect(fetch.mock.calls[0]![1]?.signal).toBe(signal);
  expect(body.messages).toHaveLength(2);
  expect(body.messages[1].content).toContain("image-editing instructions");
  expect(body.messages[1].content).toContain("preserving the main subject");
  expect(body.messages[1].content).toContain("Radically transform");
  expect(body.messages[1].content).not.toContain("\nSubject:");
  expect(body.messages[1].content).not.toContain("\nSetting:");
  expect(
    body.messages.every(
      (message: { content: unknown }) => typeof message.content === "string"
    )
  ).toBe(true);
  expect(body.image_config).toBeUndefined();
});

function recipeFromRequest(body: string): Map<string, string> {
  const content: string = JSON.parse(body).messages[1].content;
  return new Map(
    content
      .split("\n")
      .filter((line) =>
        /^(Subject|Setting|Rendering collision|Palette|Composition|Lighting|Disruption): /.test(
          line
        )
      )
      .map((line) => {
        const separator = line.indexOf(": ");
        return [line.slice(0, separator), line.slice(separator + 2)];
      })
  );
}

test("consecutive prompts change every axis and use disjoint rendering media even with repeated entropy", async () => {
  const fetch = mockPromptFetch();
  spyOn(crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView>(array: T): T => {
      if (!(array instanceof Uint32Array))
        throw new Error("Unexpected RNG array");
      array.fill(0);
      return array;
    }
  );
  for (let index = 0; index < 10; index++) {
    await requestRandomPrompt("local-test-only");
  }
  const recipes = fetch.mock.calls.map((call) =>
    recipeFromRequest(String(call[1]?.body))
  );
  for (let index = 1; index < recipes.length; index++) {
    const previous = recipes[index - 1]!;
    const current = recipes[index]!;
    expect(current.size).toBe(7);
    for (const [axis, value] of current) {
      expect(value).not.toBe(previous.get(axis));
    }
    const media = current.get("Rendering collision")!.split(" + ");
    expect(media).toHaveLength(2);
    expect(media[0]).not.toBe(media[1]);
    for (const medium of media) {
      expect(previous.get("Rendering collision")!.split(" + ")).not.toContain(
        medium
      );
    }
  }
});

test("100 seeded requests span subjects and visual treatments instead of repeating one recipe", async () => {
  const fetch = mockPromptFetch();
  let seed = 123456789;
  spyOn(crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView>(array: T): T => {
      if (!(array instanceof Uint32Array))
        throw new Error("Unexpected RNG array");
      for (let index = 0; index < array.length; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        array[index] = seed;
      }
      return array;
    }
  );
  for (let index = 0; index < 100; index++) {
    await requestRandomPrompt("local-test-only");
  }
  const recipes = fetch.mock.calls.map((call) =>
    recipeFromRequest(String(call[1]?.body))
  );
  const distinct = (axis: string) =>
    new Set(recipes.map((recipe) => recipe.get(axis))).size;
  expect(
    new Set(recipes.map((recipe) => JSON.stringify([...recipe]))).size
  ).toBe(100);
  expect(distinct("Subject")).toBeGreaterThanOrEqual(20);
  expect(distinct("Setting")).toBeGreaterThanOrEqual(16);
  expect(distinct("Rendering collision")).toBeGreaterThanOrEqual(60);
  expect(distinct("Palette")).toBeGreaterThanOrEqual(10);
  expect(distinct("Composition")).toBeGreaterThanOrEqual(10);
  expect(distinct("Lighting")).toBeGreaterThanOrEqual(10);
});

test("random sampling rejects the biased upper bucket instead of clamping it", async () => {
  mockPromptFetch();
  await requestRandomPrompt("local-test-only");
  let first = true;
  const rng = spyOn(crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView>(array: T): T => {
      if (!(array instanceof Uint32Array))
        throw new Error("Unexpected RNG array");
      array.fill(first ? 0xffffffff : 0);
      first = false;
      return array;
    }
  );
  await requestRandomPrompt("local-test-only");
  expect(rng).toHaveBeenCalledTimes(9);
});

test("root and refinement requests share anti-repeat visual ingredients", async () => {
  const fetch = mockPromptFetch();
  await requestRandomPrompt("local-test-only");
  await requestRandomPrompt("local-test-only", undefined, "refinement");
  const [root, refinement] = fetch.mock.calls.map((call) =>
    recipeFromRequest(String(call[1]?.body))
  );
  expect(refinement!.size).toBe(5);
  for (const [axis, value] of refinement!) {
    expect(value).not.toBe(root!.get(axis));
  }
  for (const medium of refinement!.get("Rendering collision")!.split(" + ")) {
    expect(root!.get("Rendering collision")!.split(" + ")).not.toContain(
      medium
    );
  }
});

test("entropy failures are surfaced without sending a generic fallback request", async () => {
  const fetch = spyOn(globalThis, "fetch");
  spyOn(crypto, "getRandomValues").mockImplementation(() => {
    throw new Error("Mock entropy failure");
  });
  expect(() => requestRandomPrompt("local-test-only")).toThrow(
    "Mock entropy failure"
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("completed random prompts are trimmed", () => {
  expect(
    completedRandomPrompt(response("  A tiny floating observatory.\n"))
  ).toBe("A tiny floating observatory.");
});

test("incomplete, empty and oversized prompts fail instead of replacing notes", () => {
  for (const invalid of [
    response(null),
    response(" "),
    response("Unfinished", "length"),
    response("Filtered", "content_filter"),
    response("Tool output", "tool_calls"),
    { id: "missing", choices: [] }
  ]) {
    expect(() => completedRandomPrompt(invalid)).toThrow();
  }
  expect(() => completedRandomPrompt(response("x".repeat(32_001)))).toThrow(
    "prompt length"
  );
});

test("provider request errors remain explicit", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { error: { code: 429, message: "Too many requests" } },
      { status: 429 }
    )
  );
  await expect(requestRandomPrompt("local-test-only")).rejects.toThrow(
    "Too many requests"
  );
});

test("in-band errors cannot be saved as prompt text", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      ...response(null),
      choices: [{ error: { code: 500, message: "Provider failed" } }]
    })
  );
  await expect(requestRandomPrompt("local-test-only")).rejects.toThrow(
    "Provider failed"
  );
});
