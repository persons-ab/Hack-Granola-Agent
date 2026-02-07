import type { WebClient } from "@slack/web-api";
import OpenAI from "openai";
import { config } from "../config.js";
import { getProvider, getProvidersByType } from "./registry.js";
import type { CreatedItem, CreateItemParams } from "./types.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

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

async function extractActionFields(text: string): Promise<ExtractedAction> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract a work item from the user text. Return JSON:
{"title": "short actionable title (start with verb)", "description": "detailed description", "assigneeName": "person name or null", "type": "issue"}
Type must be one of: "issue", "pr", "prd", "bug", "task".`,
      },
      { role: "user", content: text },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return {
    title: parsed.title || "Untitled",
    description: parsed.description || "",
    assigneeName: parsed.assigneeName || null,
    type: parsed.type || "issue",
  };
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
