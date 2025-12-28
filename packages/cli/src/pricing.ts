/**
 * Pricing data fetcher using LiteLLM as source
 * Features disk caching with 1-hour TTL
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export function normalizeModelName(modelId: string): string | null {
  const lower = modelId.toLowerCase();

  if (lower.includes("opus")) {
    if (lower.includes("4.5") || lower.includes("4-5")) {
      return "opus-4-5";
    } else if (lower.includes("4")) {
      return "opus-4";
    }
  }
  if (lower.includes("sonnet")) {
    if (lower.includes("4.5") || lower.includes("4-5")) {
      return "sonnet-4-5";
    } else if (lower.includes("4")) {
      return "sonnet-4";
    } else if (lower.includes("3.7") || lower.includes("3-7")) {
      return "sonnet-3-7";
    } else if (lower.includes("3.5") || lower.includes("3-5")) {
      return "sonnet-3-5";
    }
  }
  if (lower.includes("haiku") && (lower.includes("4.5") || lower.includes("4-5"))) {
    return "haiku-4-5";
  }

  if (lower === "o3") {
    return "o3";
  }
  if (lower.startsWith("gpt-4o") || lower === "gpt-4o") {
    return "gpt-4o";
  }
  if (lower.startsWith("gpt-4.1") || lower.includes("gpt-4.1")) {
    return "gpt-4.1";
  }

  if (lower.includes("gemini-2.5-pro")) {
    return "gemini-2.5-pro";
  }
  if (lower.includes("gemini-2.5-flash")) {
    return "gemini-2.5-flash";
  }

  return null;
}

export function isWordBoundaryMatch(haystack: string, needle: string): boolean {
  const pos = haystack.indexOf(needle);
  if (pos === -1) return false;

  const beforeOk = pos === 0 || !/[a-zA-Z0-9]/.test(haystack[pos - 1]);
  const afterOk =
    pos + needle.length === haystack.length ||
    !/[a-zA-Z0-9]/.test(haystack[pos + needle.length]);

  return beforeOk && afterOk;
}

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const OPENROUTER_CACHE_FILENAME = "openrouter-pricing.json";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DEFAULT_FETCH_RETRIES = 2;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

function getFetchRetries(): number {
  const env = process.env.TOKSCALE_FETCH_RETRIES;
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_FETCH_RETRIES;
}

interface FetchWithRetryOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

/** Respects Retry-After header (integer seconds only, no HTTP-date) */
async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { headers, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, retries = getFetchRetries() } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      if (response.ok) {
        return response;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        let delay = 1000 * (attempt + 1);

        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            delay = Math.min(parsed * 1000, 5000);
          }
        }

        if (process.env.DEBUG) {
          console.warn(`[Fetch] HTTP ${response.status} for ${url}, retrying in ${delay}ms...`);
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        const delay = 1000 * (attempt + 1);
        if (process.env.DEBUG) {
          console.warn(`[Fetch] Error for ${url}: ${lastError.message}, retrying in ${delay}ms...`);
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

/**
 * Response from /api/v1/models/{author}/{slug}/endpoints
 * Contains all available providers for a specific model
 */
export interface OpenRouterEndpoint {
  name: string;                 // e.g., "Z.AI | z-ai/glm-4.7-20251222"
  model_name: string;           // e.g., "Z.AI: GLM 4.7"
  provider_name: string;         // e.g., "Z.AI", "DeepInfra", "Chutes"
  pricing: {
    prompt: string;              // Cost per input token (string format)
    completion: string;          // Cost per output token (string format)
    input_cache_read?: string;   // Cache read cost (optional)
    input_cache_write?: string;  // Cache write cost (optional)
  };
}

export interface OpenRouterEndpointsResponse {
  data: {
    id: string;                  // e.g., "z-ai/glm-4.7"
    name: string;                // e.g., "Z.AI: GLM 4.7"
    endpoints: OpenRouterEndpoint[];
  };
}

// Manual mapping from model IDs to OpenRouter model IDs
// Format: { "local-model-id": "openrouter-provider/model-id" }
export const OPENROUTER_MODEL_MAPPING: Record<string, string> = {
  "glm-4.7": "z-ai/glm-4.7",
  "glm-4.7-free": "z-ai/glm-4.7",
};

// Mapping for author names that don't match provider names exactly
// Used to find the correct provider endpoint in OpenRouter API
const OPENROUTER_PROVIDER_NAME_MAPPING: Record<string, string> = {
  "z-ai": "Z.AI",
};

export interface LiteLLMModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}

export type PricingDataset = Record<string, LiteLLMModelPricing>;

interface CachedPricing {
  timestamp: number;
  data: PricingDataset;
}

interface CachedOpenRouterPricing {
  timestamp: number;
  data: Record<string, LiteLLMModelPricing>;
}

/**
 * Format for passing pricing to Rust native module
 * Note: napi-rs expects undefined (not null) for Rust Option<T> fields
 */
export interface PricingEntry {
  modelId: string;
  pricing: {
    inputCostPerToken: number;
    outputCostPerToken: number;
    cacheReadInputTokenCost?: number;
    cacheCreationInputTokenCost?: number;
  };
}

export type PricingSource = "litellm" | "openrouter";

export interface PricingLookupResult {
  pricing: LiteLLMModelPricing;
  source: PricingSource;
  matchedKey: string;
}

function getCacheDir(): string {
  const cacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(cacheHome, "tokscale");
}

function getCachePath(): string {
  return path.join(getCacheDir(), "pricing.json");
}

function loadCachedPricing(): CachedPricing | null {
  try {
    const cachePath = getCachePath();
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const content = fs.readFileSync(cachePath, "utf-8");
    const cached = JSON.parse(content) as CachedPricing;

    // Check TTL
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL_MS) {
      return null; // Cache expired
    }

    return cached;
  } catch {
    return null;
  }
}

