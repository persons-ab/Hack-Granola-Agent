import type { WebClient } from "@slack/web-api";
import { aiJSON } from "../ai/models.js";
import { getProvider, getProvidersByType } from "./registry.js";
import type { CreatedItem, CreateItemParams } from "./types.js";

interface ExtractedAction {
  title: string;
  description: string;
  assigneeName: string | null;
  type: CreateItemParams["type"];
}

interface ResolvedAssignee {
  name: string;
  email?: string;
}

function createSemaphore(max: number) {
  let current = 0;
  const queue: Array<() => void> = [];

  async function acquire(): Promise<() => void> {
    if (current < max) {
      current++;
      return () => {
        current--;
        const next = queue.shift();
        if (next) next();
      };
    }

    await new Promise<void>((resolve) => queue.push(resolve));
    current++;
    return () => {
      current--;
      const next = queue.shift();
      if (next) next();
    };
  }

  return { acquire };
}

const OPENAI_CONCURRENCY = Math.max(1, parseInt(process.env.OPENAI_CONCURRENCY || "2", 10));
const openAISemaphore = createSemaphore(OPENAI_CONCURRENCY);

function parseRetryAfterMs(err: unknown): number | null {
  const anyErr = err as any;
  const headerVal =
    anyErr?.headers?.["retry-after"] ??
    anyErr?.response?.headers?.["retry-after"] ??
    anyErr?.cause?.headers?.["retry-after"];

  if (headerVal == null) return null;
  const asNum = typeof headerVal === "string" ? Number(headerVal) : Number(headerVal);
  if (!Number.isFinite(asNum) || asNum <= 0) return null;
  // retry-after is seconds
  return Math.round(asNum * 1000);
}

function isOpenAIRateLimit(err: unknown): boolean {
  const anyErr = err as any;
  const status = anyErr?.status ?? anyErr?.response?.status ?? anyErr?.cause?.status;
  if (status === 429) return true;

  const msg = String(anyErr?.message || "").toLowerCase();
  // OpenAI commonly returns 429 with messaging about "quota"/"billing" or "rate limit"
  return msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("quota") || msg.includes("billing") || msg.includes("429");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRateLimitRetries<T>(fn: () => Promise<T>): Promise<T> {
  // Keep this conservative: retries help smooth peak-hour bursts without endlessly hammering OpenAI.
  const maxAttempts = Math.max(1, parseInt(process.env.OPENAI_RETRY_ATTEMPTS || "5", 10));
  const baseDelayMs = Math.max(50, parseInt(process.env.OPENAI_RETRY_BASE_DELAY_MS || "500", 10));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isOpenAIRateLimit(err) || attempt === maxAttempts) break;

      const retryAfterMs = parseRetryAfterMs(err);
      const backoffMs = retryAfterMs ?? Math.round(baseDelayMs * Math.pow(2, attempt - 1));
      const jitterMs = Math.round(Math.random() * Math.min(250, backoffMs * 0.2));
      await sleep(backoffMs + jitterMs);
    }
  }
  throw lastErr;
}

async function extractActionFields(text: string): Promise<ExtractedAction> {
  // Limit concurrent OpenAI calls and retry on 429s (often surfaced as "check billing" during peak load).
  const release = await openAISemaphore.acquire();
  try {
    const parsed = await withRateLimitRetries(() =>
      aiJSON<ExtractedAction>(
        `Extract a work item from the user text. Return JSON:
{"title": "short actionable title (start with verb)", "description": "detailed description", "assigneeName": "person name or null", "type": "issue"}
Type must be one of: "issue", "pr", "prd", "bug", "task".`,
        text,
      ),
    );

    return {
      title: parsed.title || "Untitled",
      description: parsed.description || "",
      assigneeName: parsed.assigneeName || null,
      type: parsed.type || "issue",
    };
  } finally {
    release();
  }
}

export interface ExecuteActionResult {
  item: CreatedItem;
  assigneeName: string | null;
}

/**
 * Execute an action using a specific provider.
 * Follows: Pre-announce → Execute → Notify pattern.
 *
 * When resolvedAssignee is provided (from pipeline participant matching),
 * it is used directly for provider user lookup instead of re-extracting from GPT.
 */
export async function executeAction(
  text: string,
  providerName: string,
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  resolvedAssignee?: ResolvedAssignee
): Promise<ExecuteActionResult> {
  const provider = getProvider(providerName);
  const extracted = await extractActionFields(text);

  // Use resolved assignee from pipeline when available, fall back to GPT extraction
  const assigneeName = resolvedAssignee?.name || extracted.assigneeName;
  const assigneeEmail = resolvedAssignee?.email;

  // Resolve assignee if provider supports it
  const assignee = assigneeName && provider.matchUser
    ? provider.matchUser(assigneeName, assigneeEmail)
    : null;
  const assigneeLabel = assignee?.name || assigneeName || "unassigned";

  // Pre-announce
  await slackClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🔔 Creating ${extracted.type} in *${provider.name}*: *${extracted.title}* → ${assigneeLabel}`,
  });

  // Execute
  const item = await provider.createItem({
    title: extracted.title,
    description: extracted.description,
    assignee: assigneeName || undefined,
    assigneeEmail: assigneeEmail,
    type: extracted.type,
  });

  // Notify
  await slackClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `✅ Created in ${provider.name}: <${item.url}|${item.title}> (${item.id}) — ${assigneeLabel}`,
  });

  return { item, assigneeName: assigneeLabel };
}

/**
 * Execute an action using the first available task-manager provider.
 * Falls back gracefully if none configured.
 */
export async function executeActionAuto(
  text: string,
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  resolvedAssignee?: ResolvedAssignee
): Promise<ExecuteActionResult | null> {
  const taskManagers = getProvidersByType("task-manager");
  if (taskManagers.length === 0) {
    console.log("[executor] No task-manager providers configured, skipping");
    return null;
  }
  return executeAction(text, taskManagers[0].name, slackClient, channel, threadTs, resolvedAssignee);
}
