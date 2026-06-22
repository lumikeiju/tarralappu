import type { ModelCapabilities, CompletionResponse } from "./types";

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
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