function saveCachedPricing(data: PricingDataset): void {
  try {
    const cacheDir = getCacheDir();
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cached: CachedPricing = {
      timestamp: Date.now(),
      data,
    };

    fs.writeFileSync(getCachePath(), JSON.stringify(cached), "utf-8");
  } catch {
    // Ignore cache write errors
  }
}

// OpenRouter cache functions
function getOpenRouterCachePath(): string {
  return path.join(getCacheDir(), OPENROUTER_CACHE_FILENAME);
}

function loadCachedOpenRouterPricing(): CachedOpenRouterPricing | null {
  const cachePath = getOpenRouterCachePath();
  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const content = fs.readFileSync(cachePath, "utf-8");
    const cached = JSON.parse(content) as CachedOpenRouterPricing;

    if (!Number.isFinite(cached?.timestamp) || typeof cached?.data !== "object" || cached.data === null || Array.isArray(cached.data)) {
      fs.unlinkSync(cachePath);
      return null;
    }

    if (Object.keys(cached.data).length === 0) {
      fs.unlinkSync(cachePath);
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL_MS) {
      return null;
    }

    return cached;
  } catch {
    try { fs.unlinkSync(cachePath); } catch {}
    return null;
  }
}

function saveOpenRouterCachedPricing(data: Record<string, LiteLLMModelPricing>): void {
  try {
    const cacheDir = getCacheDir();
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const cached: CachedOpenRouterPricing = {
      timestamp: Date.now(),
      data,
    };

    fs.writeFileSync(getOpenRouterCachePath(), JSON.stringify(cached), "utf-8");
  } catch {
    // Ignore cache write errors
  }
}

function parsePrice(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) return null;
    return num;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }
  return null;
}

async function fetchModelEndpoints(
  author: string,
  slug: string
): Promise<LiteLLMModelPricing | null> {
  const url = `https://openrouter.ai/api/v1/models/${author}/${slug}/endpoints`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetchWithRetry(url, { headers, timeoutMs: 10000 });
  } catch (err) {
    if (process.env.DEBUG) {
      console.warn(`[OpenRouter] Fetch failed for ${author}/${slug}:`, (err as Error).message || err);
    }
    return null;
  }

  if (!response.ok) {
    if (process.env.DEBUG) {
      console.warn(`[OpenRouter] HTTP ${response.status} for ${author}/${slug}`);
    }
    return null;
  }

  const apiResponse = await response.json() as OpenRouterEndpointsResponse;

  if (!apiResponse?.data?.endpoints || !Array.isArray(apiResponse.data.endpoints)) {
    if (process.env.DEBUG) {
      console.warn(`[OpenRouter] Invalid response shape for ${author}/${slug}`);
    }
    return null;
  }

  const expectedProvider = OPENROUTER_PROVIDER_NAME_MAPPING[author.toLowerCase()] || author;

  const authorEndpoint = apiResponse.data.endpoints.find(
    endpoint => endpoint.provider_name?.toLowerCase() === expectedProvider.toLowerCase()
  );

  if (!authorEndpoint) {
    if (process.env.DEBUG) {
      console.warn(`[OpenRouter] Author provider "${expectedProvider}" not found for ${author}/${slug}`);
    }
    return null;
  }

  const inputCost = parsePrice(authorEndpoint.pricing?.prompt);
  const outputCost = parsePrice(authorEndpoint.pricing?.completion);

  if (inputCost === null || outputCost === null) {
    if (process.env.DEBUG) {
      const reason = String(authorEndpoint.pricing?.prompt) === "-1" || String(authorEndpoint.pricing?.completion) === "-1"
        ? "pricing unavailable (TBD)"
        : "invalid pricing values";
      console.warn(`[OpenRouter] ${reason} for ${author}/${slug}`);
    }
    return null;
  }

  return {
    input_cost_per_token: inputCost,
    output_cost_per_token: outputCost,
    cache_read_input_token_cost: parsePrice(authorEndpoint.pricing?.input_cache_read) ?? undefined,
    cache_creation_input_token_cost: parsePrice(authorEndpoint.pricing?.input_cache_write) ?? undefined,
  };
}

