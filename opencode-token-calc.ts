#!/usr/bin/env npx ts-node

/**
 * OpenCode Token Price Calculator POC
 *
 * This script reads OpenCode session data and calculates token costs by model
 * using LiteLLM pricing data (same source as ccusage).
 *
 * Usage:
 *   npx ts-node opencode-token-calc.ts
 *   # or with deno:
 *   deno run --allow-read --allow-net opencode-token-calc.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Types
// ============================================================================

interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
}

interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  modelID: string;
  providerID: string;
  cost: number;
  tokens: TokenUsage;
  time: {
    created: number;
    completed?: number;
  };
}

interface LiteLLMModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  // Tiered pricing for >200k context
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
  max_tokens?: number;
  max_input_tokens?: number;
}

type PricingDataset = Record<string, LiteLLMModelPricing>;

interface ModelUsageSummary {
  modelID: string;
  providerID: string;
  messageCount: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  calculatedCost: number;
  storedCost: number;
}

// ============================================================================
// Constants
// ============================================================================

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const TIERED_THRESHOLD = 200_000;

// Model name mappings (OpenCode modelID -> LiteLLM model name patterns)
const MODEL_NAME_MAPPINGS: Record<string, string[]> = {
  // Claude models
  "claude-opus-4-5-20251101": ["claude-3-5-opus", "anthropic/claude-3-5-opus"],
  "claude-opus-4-5-high": ["claude-3-5-opus", "anthropic/claude-3-5-opus"],
  "claude-opus-4-20250514": ["claude-3-opus", "anthropic/claude-3-opus"],
  "claude-sonnet-4-20250514": [
    "claude-sonnet-4-20250514",
    "anthropic/claude-sonnet-4-20250514",
  ],
  "claude-sonnet-4-5-20250929": [
    "claude-3-5-sonnet-20241022",
    "anthropic/claude-3-5-sonnet-20241022",
  ],
  "claude-haiku-4-5": [
    "claude-3-5-haiku-20241022",
    "anthropic/claude-3-5-haiku-20241022",
  ],
};

// Fallback pricing if LiteLLM doesn't have the model (per 1M tokens)
const FALLBACK_PRICING: Record<string, LiteLLMModelPricing> = {
  "claude-opus-4-5": {
    input_cost_per_token: 15 / 1_000_000,
    output_cost_per_token: 75 / 1_000_000,
    cache_read_input_token_cost: 1.5 / 1_000_000,
    cache_creation_input_token_cost: 18.75 / 1_000_000,
  },
  "claude-opus-4": {
    input_cost_per_token: 15 / 1_000_000,
    output_cost_per_token: 75 / 1_000_000,
    cache_read_input_token_cost: 1.5 / 1_000_000,
    cache_creation_input_token_cost: 18.75 / 1_000_000,
  },
  "claude-sonnet-4-5": {
    input_cost_per_token: 3 / 1_000_000,
    output_cost_per_token: 15 / 1_000_000,
    cache_read_input_token_cost: 0.3 / 1_000_000,
    cache_creation_input_token_cost: 3.75 / 1_000_000,
  },
  "claude-sonnet-4": {
    input_cost_per_token: 3 / 1_000_000,
    output_cost_per_token: 15 / 1_000_000,
    cache_read_input_token_cost: 0.3 / 1_000_000,
    cache_creation_input_token_cost: 3.75 / 1_000_000,
  },
  "claude-haiku-4-5": {
    input_cost_per_token: 0.8 / 1_000_000,
    output_cost_per_token: 4 / 1_000_000,
    cache_read_input_token_cost: 0.08 / 1_000_000,
    cache_creation_input_token_cost: 1 / 1_000_000,
  },
};

// ============================================================================
// Pricing Fetcher
// ============================================================================

class PricingFetcher {
  private pricingData: PricingDataset | null = null;

  async fetchPricing(): Promise<PricingDataset> {
    if (this.pricingData) return this.pricingData;

    console.log("Fetching pricing data from LiteLLM...");
    const response = await fetch(LITELLM_PRICING_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.status}`);
    }

    this.pricingData = (await response.json()) as PricingDataset;
    console.log(`Loaded pricing for ${Object.keys(this.pricingData).length} models`);
    return this.pricingData;
  }

  getModelPricing(modelID: string): LiteLLMModelPricing | null {
    if (!this.pricingData) return null;

    // Try direct lookup first
    if (this.pricingData[modelID]) {
      return this.pricingData[modelID];
    }

    // Try with provider prefix
    const prefixes = ["anthropic/", "openai/", "google/", "bedrock/"];
    for (const prefix of prefixes) {
      if (this.pricingData[prefix + modelID]) {
        return this.pricingData[prefix + modelID];
      }
    }

    // Try custom mappings
    const mappings = MODEL_NAME_MAPPINGS[modelID];
    if (mappings) {
      for (const mapping of mappings) {
        if (this.pricingData[mapping]) {
          return this.pricingData[mapping];
        }
      }
    }

    // Try fuzzy matching
    const lowerModelID = modelID.toLowerCase();
    for (const [key, pricing] of Object.entries(this.pricingData)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes(lowerModelID) || lowerModelID.includes(lowerKey)) {
        return pricing;
      }
    }

    // Try fallback pricing based on model family
    for (const [family, pricing] of Object.entries(FALLBACK_PRICING)) {
      if (modelID.toLowerCase().includes(family.toLowerCase())) {
        return pricing;
      }
    }

    return null;
  }

  calculateCost(tokens: TokenUsage, pricing: LiteLLMModelPricing): number {
    const calculateTiered = (
      count: number,
      baseRate?: number,
      tieredRate?: number
    ): number => {
      if (!baseRate || count === 0) return 0;

      if (count <= TIERED_THRESHOLD || !tieredRate) {
        return count * baseRate;
      }

      return (
        TIERED_THRESHOLD * baseRate + (count - TIERED_THRESHOLD) * tieredRate
      );
    };

    const inputCost = calculateTiered(
      tokens.input,
      pricing.input_cost_per_token,
      pricing.input_cost_per_token_above_200k_tokens
    );

    const outputCost = calculateTiered(
      tokens.output + tokens.reasoning, // reasoning tokens charged as output
      pricing.output_cost_per_token,
      pricing.output_cost_per_token_above_200k_tokens
    );

    const cacheWriteCost = calculateTiered(
      tokens.cache.write,
      pricing.cache_creation_input_token_cost,
      pricing.cache_creation_input_token_cost_above_200k_tokens
    );

    const cacheReadCost = calculateTiered(
      tokens.cache.read,
      pricing.cache_read_input_token_cost,
      pricing.cache_read_input_token_cost_above_200k_tokens
    );

    return inputCost + outputCost + cacheWriteCost + cacheReadCost;
  }
}

// ============================================================================
// OpenCode Data Reader
// ============================================================================

class OpenCodeReader {
  private storagePath: string;

  constructor() {
    const dataHome =
      process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
    this.storagePath = path.join(dataHome, "opencode", "storage");
  }

  getMessageDirs(): string[] {
    const messagePath = path.join(this.storagePath, "message");
    if (!fs.existsSync(messagePath)) {
      console.error(`Message directory not found: ${messagePath}`);
      return [];
    }

    return fs
      .readdirSync(messagePath)
      .map((dir) => path.join(messagePath, dir))
      .filter((dir) => fs.statSync(dir).isDirectory());
  }

  readAssistantMessages(): AssistantMessage[] {
    const messages: AssistantMessage[] = [];
    const sessionDirs = this.getMessageDirs();

    for (const sessionDir of sessionDirs) {
      const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(sessionDir, file), "utf-8");
          const msg = JSON.parse(content);

          // Only process assistant messages with token data
          if (msg.role === "assistant" && msg.tokens) {
            messages.push(msg as AssistantMessage);
          }
        } catch (e) {
          // Skip malformed files
        }
      }
    }

    return messages;
  }
}

// ============================================================================
// Report Generator
// ============================================================================

function aggregateByModel(
  messages: AssistantMessage[],
  fetcher: PricingFetcher
): Map<string, ModelUsageSummary> {
  const summaries = new Map<string, ModelUsageSummary>();

  for (const msg of messages) {
    const key = `${msg.providerID}/${msg.modelID}`;

    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        modelID: msg.modelID,
        providerID: msg.providerID,
        messageCount: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
        calculatedCost: 0,
        storedCost: 0,
      };
      summaries.set(key, summary);
    }

    summary.messageCount++;
    summary.tokens.input += msg.tokens.input;
    summary.tokens.output += msg.tokens.output;
    summary.tokens.reasoning += msg.tokens.reasoning;
    summary.tokens.cacheRead += msg.tokens.cache.read;
    summary.tokens.cacheWrite += msg.tokens.cache.write;
    summary.tokens.total +=
      msg.tokens.input +
      msg.tokens.output +
      msg.tokens.reasoning +
      msg.tokens.cache.read +
      msg.tokens.cache.write;
    summary.storedCost += msg.cost;

    // Calculate cost using pricing data
    const pricing = fetcher.getModelPricing(msg.modelID);
    if (pricing) {
      summary.calculatedCost += fetcher.calculateCost(msg.tokens, pricing);
    }
  }

  return summaries;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function printReport(summaries: Map<string, ModelUsageSummary>): void {
  console.log("\n" + "=".repeat(100));
  console.log("                    OPENCODE TOKEN USAGE REPORT BY MODEL");
  console.log("=".repeat(100));

  let totalCost = 0;
  let totalTokens = 0;
  let totalMessages = 0;

  // Sort by calculated cost descending
  const sorted = Array.from(summaries.values()).sort(
    (a, b) => b.calculatedCost - a.calculatedCost
  );

  for (const summary of sorted) {
    console.log(`\n┌${"─".repeat(98)}┐`);
    console.log(
      `│ ${summary.providerID}/${summary.modelID}`.padEnd(99) + "│"
    );
    console.log(`├${"─".repeat(98)}┤`);
    console.log(
      `│   Messages: ${formatNumber(summary.messageCount).padStart(15)}`.padEnd(
        99
      ) + "│"
    );
    console.log(
      `│   Input:    ${formatNumber(summary.tokens.input).padStart(
        15
      )} tokens`.padEnd(99) + "│"
    );
    console.log(
      `│   Output:   ${formatNumber(summary.tokens.output).padStart(
        15
      )} tokens`.padEnd(99) + "│"
    );
    console.log(
      `│   Reasoning:${formatNumber(summary.tokens.reasoning).padStart(
        15
      )} tokens`.padEnd(99) + "│"
    );
    console.log(
      `│   Cache Read:${formatNumber(summary.tokens.cacheRead).padStart(
        14
      )} tokens`.padEnd(99) + "│"
    );
    console.log(
      `│   Cache Write:${formatNumber(summary.tokens.cacheWrite).padStart(
        13
      )} tokens`.padEnd(99) + "│"
    );
    console.log(`├${"─".repeat(98)}┤`);
    console.log(
      `│   Calculated Cost: ${formatCost(summary.calculatedCost).padStart(
        10
      )}    (Stored: ${formatCost(summary.storedCost)})`.padEnd(99) + "│"
    );
    console.log(`└${"─".repeat(98)}┘`);

    totalCost += summary.calculatedCost;
    totalTokens += summary.tokens.total;
    totalMessages += summary.messageCount;
  }

  console.log("\n" + "=".repeat(100));
  console.log("                                 TOTALS");
  console.log("=".repeat(100));
  console.log(`  Total Messages:  ${formatNumber(totalMessages)}`);
  console.log(`  Total Tokens:    ${formatNumber(totalTokens)}`);
  console.log(`  Total Cost:      ${formatCost(totalCost)}`);
  console.log("=".repeat(100));
}

// ============================================================================
// Detailed Session Report
// ============================================================================

function printDetailedSessionReport(
  messages: AssistantMessage[],
  fetcher: PricingFetcher
): void {
  // Group by session
  const sessions = new Map<string, AssistantMessage[]>();
  for (const msg of messages) {
    const existing = sessions.get(msg.sessionID) || [];
    existing.push(msg);
    sessions.set(msg.sessionID, existing);
  }

  console.log("\n" + "=".repeat(100));
  console.log("                         DETAILED SESSION BREAKDOWN");
  console.log("=".repeat(100));

  // Sort sessions by total cost
  const sessionCosts: Array<{ sessionID: string; cost: number }> = [];
  for (const [sessionID, msgs] of sessions) {
    let cost = 0;
    for (const msg of msgs) {
      const pricing = fetcher.getModelPricing(msg.modelID);
      if (pricing) {
        cost += fetcher.calculateCost(msg.tokens, pricing);
      }
    }
    sessionCosts.push({ sessionID, cost });
  }

  sessionCosts.sort((a, b) => b.cost - a.cost);

  // Show top 10 most expensive sessions
  console.log("\nTop 10 Most Expensive Sessions:");
  console.log("-".repeat(70));

  for (const { sessionID, cost } of sessionCosts.slice(0, 10)) {
    const msgs = sessions.get(sessionID)!;
    const models = [...new Set(msgs.map((m) => m.modelID))].join(", ");
    console.log(
      `  ${sessionID.slice(0, 30)}... | ${formatCost(cost).padStart(
        10
      )} | ${msgs.length} msgs | ${models}`
    );
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("OpenCode Token Price Calculator POC");
  console.log("===================================\n");

  const fetcher = new PricingFetcher();
  await fetcher.fetchPricing();

  const reader = new OpenCodeReader();
  const messages = reader.readAssistantMessages();

  console.log(`Found ${messages.length} assistant messages`);

  const summaries = aggregateByModel(messages, fetcher);

  printReport(summaries);
  printDetailedSessionReport(messages, fetcher);
}

main().catch(console.error);
