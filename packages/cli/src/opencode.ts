/**
 * OpenCode session data reader
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
}

export interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: "assistant" | "user";
  modelID?: string;
  providerID?: string;
  cost: number;
  tokens?: TokenUsage;
  time: {
    created: number;
    completed?: number;
  };
}

export interface OpenCodeUsageData {
  source: "opencode";
  modelID: string;
  providerID: string;
  messageCount: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export function getOpenCodeStoragePath(): string {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "opencode", "storage");
}

export function readOpenCodeMessages(): OpenCodeMessage[] {
  const storagePath = getOpenCodeStoragePath();
  const messagePath = path.join(storagePath, "message");

  if (!fs.existsSync(messagePath)) {
    return [];
  }

  const messages: OpenCodeMessage[] = [];
  const sessionDirs = fs
    .readdirSync(messagePath)
    .map((dir) => path.join(messagePath, dir))
    .filter((dir) => fs.statSync(dir).isDirectory());

  for (const sessionDir of sessionDirs) {
    const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(sessionDir, file), "utf-8");
        const msg = JSON.parse(content);

        if (msg.role === "assistant" && msg.tokens) {
          messages.push(msg as OpenCodeMessage);
        }
      } catch {
        // Skip malformed files
      }
    }
  }

  return messages;
}

export function aggregateOpenCodeByModel(messages: OpenCodeMessage[]): Map<string, OpenCodeUsageData> {
  const summaries = new Map<string, OpenCodeUsageData>();

  for (const msg of messages) {
    if (!msg.modelID || !msg.tokens) continue;

    const key = `${msg.providerID}/${msg.modelID}`;

    let summary = summaries.get(key);
    if (!summary) {
      summary = {
        source: "opencode",
        modelID: msg.modelID,
        providerID: msg.providerID || "unknown",
        messageCount: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      };
      summaries.set(key, summary);
    }

    summary.messageCount++;
    summary.input += msg.tokens.input;
    summary.output += msg.tokens.output;
    summary.reasoning += msg.tokens.reasoning || 0;
    summary.cacheRead += msg.tokens.cache.read;
    summary.cacheWrite += msg.tokens.cache.write;
  }

  return summaries;
}
