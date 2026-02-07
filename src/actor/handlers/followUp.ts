import type { ActionItem } from "../../granola/types.js";
import type { ActionHandler, HandlerResult, SlackContext } from "./types.js";

export const followUpHandler: ActionHandler = {
  type: "follow_up",

  async execute(item: ActionItem, _ctx: SlackContext): Promise<HandlerResult> {
    const assigneeName = item.assigneeFullName || item.assignee || "team";

    return {
      success: true,
      statusText: `Reminder for ${assigneeName}: ${item.task}`,
    };
  },
};
