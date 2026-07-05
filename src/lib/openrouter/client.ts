import type {
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  CompletionImageItem,
  CompletionUsage,
  ModelListResponse,
  ImageModelDiscoveryResponse,
  OpenRouterErrorBody,
  OpenRouterErrorDetail,
  OpenRouterErrorMetadata
} from "./types";

const BASE = "https://openrouter.ai/api/v1";
const SITE_URL = "https://lumikeiju.dev/tarralappu/";
const SITE_NAME = "Tarralappu";

/**
 * Structured API error, per
 * https://openrouter.ai/docs/api/reference/errors-and-debugging
 *
 * Carries both a best-effort parsed `error_type`/`message` (for a pretty,
 * human-readable message) and the raw response body (for a "view raw
 * response" debug affordance).
 */
export class OpenRouterApiError extends Error {
  readonly status: number;
  readonly errorType: string | null;
  readonly providerCode: string | null;
  readonly metadata: OpenRouterErrorMetadata | null;
  readonly retryAfterSeconds: number | null;
  /** Raw response body, pretty-printed JSON when possible. */
  readonly rawBody: string;

  constructor(opts: {
    status: number;
    message: string;
    metadata?: OpenRouterErrorMetadata | null;
    retryAfterSeconds?: number | null;
    rawBody: string;
  }) {
    super(opts.message);
    this.name = "OpenRouterApiError";
    this.status = opts.status;
    this.metadata = opts.metadata ?? null;
    this.errorType = (this.metadata?.error_type as string | undefined) ?? null;
    this.providerCode =
      (this.metadata?.provider_code as string | undefined) ?? null;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
    this.rawBody = opts.rawBody;
  }
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Best-effort parse of an OpenRouter `{ error: { code, message, metadata } }` body. */
function parseErrorDetail(text: string): OpenRouterErrorDetail | null {
  try {
    const json = JSON.parse(text) as OpenRouterErrorBody;
    if (json && typeof json === "object" && json.error) return json.error;
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

async function apiErrorFromResponse(
  res: Response
): Promise<OpenRouterApiError> {
  const text = await res.text().catch(() => "");
  const detail = parseErrorDetail(text);
  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
  return new OpenRouterApiError({
    status: res.status,
    message: detail?.message ?? res.statusText ?? `HTTP ${res.status}`,
    metadata: detail?.metadata ?? null,
    retryAfterSeconds:
      retryAfterSeconds !== null &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
        ? retryAfterSeconds
        : null,
    rawBody: text ? prettyJson(text) : `HTTP ${res.status} ${res.statusText}`
  });
}

/**
 * Build an OpenRouterApiError from an in-band provider error — a request
 * that returned HTTP 200 but failed during generation, with the error
 * embedded in `choices[0].error` (see "When No Content is Generated" /
 * "Provider Errors" in the docs above).
 */
function apiErrorFromChoiceError(
  detail: OpenRouterErrorDetail,
  fullResponse: unknown
): OpenRouterApiError {
  return new OpenRouterApiError({
    status: typeof detail.code === "number" ? detail.code : 0,
    message: detail.message,
    metadata: detail.metadata ?? null,
    rawBody: JSON.stringify(fullResponse, null, 2)
  });
}

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

/**
 * Real per-model capability descriptors from OpenRouter's dedicated Image API
 * (public, no key required). Used to replace guessed aspect ratios/sizes/
 * input-image caps with authoritative data. See
 * https://openrouter.ai/blog/announcements/image-api/
 */
export async function listImageModelCapabilities(
  signal?: AbortSignal
): Promise<ImageModelDiscoveryResponse> {
  const res = await fetch(`${BASE}/images/models`, {
    signal,
    headers: {
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME
    }
  });
  if (!res.ok)
    throw new Error(`Failed to fetch image model capabilities: ${res.status}`);
  return res.json() as Promise<ImageModelDiscoveryResponse>;
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
    throw await apiErrorFromResponse(res);
  }

  const json = (await res.json()) as CompletionResponse;

  // Request-level errors return a non-2xx status (handled above). Errors
  // that occur while the model is producing output still return HTTP 200,
  // with the error embedded in the response body instead. See
  // https://openrouter.ai/docs/api/reference/errors-and-debugging
  const choiceError = json.choices?.[0]?.error;
  if (choiceError) {
    throw apiErrorFromChoiceError(choiceError, json);
  }

  return json;
}

/** Callbacks for observing a streamed generation as chunks arrive. */
export interface StreamCallbacks {
  /** Called whenever the accumulated image list grows, for a live preview. */
  onImages?: (images: CompletionImageItem[]) => void;
}

/**
 * Streaming (`stream: true`) variant of chatCompletion(), for models with
 * `ModelCapabilities.supportsStreaming`. Returns the same CompletionResponse
 * shape as the non-streaming call once the stream ends, so callers don't
 * need a separate code path for storing images/parsing cost.
 *
 * OpenRouter documents the general SSE chunk format for text
 * (`choices[0].delta.content`, see
 * https://openrouter.ai/docs/api/reference/streaming) but not the shape of
 * image deltas specifically. This best-effort-parses `delta.images[]` (the
 * natural analog of the non-streaming `message.images[]` field) for live
 * partial previews via `onImages` — if a provider never sends that field,
 * streaming still works, it just behaves like a slower non-streaming call
 * with no partial preview.
 */
export async function chatCompletionStream(
  body: CompletionRequest,
  apiKey: string,
  signal: AbortSignal | undefined,
  callbacks: StreamCallbacks = {}
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
    throw await apiErrorFromResponse(res);
  }
  if (!res.body) {
    throw new Error("Streaming response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let id = "";
  let content = "";
  const images: CompletionImageItem[] = [];
  let finishReason: string | null = null;
  let usage: CompletionUsage | undefined;
  let midStreamError: OpenRouterErrorDetail | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let lineEnd: number;
      while ((lineEnd = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        // Blank lines separate SSE events; lines starting with ":" are
        // keepalive comments (e.g. "OPENROUTER PROCESSING") — both ignored.
        if (!line || line.startsWith(":") || !line.startsWith("data: ")) {
          continue;
        }
        const data = line.slice("data: ".length);
        if (data === "[DONE]") continue;

        let chunk: CompletionChunk;
        try {
          chunk = JSON.parse(data) as CompletionChunk;
        } catch {
          continue; // malformed/partial chunk — skip rather than crash
        }

        if (chunk.id) id = chunk.id;
        if (chunk.usage) usage = chunk.usage;
        if (chunk.error) midStreamError = chunk.error;

        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) content += choice.delta.content;
        if (choice?.delta?.images?.length) {
          choice.delta.images.forEach((img, i) => (images[i] = img));
          callbacks.onImages?.([...images]);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const response: CompletionResponse = {
    id,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: content || null, images },
        finish_reason: finishReason
      }
    ],
    usage
  };

  if (midStreamError) {
    throw apiErrorFromChoiceError(midStreamError, response);
  }

  return response;
}

/**
 * Fallback cost fetch using the generation ID from a completed response,
 * for models that don't return `usage.cost`/`usage.total_cost` inline.
 */
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

/**
 * Friendly, human-readable message for a typed `error_type`. See
 * "Typed Error Codes" in
 * https://openrouter.ai/docs/api/reference/errors-and-debugging
 */
const ERROR_TYPE_MESSAGES: Record<string, string> = {
  // Token and length limits
  context_length_exceeded:
    "The prompt plus conversation history is too long for this model's context window. Try a shorter prompt, fewer reference images, or fewer chained refinements.",
  max_tokens_exceeded:
    "Generation stopped early — the output token limit was reached.",
  token_limit_exceeded: "A token budget cap was exceeded.",
  string_too_long:
    "One of the text fields in the request is too long for this provider.",
  // Auth
  authentication: "Invalid, missing, or revoked API key.",
  permission_denied:
    "Request blocked — insufficient permission or a content guardrail.",
  payment_required: "Insufficient OpenRouter credits — add credits and retry.",
  // Rate limiting / availability
  rate_limit_exceeded: "Rate limited — please wait and retry.",
  provider_overloaded:
    "The upstream provider is temporarily overloaded. Retry shortly.",
  provider_unavailable:
    "The upstream provider returned an invalid or empty response.",
  // Request validation
  invalid_request: "The request was malformed or missing a required parameter.",
  invalid_prompt:
    "One of the messages in the request was invalid for this model.",
  not_found: "The requested model or resource doesn't exist.",
  precondition_failed: "A precondition for the request wasn't met.",
  payload_too_large: "The request body is too large.",
  unprocessable: "The request was well-formed but couldn't be processed.",
  // Content policy
  content_policy_violation:
    "The input or output was flagged by a content filter.",
  refusal: "The model refused this request (safety refusal).",
  // Image errors
  invalid_image: "One of the reference images is corrupt or unreadable.",
  image_too_large:
    "One of the reference images exceeds the provider's size limit.",
  image_too_small:
    "One of the reference images is below the provider's minimum size.",
  unsupported_image_format:
    "One of the reference images uses an unsupported format.",
  image_not_found: "A referenced image could not be resolved.",
  image_download_failed:
    "OpenRouter couldn't download one of the reference images.",
  // Generic
  server: "An unexpected internal error occurred upstream.",
  timeout: "The provider didn't respond in time.",
  unmapped: "An unrecognized upstream error occurred."
};

function statusFallbackMessage(status: number, message: string): string {
  switch (status) {
    case 400:
      return `Bad request: ${message}`;
    case 401:
      return "Invalid or missing API key.";
    case 402:
      return "Insufficient OpenRouter credits.";
    case 403:
      return "Forbidden — request blocked (permissions or a content guardrail).";
    case 408:
      return "The request timed out.";
    case 429:
      return "Rate limited — please wait and retry.";
    case 502:
      return "The chosen model is down or returned an invalid response.";
    case 503:
      return "No available provider meets this model's routing requirements right now.";
    default:
      return message || `Request failed (HTTP ${status}).`;
  }
}

/** Map an error to a pretty, human-readable message. */
export function humanizeError(err: unknown): string {
  if (err instanceof OpenRouterApiError) {
    const known = err.errorType
      ? ERROR_TYPE_MESSAGES[err.errorType]
      : undefined;
    const message = known ?? statusFallbackMessage(err.status, err.message);
    return err.retryAfterSeconds
      ? `${message} Retry after ~${err.retryAfterSeconds}s.`
      : message;
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Cancelled.";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Raw response body (pretty-printed JSON when possible), for a "view raw" debug affordance. Null when the error has no raw API response to show. */
export function rawErrorDetails(err: unknown): string | null {
  if (err instanceof OpenRouterApiError) return err.rawBody;
  return null;
}
