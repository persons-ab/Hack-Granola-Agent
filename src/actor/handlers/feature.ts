import OpenAI from "openai";
import { config } from "../../config.js";
import type { ActionItem } from "../../granola/types.js";
import { getProvidersByType } from "../../providers/registry.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

async function generatePRD(item: ActionItem): Promise<string> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a product manager. Given a feature request from a meeting, write a concise PRD (Product Requirements Document).

Format:
## Problem
(What problem does this solve?)

## Proposed Solution
(High-level approach)

## Requirements
- (Bullet list of functional requirements)

## Success Criteria
- (How do we know it's done?)

Keep it concise — max 300 words.`,
      },
      {
        role: "user",
        content: `Feature request: ${item.task}${item.context ? `\n\nContext from meeting: ${item.context}` : ""}`,
      },
    ],
  });

  return resp.choices[0]?.message?.content || item.task;
}

export const featureHandler: ActionHandler = {
  type: "feature",

  async execute(item: ActionItem, ctx: SlackContext): Promise<HandlerResult> {
    const providers = getProvidersByType("task-manager");
    if (providers.length === 0) {
      return { success: false, statusText: "No task-manager provider configured", error: "no_provider" };
    }

    const provider = providers[0];
    const assigneeName = item.assigneeFullName || item.assignee;
    const assignee = assigneeName && provider.matchUser
      ? provider.matchUser(assigneeName, item.assigneeEmail)
      : null;
    const assigneeLabel = assignee?.name || assigneeName || "unassigned";

    // Pre-announce
    await ctx.client.chat.postMessage({
      channel: ctx.channel,
      thread_ts: ctx.threadTs,
      text: `📝 Generating PRD for feature: *${item.task}* → ${assigneeLabel}`,
    });

    // Generate PRD via GPT
    const prd = await generatePRD(item);

    // Create issue with PRD as description
    const created = await provider.createItem({
      title: `[Feature] ${item.task}`,
      description: prd,
      assignee: assigneeName || undefined,
      assigneeEmail: item.assigneeEmail,
      type: "prd",
    });

    await ctx.client.chat.postMessage({
      channel: ctx.channel,
      thread_ts: ctx.threadTs,
      text: `✅ Feature PRD created in ${provider.name}: <${created.url}|${created.title}> (${created.id}) → ${assigneeLabel}`,
    });

    return {
      success: true,
      item: created,
      statusText: `Feature PRD created: ${created.title}`,
    };
  },
};
