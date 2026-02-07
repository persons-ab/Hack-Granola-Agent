import type { ActionItem } from "../../granola/types.js";
import { getProvidersByType } from "../../providers/registry.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

export const taskHandler: ActionHandler = {
  type: "task",

  async execute(item: ActionItem, _ctx: SlackContext): Promise<HandlerResult> {
    const providers = getProvidersByType("task-manager");
    if (providers.length === 0) {
      return { success: false, statusText: "No task-manager provider configured", error: "no_provider" };
    }

    const provider = providers[0];
    const assigneeName = item.assigneeFullName || item.assignee;

    const created = await provider.createItem({
      title: item.task,
      description: item.context || item.task,
      assignee: assigneeName || undefined,
      assigneeEmail: item.assigneeEmail,
      type: "task",
    });

    return {
      success: true,
      item: created,
      statusText: `Task created: ${created.title}`,
    };
  },
};
