import { chatCompletion } from "./client";
import type { CompletionRequest, CompletionResponse } from "./types";

export const RANDOM_TEXT_MODEL = "~deepseek/deepseek-flash-latest";

export function requestRandomText(
  messages: CompletionRequest["messages"],
  apiKey: string,
  signal?: AbortSignal,
  model = RANDOM_TEXT_MODEL
): Promise<CompletionResponse> {
  return chatCompletion(
    {
      model,
      messages,
      modalities: ["text"],
      // The model reasons by default, and reasoning tokens count against max_tokens.
      reasoning: { effort: "none" },
      max_tokens: 512,
      temperature: 1,
      stream: false,
      usage: { include: true }
    },
    apiKey,
    signal
  );
}

export function completedRandomText(
  response: CompletionResponse,
  label: "style guide" | "image prompt"
): string {
  const choice = response.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error(`The ${label} was cut short. Try Random again.`);
  }
  const text = choice?.message?.content;
  if (
    choice?.finish_reason !== "stop" ||
    typeof text !== "string" ||
    !text.trim()
  ) {
    throw new Error(`OpenRouter did not return a completed text ${label}.`);
  }
  if (text.trim().length > 32_000) {
    throw new Error(`The generated ${label} exceeds the prompt length limit.`);
  }
  return text.trim();
}