export class PricingFetcher {
  private pricingData: PricingDataset | null = null;
  private sortedPricingKeys: string[] | null = null;
  private openRouterData: Record<string, LiteLLMModelPricing> | null = null;

  /**
   * Fetch pricing data (with disk cache, 1-hour TTL)
   * Also fetches OpenRouter pricing in parallel for fallback
   */
  async fetchPricing(): Promise<PricingDataset> {
    if (this.pricingData && this.openRouterData) return this.pricingData;

    // Try to load from cache first
    const cachedLiteLLM = loadCachedPricing();
    const cachedOpenRouter = loadCachedOpenRouterPricing();

    // Load LiteLLM from cache or fetch
    if (cachedLiteLLM) {
      this.pricingData = cachedLiteLLM.data;
      this.sortedPricingKeys = Object.keys(this.pricingData).sort();
    }

    // Load OpenRouter from cache or fetch
    if (cachedOpenRouter) {
      this.openRouterData = cachedOpenRouter.data;
    }

    // If both caches are loaded, we're done
    if (this.pricingData && this.openRouterData) {
      return this.pricingData;
    }

    // Fetch what's missing in parallel
    const promises: Promise<unknown>[] = [];

    if (!this.pricingData) {
      promises.push(this.fetchLiteLLMPricing());
    }

    if (!this.openRouterData) {
      promises.push(
        this.fetchOpenRouterPricing().catch((err) => {
          if (process.env.DEBUG) {
            console.warn("[OpenRouter] Fallback pricing fetch failed:", err.message || err);
          }
          this.openRouterData = {};
        })
      );
    }

    await Promise.all(promises);

    this.openRouterData ??= {};

    // Ensure pricingData is set (should always be true at this point)
    if (!this.pricingData) {
      throw new Error("Failed to fetch LiteLLM pricing");
    }

    return this.pricingData;
  }

