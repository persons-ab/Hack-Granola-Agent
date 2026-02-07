import { ai } from "../../ai/models.js";
import type { ActionItem } from "../../granola/types.js";
import { getProvidersByType } from "../../providers/registry.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

async function generatePRD(item: ActionItem): Promise<string> {
  return await ai(
    `You are a product manager. Given a feature request from a meeting, write a concise PRD (Product Requirements Document).

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
    `Feature request: ${item.task}${item.context ? `\n\nContext from meeting: ${item.context}` : ""}`,
  );
}

export const featureHandler: ActionHandler = {
  type: "feature",

  async execute(item: ActionItem, _ctx: SlackContext): Promise<HandlerResult> {
    const providers = getProvidersByType("task-manager");
    if (providers.length === 0) {
      return { success: false, statusText: "No task-manager provider configured", error: "no_provider" };
    }

    const provider = providers[0];
    const assigneeName = item.assigneeFullName || item.assignee;

    // Generate PRD
    const prd = await generatePRD(item);

    // Create issue with PRD as description
    const created = await provider.createItem({
      title: `[Feature] ${item.task}`,
      description: prd,
      assignee: assigneeName || undefined,
      assigneeEmail: item.assigneeEmail,
      type: "prd",
    });

    return {
      success: true,
      item: created,
      statusText: `Feature PRD created: ${created.title}`,
    };
  },
};
