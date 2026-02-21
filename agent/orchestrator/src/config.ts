import {
  getModel,
  type Api,
  type KnownProvider,
  type Model,
} from "@mariozechner/pi-ai";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { logger } from "./lib/logger.js";

// Auth configuration - share with main pi instance
const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

// Model fallback chain
const MODEL_CHAIN: Array<{ provider: KnownProvider; model: string }> = [
  { provider: "opencode", model: "minimax-m2.5-free" },
  { provider: "opencode", model: "glm-5-free" },
  { provider: "google-antigravity", model: "gemini-3-flash" }
];

const resolveModel = getModel as unknown as (
  provider: KnownProvider,
  modelId: string
) => Model<Api>;

// Cost limits
export const COST_LIMITS = {
  maxCostPerTask: 0.10, // USD per task execution
  maxCostPerHeartbeat: 0.05, // USD per heartbeat cycle
  maxCostPerDay: 3.00, // USD per 24h
  warnAtPercent: 80
};

// Agent loop limits
export const LOOP_LIMITS = {
  maxTurnsPerTask: 20,
  maxTurnsPerHeartbeat: 4,
  taskTimeoutMs: 5 * 60 * 1000, // 5 minutes
  heartbeatIntervalMs: 5 * 60 * 1000, // 5 minutes (avoid rate limits on free models)
  taskPollIntervalMs: 5 * 1000 // 5 seconds
};

export function loadAuth(): Record<string, any> {
  try {
    const raw = readFileSync(AUTH_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logger.error({ err, path: AUTH_PATH }, "Failed to load auth.json");
    throw new Error(`Cannot load auth from ${AUTH_PATH}`);
  }
}

export function getApiKeyForProvider(provider: string): string | undefined {
  try {
    const auth = loadAuth();
    const entry = auth[provider];
    if (!entry) {
      return undefined;
    }

    let key: string | undefined;
    if (entry.type === "api_key" && entry.key) {
      key = entry.key;
    } else if (entry.type === "oauth" && entry.access) {
      key = entry.access;
    } else if (entry.access) {
      key = entry.access;
    }

    // Also set the env var so pi-ai's internal getEnvApiKey() can find it
    if (key && provider === "opencode") {
      process.env.OPENCODE_API_KEY = key;
    }

    return key;
  } catch {
    return undefined;
  }
}

export function getConfiguredModel(): Model<Api> {
  for (const { provider, model } of MODEL_CHAIN) {
    try {
      const m = resolveModel(provider, model);
      const key = getApiKeyForProvider(provider);
      if (!key) {
        logger.warn({ provider, model }, "Model unavailable, missing credentials");
        continue;
      }
      logger.info({ provider, model }, "Using model");
      return m;
    } catch (err) {
      logger.warn({ provider, model, err }, "Model unavailable, trying next");
    }
  }
  throw new Error("No models available in fallback chain");
}
