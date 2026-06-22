import type {
  CompletionRequest,
  CompletionResponse,
  ModelListResponse
} from "./types";

const BASE = "https://openrouter.ai/api/v1";
const SITE_URL = "https://lumikeiju.dev/tarralappu/";
const SITE_NAME = "Tarralappu";

export async function listImageModels(
  signal?: AbortSignal
): Promise<ModelListResponse> {
  const res = await fetch(`${BASE}/models?output_modalities=image`, {
    signal,
    headers: {
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  return res.json() as Promise<ModelListResponse>;
}

export async function chatCompletion(
  body: CompletionRequest,
  apiKey: string,
  signal?: AbortSignal
): Promise<CompletionResponse> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = Object.assign(new Error(`OpenRouter ${res.status}: ${text}`), {
      status: res.status
    });
    throw err;
  }

  return res.json() as Promise<CompletionResponse>;
}

/** Fallback cost fetch using the generation ID from the response. OPEN-2 */
export async function fetchGenerationCost(
  generationId: string,
  apiKey: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `${BASE}/generation?id=${encodeURIComponent(generationId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` }
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { total_cost?: number } };
    return data.data?.total_cost ?? null;
  } catch {
    return null;
  }
}

/** Map HTTP status to a user-friendly error message. */
export function humanizeError(err: unknown): string {
  if (err instanceof Error && "status" in err) {
    switch ((err as { status: number }).status) {
      case 401:
        return "Invalid or missing API key.";
      case 402:
        return "Insufficient OpenRouter credits.";
      case 429:
        return "Rate limited — please wait and retry.";
      case 400:
        return `Bad request: ${err.message}`;
    }
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Cancelled.";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
