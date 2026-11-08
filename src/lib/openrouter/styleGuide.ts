import {
  RANDOM_TEXT_MODEL,
  requestRandomText,
  completedRandomText
} from "./randomText";
import type { CompletionResponse } from "./types";

export const STYLE_GUIDE_MODEL = RANDOM_TEXT_MODEL;

export async function requestRandomStyleGuide(
  apiKey: string,
  signal?: AbortSignal
): Promise<CompletionResponse> {
  return requestRandomText(
    [
      {
        role: "system",
        content:
          "Write reusable visual style guides for image generation. Return only the guide as plain text, without a heading, quotation marks, or commentary."
      },
      {
        role: "user",
        content:
          "Invent one random, distinctive, coherent art direction in 80-120 words. Randomly choose a harmonious combination of medium, materials, palette, lighting, texture, mood, and composition. Give concrete visual instructions usable across many subjects. Do not prescribe a particular subject, scene, brand, or living artist."
      }
    ],
    apiKey,
    signal,
    STYLE_GUIDE_MODEL
  );
}

export function completedStyleGuide(response: CompletionResponse): string {
  return completedRandomText(response, "style guide");
}
