// OpenRouter API types

export interface ModelPricing {
  prompt: string;
  completion: string;
  image: string;
  request: string;
  input_cache_read?: string;
  input_cache_write?: string;
}

export interface RawModel {
  id: string;
  name: string;
  description?: string;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
    tokenizer?: string;
  };
  pricing: ModelPricing;
  context_length?: number;
}

export interface ModelListResponse {
  data: RawModel[];
}

// Image API model discovery — GET /api/v1/images/models
// https://openrouter.ai/blog/announcements/image-api/
export type ParameterDescriptor =
  | { type: "enum"; values: string[] }
  | { type: "range"; min: number; max: number }
  | { type: "boolean" };

export type ImageModelSupportedParameters = Record<string, ParameterDescriptor>;

export interface ImageModelDiscoveryEntry {
  id: string;
  name: string;
  description?: string;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
  supported_parameters: ImageModelSupportedParameters;
  supports_streaming: boolean;
  endpoints: string;
}

export interface ImageModelDiscoveryResponse {
  data: ImageModelDiscoveryEntry[];
}

// Resolved capabilities (merged from API + overrides)
export interface ModelCapabilities {
  id: string;
  name: string;
  outputModalities: ("image" | "text")[];
  conversational: boolean;
  maxInputImages: number;
  aspectRatios: string[];
  imageSizes: string[];
  supportsImageConfig: boolean;
  /** true when capabilities were inferred from defaults, not from a curated override */
  estimated: boolean;
  pricing: ModelPricing;
}

// Chat completions
export type MessageRole = "user" | "assistant" | "system";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  modalities: ("image" | "text")[];
  image_config?: { aspect_ratio?: string; image_size?: string };
  provider?: {
    reasoning_effort?: "low" | "medium" | "high";
  };
  stream: false;
  usage: { include: true };
}

export interface CompletionImageItem {
  type: "image_url";
  image_url: { url: string };
}

export interface CompletionMessage {
  role: MessageRole;
  content: string | null;
  images?: CompletionImageItem[];
}

export interface CompletionChoice {
  index: number;
  message: CompletionMessage;
  finish_reason: string | null;
}

export interface CompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  total_cost?: number;
}

export interface CompletionResponse {
  id: string;
  choices: CompletionChoice[];
  usage?: CompletionUsage;
}