  private async fetchLiteLLMPricing(): Promise<PricingDataset> {
    const response = await fetchWithRetry(LITELLM_PRICING_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.status}`);
    }

    this.pricingData = (await response.json()) as PricingDataset;
    this.sortedPricingKeys = Object.keys(this.pricingData).sort();

    saveCachedPricing(this.pricingData);

    return this.pricingData;
  }

  /**
   * Get raw pricing dataset
   */
  getPricingData(): PricingDataset | null {
    return this.pricingData;
  }

  /**
   * Convert pricing data to format expected by Rust native module
   * Includes both LiteLLM and OpenRouter fallback pricing
   */
  toPricingEntries(): PricingEntry[] {
    const entries: PricingEntry[] = [];

    // Add LiteLLM pricing
    if (this.pricingData) {
      for (const [modelId, pricing] of Object.entries(this.pricingData)) {
        entries.push({
          modelId,
          pricing: {
            inputCostPerToken: pricing.input_cost_per_token ?? 0,
            outputCostPerToken: pricing.output_cost_per_token ?? 0,
            // napi-rs expects undefined (not null) for Option<T> fields
            cacheReadInputTokenCost: pricing.cache_read_input_token_cost,
            cacheCreationInputTokenCost: pricing.cache_creation_input_token_cost,
          },
        });
      }
    }

    // Add OpenRouter fallback pricing for mapped models (if not already in LiteLLM)
    if (this.openRouterData) {
      for (const [localModelId, openRouterModelId] of Object.entries(OPENROUTER_MODEL_MAPPING)) {
        // Skip if already exists in LiteLLM
        if (this.pricingData && this.pricingData[localModelId]) continue;

        const pricing = this.openRouterData[openRouterModelId];
        if (pricing) {
          entries.push({
            modelId: localModelId,
            pricing: {
              inputCostPerToken: pricing.input_cost_per_token ?? 0,
              outputCostPerToken: pricing.output_cost_per_token ?? 0,
              cacheReadInputTokenCost: pricing.cache_read_input_token_cost,
              cacheCreationInputTokenCost: pricing.cache_creation_input_token_cost,
            },
          });
        }
      }
    }

    return entries;
  }

  getModelPricing(modelID: string): LiteLLMModelPricing | null {
    if (!this.pricingData) return null;

    // Direct lookup
    if (this.pricingData[modelID]) {
      return this.pricingData[modelID];
    }

    // Try with provider prefix
    const prefixes = ["anthropic/", "openai/", "google/", "bedrock/", "openrouter/"];
    for (const prefix of prefixes) {
      if (this.pricingData[prefix + modelID]) {
        return this.pricingData[prefix + modelID];
      }
    }

    const normalized = normalizeModelName(modelID);
    if (normalized) {
      if (this.pricingData[normalized]) {
        return this.pricingData[normalized];
      }
      for (const prefix of prefixes) {
        if (this.pricingData[prefix + normalized]) {
          return this.pricingData[prefix + normalized];
        }
      }
    }

    const lowerModelID = modelID.toLowerCase();
    const lowerNormalized = normalized?.toLowerCase();
    const sortedKeys = this.sortedPricingKeys || Object.keys(this.pricingData).sort();

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      if (isWordBoundaryMatch(lowerKey, lowerModelID)) {
        return this.pricingData[key];
      }
      if (lowerNormalized && isWordBoundaryMatch(lowerKey, lowerNormalized)) {
        return this.pricingData[key];
      }
    }

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      if (isWordBoundaryMatch(lowerModelID, lowerKey)) {
        return this.pricingData[key];
      }
      if (lowerNormalized && isWordBoundaryMatch(lowerNormalized, lowerKey)) {
        return this.pricingData[key];
      }
    }

    // Fallback to OpenRouter for mapped models
    return this.getOpenRouterPricing(modelID);
  }

  getModelPricingWithSource(modelID: string): PricingLookupResult | null {
    if (!this.pricingData) return null;

    if (this.pricingData[modelID]) {
      return { pricing: this.pricingData[modelID], source: "litellm", matchedKey: modelID };
    }

    const prefixes = ["anthropic/", "openai/", "google/", "bedrock/", "openrouter/"];
    for (const prefix of prefixes) {
      const key = prefix + modelID;
      if (this.pricingData[key]) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
    }

    const normalized = normalizeModelName(modelID);
    if (normalized) {
      if (this.pricingData[normalized]) {
        return { pricing: this.pricingData[normalized], source: "litellm", matchedKey: normalized };
      }
      for (const prefix of prefixes) {
        const key = prefix + normalized;
        if (this.pricingData[key]) {
          return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
        }
      }
    }

    const lowerModelID = modelID.toLowerCase();
    const lowerNormalized = normalized?.toLowerCase();
    const sortedKeys = this.sortedPricingKeys || Object.keys(this.pricingData).sort();

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      if (isWordBoundaryMatch(lowerKey, lowerModelID)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
      if (lowerNormalized && isWordBoundaryMatch(lowerKey, lowerNormalized)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
    }

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      if (isWordBoundaryMatch(lowerModelID, lowerKey)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
      if (lowerNormalized && isWordBoundaryMatch(lowerNormalized, lowerKey)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
    }

    return this.getOpenRouterPricingWithSource(modelID);
  }

  getModelPricingFromProvider(modelID: string, provider: PricingSource): PricingLookupResult | null {
    if (provider === "litellm") {
      return this.getLiteLLMPricingWithSource(modelID);
    }
    return this.getOpenRouterPricingWithSource(modelID);
  }

  private getLiteLLMPricingWithSource(modelID: string): PricingLookupResult | null {
    if (!this.pricingData) return null;

    if (this.pricingData[modelID]) {
      return { pricing: this.pricingData[modelID], source: "litellm", matchedKey: modelID };
    }

    const prefixes = ["anthropic/", "openai/", "google/", "bedrock/", "openrouter/"];
    for (const prefix of prefixes) {
      const key = prefix + modelID;
      if (this.pricingData[key]) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
    }

    const normalized = normalizeModelName(modelID);
    if (normalized) {
      if (this.pricingData[normalized]) {
        return { pricing: this.pricingData[normalized], source: "litellm", matchedKey: normalized };
      }
      for (const prefix of prefixes) {
        const key = prefix + normalized;
        if (this.pricingData[key]) {
          return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
        }
      }
    }

    const lowerModelID = modelID.toLowerCase();
    const lowerNormalized = normalized?.toLowerCase();
    const sortedKeys = this.sortedPricingKeys || Object.keys(this.pricingData).sort();

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      if (isWordBoundaryMatch(lowerKey, lowerModelID)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
      if (lowerNormalized && isWordBoundaryMatch(lowerKey, lowerNormalized)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
    }

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      if (isWordBoundaryMatch(lowerModelID, lowerKey)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
      if (lowerNormalized && isWordBoundaryMatch(lowerNormalized, lowerKey)) {
        return { pricing: this.pricingData[key], source: "litellm", matchedKey: key };
      }
    }

    return null;
  }

  calculateCost(
    tokens: {
      input: number;
      output: number;
      reasoning?: number;
      cacheRead: number;
      cacheWrite: number;
    },
    pricing: LiteLLMModelPricing
  ): number {
    const inputCost = tokens.input * (pricing.input_cost_per_token ?? 0);
    const outputCost =
      (tokens.output + (tokens.reasoning ?? 0)) * (pricing.output_cost_per_token ?? 0);
    const cacheWriteCost =
      tokens.cacheWrite * (pricing.cache_creation_input_token_cost ?? 0);
    const cacheReadCost =
      tokens.cacheRead * (pricing.cache_read_input_token_cost ?? 0);

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }

  /**
   * Fetch OpenRouter pricing data (lazy loading with disk cache)
   *
   * When called without modelID: loads from cache only (no network)
   * When called with modelID: fetches only that model's endpoints
   *
   * @param modelID - Optional OpenRouter model ID to fetch (e.g., "z-ai/glm-4.7")
   */
  private async fetchOpenRouterPricing(
    modelID?: string
  ): Promise<Record<string, LiteLLMModelPricing>> {
    if (this.openRouterData) return this.openRouterData;

    const cached = loadCachedOpenRouterPricing();
    if (cached) {
      this.openRouterData = cached.data;
      return this.openRouterData;
    }

    const normalizedData: Record<string, LiteLLMModelPricing> = {};

    if (!modelID) {
      const uniqueOpenRouterIds = [...new Set(Object.values(OPENROUTER_MODEL_MAPPING))];

      await Promise.all(
        uniqueOpenRouterIds.map(async (openRouterModelId) => {
          const [author, slug] = openRouterModelId.split('/');
          if (!author || !slug) return;

          const pricing = await fetchModelEndpoints(author, slug);
          if (pricing) {
            normalizedData[openRouterModelId] = pricing;
          }
        })
      );
    } else {
      const [author, slug] = modelID.split('/');
      if (author && slug) {
        const pricing = await fetchModelEndpoints(author, slug);
        if (pricing) {
          normalizedData[modelID] = pricing;
        }
      }
    }

    this.openRouterData = normalizedData;

    if (Object.keys(normalizedData).length > 0) {
      saveOpenRouterCachedPricing(this.openRouterData);
    }

    return this.openRouterData;
  }

  private getOpenRouterPricing(modelID: string): LiteLLMModelPricing | null {
    const result = this.getOpenRouterPricingWithSource(modelID);
    return result?.pricing ?? null;
  }

  private getOpenRouterPricingWithSource(modelID: string): PricingLookupResult | null {
    if (!this.openRouterData) return null;

    let lowerModelID = modelID.toLowerCase();

    const prefixes = ["anthropic/", "openai/", "google/", "bedrock/", "openrouter/"];
    for (const prefix of prefixes) {
      if (lowerModelID.startsWith(prefix)) {
        lowerModelID = lowerModelID.slice(prefix.length);
        break;
      }
    }

    const openRouterID = OPENROUTER_MODEL_MAPPING[lowerModelID];

    if (openRouterID && this.openRouterData[openRouterID]) {
      return {
        pricing: this.openRouterData[openRouterID],
        source: "openrouter",
        matchedKey: openRouterID,
      };
    }

    return null;
  }
}

/**
 * Clear pricing cache (for testing or forced refresh)
 */
export function clearPricingCache(): void {
  try {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Clear OpenRouter pricing cache (for testing or forced refresh)
 */
export function clearOpenRouterPricingCache(): void {
  try {
    const cachePath = getOpenRouterCachePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch {
    // Ignore errors
  }
}
