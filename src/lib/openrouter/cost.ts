import type {
  ModelCapabilities,
  ModelPricing,
  CompletionResponse
} from "./types";

/**
 * Pre-send cost estimate in USD.
 * Returns null when pricing is unknown (all fields are "0").
 * OPEN-2: verify exact field names against a live response.
 */
export function estimateCost(
  capabilities: ModelCapabilities,
  imageCount = 1
): number | null {
  const { pricing } = capabilities;
  const imageCost = parseFloat(pricing?.image ?? "0");
  const requestCost = parseFloat(pricing?.request ?? "0");

  if (imageCost > 0) return imageCost * imageCount + requestCost;
  if (requestCost > 0) return requestCost;
  return null;
}

/**
 * Parse actual cost from the usage field of a completion response.
 * OPEN-2: some image models return cost under total_cost, others under cost.
 */
export function parseCostFromResponse(
  response: CompletionResponse
): number | null {
  if (!response.usage) return null;
  const u = response.usage as Record<string, unknown>;
  const cost = u["total_cost"] ?? u["cost"];
  if (typeof cost === "number" && cost >= 0) return cost;
  return null;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  let fixed: string;
  if (usd < 0.001) fixed = usd.toFixed(5);
  else if (usd < 0.01) fixed = usd.toFixed(4);
  else if (usd < 1) fixed = usd.toFixed(3);
  else fixed = usd.toFixed(2);
  // Trim redundant trailing zeros ("$12.00" -> "$12", "$0.250" -> "$0.25")
  // without collapsing an all-zero fraction produced above (usd !== 0 here).
  if (fixed.includes(".")) {
    fixed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  }
  return `$${fixed}`;
}

/** OpenRouter convention: a model id suffixed `:free` has no charge at all. */
function isFreeModelId(modelId: string): boolean {
  return modelId.endsWith(":free");
}

/**
 * Format a model's per-unit pricing for inline display (e.g. in the model
 * picker), per the Pricing Object fields documented at
 * https://openrouter.ai/docs/guides/overview/models#pricing-object
 * All values are USD per token/request/unit. A literal `"0"` is ambiguous —
 * it can mean the model is genuinely free, or that this billing dimension
 * simply isn't captured by these fields (common for flat-fee image models).
 * We disambiguate using OpenRouter's `:free` model-id suffix convention;
 * everything else that's all-zero is treated as "not listed", not "free".
 * Returns null when no pricing dimension has a positive value (and the
 * model isn't tagged `:free`).
 */
export function formatModelPricing(
  pricing: ModelPricing,
  modelId: string
): string | null {
  if (isFreeModelId(modelId)) return "Free";

  const prompt = parseFloat(pricing.prompt ?? "0");
  const completion = parseFloat(pricing.completion ?? "0");
  const image = parseFloat(pricing.image ?? "0");
  const request = parseFloat(pricing.request ?? "0");

  const parts: string[] = [];
  if (prompt > 0) parts.push(`${formatUsd(prompt * 1_000_000)}/1M in`);
  if (completion > 0) parts.push(`${formatUsd(completion * 1_000_000)}/1M out`);
  if (image > 0) parts.push(`${formatUsd(image)}/input img`);
  if (request > 0) parts.push(`${formatUsd(request)}/request`);

  return parts.length > 0 ? parts.join(" \u00b7 ") : null;
}

export type PricingTier = "$" | "$$" | "$$$";

/**
 * Rough at-a-glance cost tier for a model, for a small "$"/"$$"/"$$$" badge.
 * Approximate by design — it picks whichever pricing dimension is populated
 * (output/completion token cost is preferred, since that's how most image
 * models bill generation; falls back to per-input-image or flat per-request
 * cost) and buckets it. Dimensions aren't directly comparable across
 * billing schemes, so treat this as a relative hint, not an exact ranking.
 * Returns null when no pricing dimension is populated (nothing to base a
 * tier on — matches when `formatModelPricing` also returns null).
 */
export function pricingTier(
  pricing: ModelPricing,
  modelId: string
): PricingTier | null {
  if (isFreeModelId(modelId)) return "$";

  const prompt = parseFloat(pricing.prompt ?? "0");
  const completion = parseFloat(pricing.completion ?? "0");
  const image = parseFloat(pricing.image ?? "0");
  const request = parseFloat(pricing.request ?? "0");

  if (completion > 0 || prompt > 0) {
    const perMillion = (completion || prompt) * 1_000_000;
    if (perMillion < 3) return "$";
    if (perMillion < 10) return "$$";
    return "$$$";
  }
  if (image > 0) {
    if (image < 0.02) return "$";
    if (image < 0.05) return "$$";
    return "$$$";
  }
  if (request > 0) {
    if (request < 0.005) return "$";
    if (request < 0.02) return "$$";
    return "$$$";
  }
  return null;
}
